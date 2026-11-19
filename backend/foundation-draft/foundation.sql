-- BEMO M1 foundation: LOCAL REVIEW DRAFT, not a deployed migration.
-- Requires PostgreSQL 15+ and Supabase-managed auth.users/identities/sessions.
-- Google must be the only enabled sign-in provider; do not expose bemo_private
-- through the Data API. No Google secrets, seed accounts or business data here.
begin;

create schema bemo_private;
revoke all on schema bemo_private from public, anon, authenticated, service_role;
grant usage on schema bemo_private to anon, authenticated;

create table bemo_private.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_subject uuid not null unique references auth.users(id) on delete restrict,
  email_normalized text not null unique
    check (email_normalized = lower(btrim(email_normalized)) and email_normalized ~ '^[^@[:space:]]+@gmail[.]com$'),
  provider text not null default 'google' check (provider = 'google'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING', 'DELETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table bemo_private.user_roles (
  user_id uuid not null references bemo_private.app_users(id) on delete restrict,
  role text not null check (role in ('support', 'moderator', 'operations_admin', 'security_admin', 'superadmin')),
  assigned_at timestamptz not null default now(),
  primary key (user_id, role)
);
create table bemo_private.stores (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references bemo_private.app_users(id) on delete restrict,
  slug text not null unique check (char_length(slug) between 3 and 48 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index stores_title_normalized_key on bemo_private.stores (lower(btrim(title)));
create index stores_public_created_idx on bemo_private.stores (created_at desc, id) where status = 'ACTIVE';
create table bemo_private.reserved_store_slugs (
  slug text primary key
);
insert into bemo_private.reserved_store_slugs (slug) values
  ('admin'), ('api'), ('auth'), ('login'), ('logout'), ('account'), ('checkout'),
  ('cart'), ('search'), ('help'), ('support'), ('seller'), ('stores'), ('products'),
  ('bemo'), ('www'), ('terms'), ('privacy');
create table bemo_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references bemo_private.app_users(id) on delete restrict,
  action text not null check (action in ('PROFILE_CREATED', 'PROFILE_UPDATED', 'STORE_CREATED')),
  object_id uuid not null,
  created_at timestamptz not null default now()
);
create index audit_events_actor_created_idx on bemo_private.audit_events (actor_user_id, created_at desc);

-- Intentionally default-deny. These are private internal tables: all reads and
-- writes cross bounded RPCs. RLS is defense in depth, not the definer RPC guard.
alter table bemo_private.app_users enable row level security;
alter table bemo_private.user_roles enable row level security;
alter table bemo_private.stores enable row level security;
alter table bemo_private.reserved_store_slugs enable row level security;
alter table bemo_private.audit_events enable row level security;
revoke all on all tables in schema bemo_private from public, anon, authenticated, service_role;

-- Reads only Supabase-managed identity data, never raw_user_meta_data.
-- The gateway verifies the signed JWT. Session presence adds immediate logout
-- protection; not_after enforces an explicit session expiry when populated.
create function bemo_private.trusted_identity()
returns table (auth_subject uuid, email_normalized text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_jwt jsonb := auth.jwt();
  v_session uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'BEMO_AUTH_REQUIRED';
  end if;
  begin
    v_session := nullif(v_jwt ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '42501', message = 'BEMO_SESSION_INVALID';
  end;
  if v_session is null or not exists (
    select 1 from auth.sessions s where s.id = v_session and s.user_id = v_uid
      and (s.not_after is null or s.not_after > now())
  ) then
    raise exception using errcode = '42501', message = 'BEMO_SESSION_INVALID';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(v_jwt -> 'amr') = 'array'
      then v_jwt -> 'amr' else '[]'::jsonb end) a where a ->> 'method' = 'oauth'
  ) then
    raise exception using errcode = '42501', message = 'BEMO_GOOGLE_REQUIRED';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null and u.is_anonymous is false
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now());
  if v_email is null or v_email !~ '^[^@[:space:]]+@gmail[.]com$' or not exists (
    select 1 from auth.identities i where i.user_id = v_uid and i.provider = 'google'
      and i.identity_data ->> 'email_verified' = 'true'
      and lower(btrim(i.identity_data ->> 'email')) = v_email
  ) then
    raise exception using errcode = '42501', message = 'BEMO_VERIFIED_GMAIL_REQUIRED';
  end if;
  return query select v_uid, v_email;
end;
$$;

create function bemo_private.require_actor(lock_row boolean default false)
returns bemo_private.app_users
language plpgsql security definer set search_path = '' as $$
declare
  v_identity record;
  v_actor bemo_private.app_users;
begin
  select * into strict v_identity from bemo_private.trusted_identity();
  if lock_row then
    select u.* into v_actor from bemo_private.app_users u
      where u.auth_subject = v_identity.auth_subject for update;
  else
    select u.* into v_actor from bemo_private.app_users u
      where u.auth_subject = v_identity.auth_subject;
  end if;
  if v_actor.id is null or v_actor.status <> 'ACTIVE' then
    raise exception using errcode = '42501', message = 'BEMO_PROFILE_UNAVAILABLE';
  end if;
  return v_actor;
end;
$$;

create function bemo_private.profile_json(actor bemo_private.app_users)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('id', (actor).id, 'email', (actor).email_normalized,
    'display_name', (actor).display_name, 'locale', (actor).locale,
    'status', (actor).status, 'created_at', (actor).created_at, 'updated_at', (actor).updated_at);
$$;

create function bemo_private.onboard(display_name text, locale text default 'ar')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_identity record;
  v_actor bemo_private.app_users;
  v_created_id uuid;
begin
  select * into strict v_identity from bemo_private.trusted_identity();
  if display_name is null or char_length(btrim(display_name)) not between 1 and 80
      or locale is null or locale not in ('ar', 'en') then
    raise exception using errcode = '22023', message = 'BEMO_PROFILE_INVALID';
  end if;
  insert into bemo_private.app_users (auth_subject, email_normalized, display_name, locale)
    values (v_identity.auth_subject, v_identity.email_normalized, btrim(display_name), locale)
    on conflict (auth_subject) do nothing returning id into v_created_id;
  select u.* into strict v_actor from bemo_private.app_users u
    where u.auth_subject = v_identity.auth_subject for update;
  if v_actor.status <> 'ACTIVE' then
    raise exception using errcode = '42501', message = 'BEMO_PROFILE_UNAVAILABLE';
  end if;
  -- Re-entry preserves profile choices and the immutable business ID.
  if v_actor.email_normalized is distinct from v_identity.email_normalized then
    update bemo_private.app_users set email_normalized = v_identity.email_normalized, updated_at = now()
      where id = v_actor.id returning * into v_actor;
  end if;
  if v_created_id is not null then
    insert into bemo_private.audit_events (actor_user_id, action, object_id)
      values (v_actor.id, 'PROFILE_CREATED', v_actor.id);
  end if;
  return bemo_private.profile_json(v_actor);
end;
$$;

create function bemo_private.get_profile()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor bemo_private.app_users;
begin
  v_actor := bemo_private.require_actor();
  return bemo_private.profile_json(v_actor);
end;
$$;

create function bemo_private.update_profile(display_name text, locale text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor bemo_private.app_users;
begin
  v_actor := bemo_private.require_actor(true);
  if display_name is null or char_length(btrim(display_name)) not between 1 and 80
      or locale is null or locale not in ('ar', 'en') then
    raise exception using errcode = '22023', message = 'BEMO_PROFILE_INVALID';
  end if;
  update bemo_private.app_users u set display_name = btrim(update_profile.display_name),
    locale = update_profile.locale, updated_at = now()
    where u.id = v_actor.id returning u.* into v_actor;
  insert into bemo_private.audit_events (actor_user_id, action, object_id)
    values (v_actor.id, 'PROFILE_UPDATED', v_actor.id);
  return bemo_private.profile_json(v_actor);
end;
$$;

create function bemo_private.create_store(title text, slug text, description text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor bemo_private.app_users;
  v_store bemo_private.stores;
  v_slug text := lower(btrim(slug));
begin
  v_actor := bemo_private.require_actor(true);
  if title is null or char_length(btrim(title)) not between 2 and 80
      or v_slug is null or char_length(v_slug) not between 3 and 48
      or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or description is null or char_length(description) > 2000 then
    raise exception using errcode = '22023', message = 'BEMO_STORE_INVALID';
  end if;
  if exists (select 1 from bemo_private.reserved_store_slugs r where r.slug = v_slug) then
    raise exception using errcode = '22023', message = 'BEMO_SLUG_RESERVED';
  end if;
  select s.* into v_store from bemo_private.stores s where s.owner_user_id = v_actor.id;
  if v_store.id is not null then
    -- An exact active retry is safe; a second store or recreation is rejected.
    if v_store.status = 'ACTIVE' and v_store.slug = v_slug and v_store.title = btrim(title)
        and v_store.description = description then
      return to_jsonb(v_store) - 'owner_user_id';
    end if;
    raise exception using errcode = '23505', message = 'BEMO_ONE_STORE_ONLY';
  end if;
  insert into bemo_private.stores (owner_user_id, slug, title, description)
    values (v_actor.id, v_slug, btrim(title), description) returning * into v_store;
  insert into bemo_private.audit_events (actor_user_id, action, object_id)
    values (v_actor.id, 'STORE_CREATED', v_store.id);
  return to_jsonb(v_store) - 'owner_user_id';
end;
$$;

create function bemo_private.get_my_store()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor bemo_private.app_users;
  v_store bemo_private.stores;
begin
  v_actor := bemo_private.require_actor();
  select s.* into v_store from bemo_private.stores s where s.owner_user_id = v_actor.id;
  if v_store.id is null then return null; end if;
  return to_jsonb(v_store) - 'owner_user_id';
end;
$$;

-- Intentional public projection: no profile, email, auth_subject or owner ID.
-- Unlike user RPCs, this allows visitors. Signed-in callers still pass live
-- identity checks and cannot use a suspended profile to access business APIs.
create function bemo_private.list_stores(search_text text default '', limit_count int default 24, offset_count int default 0)
returns table (id uuid, slug text, title text, description text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_identity record;
begin
  if auth.uid() is not null then
    select * into strict v_identity from bemo_private.trusted_identity();
    if exists (select 1 from bemo_private.app_users u
      where u.auth_subject = v_identity.auth_subject and u.status <> 'ACTIVE') then
      raise exception using errcode = '42501', message = 'BEMO_PROFILE_UNAVAILABLE';
    end if;
  end if;
  if search_text is null or char_length(search_text) > 120 or limit_count is null
      or limit_count not between 1 and 100 or offset_count is null
      or offset_count not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'BEMO_DIRECTORY_QUERY_INVALID';
  end if;
  return query select s.id, s.slug, s.title, s.description, s.created_at
    from bemo_private.stores s join bemo_private.app_users u on u.id = s.owner_user_id
    join auth.users au on au.id = u.auth_subject
    where s.status = 'ACTIVE' and u.status = 'ACTIVE' and au.deleted_at is null
      and (au.banned_until is null or au.banned_until <= now())
      and (btrim(search_text) = '' or position(lower(btrim(search_text)) in lower(s.title)) > 0
        or position(lower(btrim(search_text)) in s.slug) > 0)
    order by s.created_at desc, s.id limit limit_count offset offset_count;
end;
$$;

-- Public wrappers do not acquire database privileges themselves.
create function public.bemo_onboard(display_name text, locale text default 'ar') returns jsonb
language sql security invoker set search_path = '' as $$ select bemo_private.onboard($1, $2); $$;
create function public.bemo_get_profile() returns jsonb
language sql security invoker set search_path = '' as $$ select bemo_private.get_profile(); $$;
create function public.bemo_update_profile(display_name text, locale text) returns jsonb
language sql security invoker set search_path = '' as $$ select bemo_private.update_profile($1, $2); $$;
create function public.bemo_create_store(title text, slug text, description text default '') returns jsonb
language sql security invoker set search_path = '' as $$ select bemo_private.create_store($1, $2, $3); $$;
create function public.bemo_get_my_store() returns jsonb
language sql security invoker set search_path = '' as $$ select bemo_private.get_my_store(); $$;
create function public.bemo_list_stores(search_text text default '', limit_count int default 24, offset_count int default 0)
returns table (id uuid, slug text, title text, description text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from bemo_private.list_stores($1, $2, $3); $$;

revoke all on all functions in schema bemo_private from public, anon, authenticated, service_role;
revoke all on function public.bemo_onboard(text, text), public.bemo_get_profile(),
  public.bemo_update_profile(text, text), public.bemo_create_store(text, text, text),
  public.bemo_get_my_store(), public.bemo_list_stores(text, int, int)
  from public, anon, authenticated, service_role;
grant execute on function bemo_private.onboard(text, text), bemo_private.get_profile(),
  bemo_private.update_profile(text, text), bemo_private.create_store(text, text, text),
  bemo_private.get_my_store() to authenticated;
grant execute on function public.bemo_onboard(text, text), public.bemo_get_profile(),
  public.bemo_update_profile(text, text), public.bemo_create_store(text, text, text),
  public.bemo_get_my_store() to authenticated;
grant execute on function bemo_private.list_stores(text, int, int),
  public.bemo_list_stores(text, int, int) to anon, authenticated;

commit;
