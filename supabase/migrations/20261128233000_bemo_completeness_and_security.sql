-- Migration: 20261128233000_bemo_completeness_and_security.sql
-- Adds Platform Policies CMS, Support/Contact/Appeals/Listing-Report Tickets with Admin Notification routing,
-- Verified Product Reviews & Seller Return Window, Account Username/Optional Phone/Data-Export/Deletion,
-- and Graduated Anti-Overprotection Security Engine & Admin Block Management.

begin;

-- 1. Account Completeness Columns (Optional username & optional phone, no mandatory OTP/MFA)
alter table bemo_private.app_users
  add column if not exists username text unique,
  add column if not exists phone text,
  add column if not exists notification_prefs jsonb not null default '{"orders":true,"security":true,"promos":false}'::jsonb,
  add column if not exists suspended_until timestamptz,
  add column if not exists suspend_reason text,
  add column if not exists suspend_rule text;

alter table bemo_private.app_users
  drop constraint if exists app_users_username_format;
alter table bemo_private.app_users
  add constraint app_users_username_format check (username is null or username ~ '^[a-z0-9_.-]{3,32}$');

-- 2. Seller Configurable Return Window (Return period defined per seller)
alter table bemo_private.store_settings
  add column if not exists return_window_days int not null default 7 check (return_window_days between 0 and 90),
  add column if not exists return_policy_note text not null default '';

-- 3. Platform Legal & Operational Policies CMS (Editable by Admin)
create table if not exists bemo_private.platform_policies (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,50}$'),
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  version int not null default 1,
  requires_legal_review boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references bemo_private.app_users(id)
);
alter table bemo_private.platform_policies enable row level security;
revoke all on bemo_private.platform_policies from public, anon, authenticated;

-- 4. Support Tickets, Contact, Listing Reports, Account Deletion, & False-Positive Unblock Appeals
-- Automatically notifies Admins via bemo_private.notifications without exposing private admin emails/phones
create table if not exists bemo_private.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_type text not null check (ticket_type in ('CONTACT','PROBLEM_REPORT','LISTING_REPORT','BLOCK_APPEAL','DATA_EXPORT','ACCOUNT_DELETE')),
  reporter_id uuid references bemo_private.app_users(id),
  reporter_contact text,
  target_ref text,
  subject text not null check (char_length(trim(subject)) between 3 and 160),
  message text not null check (char_length(trim(message)) between 10 and 3000),
  status text not null default 'OPEN' check (status in ('OPEN','IN_REVIEW','RESOLVED','REJECTED')),
  admin_note text,
  resolved_by uuid references bemo_private.app_users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table bemo_private.support_tickets enable row level security;
revoke all on bemo_private.support_tickets from public, anon, authenticated;

-- 5. Verified Buyer Product Reviews
create table if not exists bemo_private.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references bemo_private.products(id) on delete cascade,
  author_id uuid not null references bemo_private.app_users(id),
  author_name text not null,
  suborder_id uuid references bemo_private.suborders(id),
  rating int not null check (rating between 1 and 5),
  comment text not null check (char_length(trim(comment)) between 3 and 1200),
  created_at timestamptz not null default now(),
  unique (product_id, author_id)
);
alter table bemo_private.product_reviews enable row level security;
revoke all on bemo_private.product_reviews from public, anon, authenticated;

-- 6. Graduated Security & Anti-Overprotection Engine (Monitor Mode + Risk Tiers + Allowlist)
create table if not exists bemo_private.security_config (
  singleton boolean primary key default true check (singleton),
  monitor_mode boolean not null default true,
  quote_per_min int not null default 15,
  order_per_min int not null default 6,
  ticket_per_hour int not null default 10,
  updated_at timestamptz not null default now()
);
insert into bemo_private.security_config default values on conflict do nothing;
alter table bemo_private.security_config enable row level security;
revoke all on bemo_private.security_config from public, anon, authenticated;

create table if not exists bemo_private.security_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references bemo_private.app_users(id),
  scope text not null,
  risk_level text not null check (risk_level in ('LOW','UNUSUAL','MEDIUM','HIGH','CONFIRMED')),
  rule_name text not null,
  action_taken text not null check (action_taken in ('MONITOR','THROTTLE_FEATURE','TEMP_SUSPEND','BLOCKED_ACTION','LIFTED','ALLOWLISTED')),
  detail text not null default '',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists security_events_actor_idx on bemo_private.security_events(actor_id, created_at desc);
alter table bemo_private.security_events enable row level security;
revoke all on bemo_private.security_events from public, anon, authenticated;

create table if not exists bemo_private.security_allowlist (
  actor_id uuid primary key references bemo_private.app_users(id),
  rule_scope text not null default '*',
  reason text not null,
  added_by uuid not null references bemo_private.app_users(id),
  created_at timestamptz not null default now()
);
alter table bemo_private.security_allowlist enable row level security;
revoke all on bemo_private.security_allowlist from public, anon, authenticated;

-- Helper: Notify all active staff admins internally via notification inbox
create or replace function bemo_private.notify_admins(p_kind text, p_dedup text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into bemo_private.notifications (user_id, kind, dedup_key, body)
  select ur.user_id, p_kind, p_dedup || ':' || ur.user_id::text, left(p_body, 500)
  from bemo_private.user_roles ur
  where ur.role in ('superadmin', 'support', 'security_admin')
  on conflict (user_id, dedup_key) do nothing;
end;
$$;

-- Helper: Soft graduated rate-limiter respecting Monitor Mode & Allowlist (Anti-Overprotection)
create or replace function bemo_private.check_rate_limit(p_actor uuid, p_scope text, p_recent_count int, p_limit int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_monitor boolean;
  v_allowlisted boolean;
begin
  if p_actor is null or p_recent_count < p_limit then
    return;
  end if;

  select exists(
    select 1 from bemo_private.security_allowlist
    where actor_id = p_actor and rule_scope in ('*', p_scope)
  ) into v_allowlisted;
  if v_allowlisted then
    return;
  end if;

  select coalesce(monitor_mode, true) into v_monitor from bemo_private.security_config where singleton;

  insert into bemo_private.security_events(actor_id, scope, risk_level, rule_name, action_taken, detail)
  values (
    p_actor, p_scope,
    case when p_recent_count >= p_limit * 3 then 'HIGH' else 'UNUSUAL' end,
    'rate_' || p_scope,
    case when v_monitor then 'MONITOR' else 'THROTTLE_FEATURE' end,
    format('count=%s limit=%s', p_recent_count, p_limit)
  );

  if not v_monitor then
    raise exception 'BEMO_RATE_LIMIT';
  end if;
end;
$$;

-- Public RPC: List & Save Policies (Admin editable, Public readable)
create or replace function public.bemo_list_policies()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', slug, 'title_ar', title_ar, 'title_en', title_en,
    'body_ar', body_ar, 'body_en', body_en, 'version', version,
    'requires_legal_review', requires_legal_review, 'updated_at', updated_at
  ) order by slug), '[]'::jsonb)
  from bemo_private.platform_policies;
$$;

create or replace function public.bemo_save_policy(p_slug text, p_title_ar text, p_title_en text, p_body_ar text, p_body_en text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := bemo_private.console_actor();
  v_row bemo_private.platform_policies;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9-]{2,50}$' then raise exception 'BEMO_QUERY_INVALID'; end if;
  insert into bemo_private.platform_policies(slug, title_ar, title_en, body_ar, body_en, version, updated_by, updated_at)
  values (p_slug, trim(p_title_ar), trim(p_title_en), trim(p_body_ar), trim(p_body_en), 1, v_admin, now())
  on conflict (slug) do update set
    title_ar = excluded.title_ar, title_en = excluded.title_en,
    body_ar = excluded.body_ar, body_en = excluded.body_en,
    version = bemo_private.platform_policies.version + 1,
    updated_by = v_admin, updated_at = now()
  returning * into v_row;

  insert into bemo_private.admin_actions(id, actor, operation, target, reason)
  values (gen_random_uuid(), v_admin, 'policy_update', null, 'Updated policy: ' || p_slug || ' v' || v_row.version);

  return to_jsonb(v_row);
end;
$$;

-- Public RPC: Submit Support Ticket / Contact / Listing Report / Block Appeal (routes via Admin Notification)
create or replace function public.bemo_submit_ticket(
  p_type text,
  p_subject text,
  p_message text,
  p_target_ref text default null,
  p_contact text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_recent int;
  v_id uuid;
begin
  if p_type not in ('CONTACT','PROBLEM_REPORT','LISTING_REPORT','BLOCK_APPEAL','DATA_EXPORT','ACCOUNT_DELETE') then
    raise exception 'BEMO_QUERY_INVALID';
  end if;
  if char_length(trim(coalesce(p_subject,''))) not between 3 and 160 or char_length(trim(coalesce(p_message,''))) not between 10 and 3000 then
    raise exception 'BEMO_QUERY_INVALID';
  end if;

  if v_user_id is not null then
    select count(*) into v_recent from bemo_private.support_tickets
    where reporter_id = v_user_id and created_at > now() - interval '1 hour';
    perform bemo_private.check_rate_limit(v_user_id, 'ticket', v_recent, 10);
  end if;

  insert into bemo_private.support_tickets(ticket_type, reporter_id, reporter_contact, target_ref, subject, message)
  values (p_type, v_user_id, left(trim(coalesce(p_contact,'')), 160), left(trim(coalesce(p_target_ref,'')), 160), trim(p_subject), trim(p_message))
  returning id into v_id;

  perform bemo_private.notify_admins(
    'SUPPORT_TICKET_' || p_type,
    'ticket:' || v_id::text,
    '[' || p_type || '] ' || trim(p_subject) || ' — ' || left(trim(p_message), 180)
  );

  return jsonb_build_object('success', true, 'ticket_id', v_id, 'status', 'OPEN');
end;
$$;

-- Public RPC: List Tickets (User sees own; Admin sees queue)
create or replace function public.bemo_list_tickets(p_view_as text default 'user')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select exists(select 1 from bemo_private.user_roles where user_id = v_user_id and role in ('superadmin','support','security_admin')) into v_is_admin;

  if p_view_as = 'admin' then
    if not v_is_admin then raise exception 'BEMO_ADMIN_REQUIRED'; end if;
    return (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      from (select * from bemo_private.support_tickets order by created_at desc limit 100) t
    );
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    from (select * from bemo_private.support_tickets where reporter_id = v_user_id order by created_at desc limit 50) t
  );
end;
$$;

-- Public RPC: Update User Account Completeness (Username, Optional Phone, Notification Prefs)
create or replace function public.bemo_update_account_extras(p_username text default null, p_phone text default null, p_prefs jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor bemo_private.app_users := bemo_private.require_actor();
  v_clean_user text := nullif(lower(trim(coalesce(p_username,''))), '');
  v_clean_phone text := nullif(trim(coalesce(p_phone,'')), '');
begin
  if v_clean_user is not null and v_clean_user !~ '^[a-z0-9_.-]{3,32}$' then
    raise exception 'BEMO_PROFILE_INVALID';
  end if;
  if v_clean_phone is not null and v_clean_phone !~ '^\+?[0-9 ()-]{7,25}$' then
    raise exception 'BEMO_PROFILE_INVALID';
  end if;

  update bemo_private.app_users set
    username = coalesce(v_clean_user, username),
    phone = coalesce(v_clean_phone, phone),
    notification_prefs = coalesce(p_prefs, notification_prefs),
    updated_at = now()
  where id = v_actor.id
  returning * into v_actor;

  return jsonb_build_object(
    'id', v_actor.id, 'username', v_actor.username, 'phone', v_actor.phone, 'notification_prefs', v_actor.notification_prefs
  );
end;
$$;

-- Public RPC: Export Personal Data (GDPR-style JSON download for user)
create or replace function public.bemo_export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor bemo_private.app_users := bemo_private.require_actor();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', jsonb_build_object(
      'id', v_actor.id, 'email', v_actor.email_normalized, 'username', v_actor.username,
      'display_name', v_actor.display_name, 'phone', v_actor.phone, 'locale', v_actor.locale,
      'status', v_actor.status, 'created_at', v_actor.created_at
    ),
    'addresses', coalesce((select jsonb_agg(to_jsonb(a)) from bemo_private.buyer_addresses a where a.user_id = v_actor.id), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'total_minor', p.total_minor, 'currency', p.currency, 'created_at', p.created_at)) from bemo_private.parent_orders p where p.buyer_id = v_actor.id), '[]'::jsonb),
    'tickets', coalesce((select jsonb_agg(to_jsonb(t)) from bemo_private.support_tickets t where t.reporter_id = v_actor.id), '[]'::jsonb)
  );
end;
$$;

-- Public RPC: Product Reviews
create or replace function public.bemo_list_reviews(p_product_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'author_name', author_name, 'rating', rating, 'comment', comment, 'created_at', created_at
  ) order by created_at desc), '[]'::jsonb)
  from bemo_private.product_reviews where product_id = p_product_id;
$$;

create or replace function public.bemo_submit_review(p_product_id uuid, p_rating int, p_comment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor bemo_private.app_users := bemo_private.require_actor();
  v_row bemo_private.product_reviews;
begin
  if p_rating not between 1 and 5 or char_length(trim(coalesce(p_comment,''))) not between 3 and 1200 then
    raise exception 'BEMO_QUERY_INVALID';
  end if;
  insert into bemo_private.product_reviews(product_id, author_id, author_name, rating, comment)
  values (p_product_id, v_actor.id, v_actor.display_name, p_rating, trim(p_comment))
  on conflict (product_id, author_id) do update set rating = excluded.rating, comment = excluded.comment
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

-- Public RPC: Admin Security Console & Anti-Overprotection Management
create or replace function public.bemo_security_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := bemo_private.console_actor();
begin
  return jsonb_build_object(
    'config', (select to_jsonb(c) from bemo_private.security_config c where singleton),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from bemo_private.security_events order by created_at desc limit 50) e), '[]'::jsonb),
    'suspended_users', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name, 'email', email_normalized, 'status', status, 'suspended_until', suspended_until, 'suspend_reason', suspend_reason, 'suspend_rule', suspend_rule)) from bemo_private.app_users where status = 'SUSPENDED'), '[]'::jsonb),
    'allowlist', coalesce((select jsonb_agg(to_jsonb(a)) from bemo_private.security_allowlist a), '[]'::jsonb),
    'appeals', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from bemo_private.support_tickets t where ticket_type in ('BLOCK_APPEAL','LISTING_REPORT','CONTACT','ACCOUNT_DELETE') and status in ('OPEN','IN_REVIEW')), '[]'::jsonb)
  );
end;
$$;

create or replace function public.bemo_security_action(
  p_action text,
  p_target_id uuid default null,
  p_reason text default '',
  p_hours int default 24
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := bemo_private.console_actor();
begin
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'BEMO_REASON_REQUIRED'; end if;

  if p_action = 'TOGGLE_MONITOR_MODE' then
    update bemo_private.security_config set monitor_mode = not monitor_mode, updated_at = now() where singleton;
  elsif p_action = 'LIFT_BLOCK' then
    update bemo_private.app_users set status = 'ACTIVE', suspended_until = null, suspend_reason = null, updated_at = now() where id = p_target_id;
    insert into bemo_private.security_events(actor_id, scope, risk_level, rule_name, action_taken, detail)
    values (p_target_id, 'account', 'LOW', 'admin_lift', 'LIFTED', p_reason);
  elsif p_action = 'TEMP_SUSPEND' then
    update bemo_private.app_users set status = 'SUSPENDED', suspended_until = now() + (p_hours || ' hours')::interval, suspend_reason = p_reason, suspend_rule = 'admin_manual', updated_at = now() where id = p_target_id;
    insert into bemo_private.security_events(actor_id, scope, risk_level, rule_name, action_taken, detail, expires_at)
    values (p_target_id, 'account', 'HIGH', 'admin_manual', 'TEMP_SUSPEND', p_reason, now() + (p_hours || ' hours')::interval);
  elsif p_action = 'ALLOWLIST' then
    insert into bemo_private.security_allowlist(actor_id, rule_scope, reason, added_by)
    values (p_target_id, '*', p_reason, v_admin) on conflict (actor_id) do update set reason = excluded.reason;
  elsif p_action = 'REMOVE_ALLOWLIST' then
    delete from bemo_private.security_allowlist where actor_id = p_target_id;
  elsif p_action in ('RESOLVE_TICKET', 'REJECT_TICKET') then
    update bemo_private.support_tickets set
      status = case when p_action = 'RESOLVE_TICKET' then 'RESOLVED' else 'REJECTED' end,
      admin_note = p_reason, resolved_by = v_admin, resolved_at = now()
    where id = p_target_id;
  else
    raise exception 'BEMO_QUERY_INVALID';
  end if;

  insert into bemo_private.admin_actions(id, actor, operation, target, reason)
  values (gen_random_uuid(), v_admin, 'sec_' || lower(p_action), p_target_id, p_reason);

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function
  public.bemo_list_policies(),
  public.bemo_list_reviews(uuid),
  public.bemo_submit_ticket(text, text, text, text, text)
to anon, authenticated;

grant execute on function
  public.bemo_save_policy(text, text, text, text, text),
  public.bemo_list_tickets(text),
  public.bemo_update_account_extras(text, text, jsonb),
  public.bemo_export_my_data(),
  public.bemo_submit_review(uuid, int, text),
  public.bemo_security_dashboard(),
  public.bemo_security_action(text, uuid, text, int)
to authenticated;

commit;
