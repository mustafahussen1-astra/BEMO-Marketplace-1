-- Commission preparation. No deposits or charges are enabled by this migration.
-- Owner-approved default: 5%. Activation/funding readiness is a separate decision.
create table bemo_private.commission_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 version int not null default 1, basis_points int not null default 500 check(basis_points between 0 and 10000)
);
insert into bemo_private.commission_settings default values;
create table bemo_private.commission_rules (
 product_id uuid primary key references bemo_private.products(id), basis_points int not null check(basis_points between 0 and 10000),
 fixed_minor bigint not null default 0 check(fixed_minor between 0 and 999999999999), currency text not null references bemo_private.currencies(code),
 version int not null default 1, note text not null check(char_length(note) between 20 and 1000), updated_at timestamptz not null default now()
);
create table bemo_private.commission_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references bemo_private.app_users(id),
 product_id uuid, before_rule jsonb, after_rule jsonb not null, reason text not null, created_at timestamptz not null default now()
);
create table bemo_private.order_commission_quotes (
 line_id uuid primary key references bemo_private.order_lines(id), amount_minor bigint not null check(amount_minor>=0),
 currency text not null references bemo_private.currencies(code), rule_snapshot jsonb not null
);
create table bemo_private.commission_holds (
 suborder_id uuid primary key references bemo_private.suborders(id),store_id uuid not null references bemo_private.stores(id),
 currency text not null references bemo_private.currencies(code), amount_minor bigint not null check(amount_minor>=0),
 state text not null check(state in ('HELD','CAPTURED','RELEASED','REFUNDED')), created_at timestamptz not null default now()
);
create table bemo_private.balance_ledger (
 id uuid primary key default gen_random_uuid(),store_id uuid not null references bemo_private.stores(id),currency text not null references bemo_private.currencies(code),
 suborder_id uuid references bemo_private.suborders(id),actor_id uuid references bemo_private.app_users(id),
 kind text not null check(kind in ('CREDIT','ADJUST_DOWN','RESERVE','CAPTURE','RELEASE','REFUND')),
 available_delta bigint not null,reserved_delta bigint not null,reference text not null unique,reason text not null,
 created_at timestamptz not null default now(),
 check((kind='CREDIT' and available_delta>0 and reserved_delta=0) or (kind='ADJUST_DOWN' and available_delta<0 and reserved_delta=0) or (kind='RESERVE' and available_delta<=0 and reserved_delta=-available_delta) or (kind='CAPTURE' and available_delta=0 and reserved_delta<=0) or (kind='RELEASE' and available_delta>=0 and reserved_delta=-available_delta) or (kind='REFUND' and available_delta>=0 and reserved_delta=0))
);
create index balance_ledger_store_currency on bemo_private.balance_ledger(store_id,currency,created_at);
create table bemo_private.commission_decisions(case_id uuid primary key references bemo_private.order_cases(id),release_funds boolean not null,reason text not null,actor_id uuid not null references bemo_private.app_users(id),created_at timestamptz not null default now());
create function bemo_private.ledger_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'BEMO_LEDGER_IMMUTABLE';end;$$;
create trigger balance_ledger_immutable before update or delete on bemo_private.balance_ledger for each row execute function bemo_private.ledger_immutable();
create trigger commission_audit_immutable before update or delete on bemo_private.commission_audit for each row execute function bemo_private.ledger_immutable();
create function bemo_private.snapshot_commission() returns trigger language plpgsql security definer set search_path='' as $$
declare r bemo_private.commission_rules; bps int; rule jsonb; amount bigint;
begin
 select * into r from bemo_private.commission_rules where product_id=new.product_id;
 if found then
  if r.currency<>new.currency then raise exception 'BEMO_COMMISSION_CURRENCY';end if;
  bps:=r.basis_points;rule:=to_jsonb(r);amount:=r.fixed_minor*new.quantity;
 else
  select coalesce((select basis_points from bemo_private.commission_settings where singleton),500) into bps;
  rule:=jsonb_build_object('basis_points',bps,'fixed_minor',0,'version',coalesce((select version from bemo_private.commission_settings where singleton),1),'scope','global');amount:=0;
 end if;
 amount:=amount+round(new.unit_price_minor::numeric*new.quantity*bps/10000)::bigint;
 rule:=rule||jsonb_build_object('enabled_at_order',coalesce((select enabled from bemo_private.commission_settings where singleton),false));
 insert into bemo_private.order_commission_quotes values(new.id,amount,new.currency,rule);
 return new;
end;$$;
create trigger order_commission_snapshot after insert on bemo_private.order_lines for each row execute function bemo_private.snapshot_commission();
create table bemo_private.balance_accounts(store_id uuid primary key references bemo_private.stores(id),frozen boolean not null default false,bank jsonb not null default '{}',version int not null default 1);
alter table bemo_private.balance_accounts enable row level security;
revoke all on bemo_private.balance_accounts from public,anon,authenticated,service_role;
create table bemo_private.balance_admin_log(request_id uuid primary key,actor_id uuid not null references bemo_private.app_users(id),store_id uuid references bemo_private.stores(id),action text not null,payload jsonb not null,reason text not null,created_at timestamptz not null default now());
alter table bemo_private.balance_admin_log enable row level security;
revoke all on bemo_private.balance_admin_log from public,anon,authenticated,service_role;
create trigger balance_admin_log_immutable before update or delete on bemo_private.balance_admin_log for each row execute function bemo_private.ledger_immutable();
create function bemo_private.transition_commission() returns trigger language plpgsql security definer set search_path='' as $$
declare amount bigint; available numeric; h bemo_private.commission_holds;
begin
 if new.state='ACCEPTED' and old.accepted_at is null and coalesce((select enabled from bemo_private.commission_settings where singleton),false) then
  if exists(select 1 from bemo_private.balance_accounts where store_id=new.store_id and frozen) then raise exception 'BEMO_BALANCE_FROZEN';end if;
  -- The order action already locks the store. No balance writes bypass this lock.
  if (select count(*) from bemo_private.order_lines where suborder_id=new.id)<>(select count(*) from bemo_private.order_commission_quotes q join bemo_private.order_lines l on l.id=q.line_id where l.suborder_id=new.id) then raise exception 'BEMO_COMMISSION_REQUOTE_REQUIRED';end if;
  select coalesce(sum(case when (q.rule_snapshot->>'enabled_at_order')::boolean then q.amount_minor else 0 end),0) into amount from bemo_private.order_commission_quotes q join bemo_private.order_lines l on l.id=q.line_id where l.suborder_id=new.id;
  select coalesce(sum(available_delta),0) into available from bemo_private.balance_ledger where store_id=new.store_id and currency=new.currency;
  if available<amount then raise exception 'BEMO_BALANCE_INSUFFICIENT';end if;
  insert into bemo_private.commission_holds values(new.id,new.store_id,new.currency,amount,'HELD',now());
  insert into bemo_private.balance_ledger(store_id,currency,suborder_id,actor_id,kind,available_delta,reserved_delta,reference,reason) values(new.store_id,new.currency,new.id,(bemo_private.require_actor()).id,'RESERVE',-amount,amount,'reserve:'||new.id,'ORDER_ACCEPTED');
 elsif new.state='DELIVERED' and old.state<>'DELIVERED' then
  select * into h from bemo_private.commission_holds where suborder_id=new.id for update;
  if found and h.state='HELD' then
   insert into bemo_private.balance_ledger(store_id,currency,suborder_id,actor_id,kind,available_delta,reserved_delta,reference,reason) values(h.store_id,h.currency,new.id,(bemo_private.require_actor()).id,'CAPTURE',0,-h.amount_minor,'capture:'||new.id,'ORDER_DELIVERED');
   update bemo_private.commission_holds set state='CAPTURED' where suborder_id=new.id;
  end if;
 end if;
 -- Cancellation/return never releases money implicitly. Assigned support decides separately.
 return new;
end;$$;
create trigger order_commission_transition before update of state on bemo_private.suborders for each row execute function bemo_private.transition_commission();
create function bemo_private.save_commission_rule(product_id uuid,basis_points int,fixed_minor bigint,currency text,expected_version int,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; previous jsonb; result jsonb; v int;
begin
 actor:=bemo_private.require_actor(true);
 if not exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin') then raise exception 'BEMO_ADMIN_REQUIRED';end if;
 if basis_points is null or basis_points not between 0 and 10000 or fixed_minor is null or fixed_minor not between 0 and 999999999999 or reason is null or char_length(btrim(reason)) not between 20 and 1000 or expected_version is null then raise exception 'BEMO_RULE_INVALID';end if;
 perform pg_advisory_xact_lock(8201501);
 if product_id is null then
  if fixed_minor<>0 then raise exception 'BEMO_RULE_INVALID';end if;
  insert into bemo_private.commission_settings default values on conflict do nothing;
  select to_jsonb(s),s.version into previous,v from bemo_private.commission_settings s where singleton for update;
  if v<>expected_version then raise exception 'BEMO_VERSION_CONFLICT';end if;
  update bemo_private.commission_settings set basis_points=save_commission_rule.basis_points,version=version+1 where singleton returning to_jsonb(commission_settings) into result;
 else
  if not exists(select 1 from bemo_private.products p join bemo_private.store_settings s on s.store_id=p.store_id where p.id=product_id and s.currency=save_commission_rule.currency) then raise exception 'BEMO_RULE_INVALID';end if;
  select to_jsonb(r),r.version into previous,v from bemo_private.commission_rules r where r.product_id=save_commission_rule.product_id for update;
  if coalesce(v,0)<>expected_version then raise exception 'BEMO_VERSION_CONFLICT';end if;
  insert into bemo_private.commission_rules values(product_id,basis_points,fixed_minor,currency,coalesce(v,0)+1,reason,now()) on conflict on constraint commission_rules_pkey do update set basis_points=excluded.basis_points,fixed_minor=excluded.fixed_minor,currency=excluded.currency,version=excluded.version,note=excluded.note,updated_at=now() returning to_jsonb(commission_rules) into result;
 end if;
 insert into bemo_private.commission_audit(actor_id,product_id,before_rule,after_rule,reason) values(actor.id,product_id,previous,result,reason);
 return result;
end;$$;
create function bemo_private.balance_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; sid uuid; result jsonb;
begin
 actor:=bemo_private.require_actor(); select id into sid from bemo_private.stores where owner_user_id=actor.id and status='ACTIVE';
 if sid is null and not exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin') then raise exception 'BEMO_STORE_REQUIRED';end if;
 return jsonb_build_object('enabled',coalesce((select enabled from bemo_private.commission_settings where singleton),false),'basis_points',coalesce((select basis_points from bemo_private.commission_settings where singleton),500),'version',coalesce((select version from bemo_private.commission_settings where singleton),1),
 'can_configure',exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin'),
 'frozen',coalesce((select frozen from bemo_private.balance_accounts where store_id=sid),false),
 'bank',coalesce((select bank from bemo_private.balance_accounts where store_id=sid),'{}'),
 'balances',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select currency,sum(available_delta) available_minor,sum(reserved_delta) reserved_minor from bemo_private.balance_ledger where store_id=sid group by currency) t),
 'transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (select id,currency,kind,available_delta,reserved_delta,suborder_id,reason,created_at from bemo_private.balance_ledger where store_id=sid order by created_at desc,id limit 100) t),
 'rules',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from bemo_private.commission_rules r where exists(select 1 from bemo_private.products p where p.id=r.product_id and p.store_id=sid) or exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin')));
end;$$;
create function bemo_private.resolve_commission_hold(case_id uuid,release_funds boolean,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;c bemo_private.order_cases;h bemo_private.commission_holds;sid uuid;target text;previous bemo_private.commission_decisions;
begin
 actor:=bemo_private.support_actor();
 if release_funds is null or reason is null or char_length(btrim(reason)) not between 20 and 2000 then raise exception 'BEMO_REASON_REQUIRED';end if;
 select o.store_id into sid from bemo_private.suborders o join bemo_private.order_cases oc on oc.suborder_id=o.id where oc.id=case_id;
 perform id from bemo_private.stores where id=sid for update;
 select * into c from bemo_private.order_cases where id=case_id for update;
 if c.assigned_to is distinct from actor.id or c.state<>'RESOLVED' or c.kind not in ('CANCELLATION','RETURN','DELIVERY_FAILURE') then raise exception 'BEMO_CASE_NOT_ASSIGNED';end if;
 if exists(select 1 from bemo_private.stores where id=sid and owner_user_id=actor.id) or exists(select 1 from bemo_private.parent_orders p join bemo_private.suborders o on p.id=o.parent_id where o.id=c.suborder_id and p.buyer_id=actor.id) then raise exception 'BEMO_CASE_CONFLICT_OF_INTEREST';end if;
 if not exists(select 1 from bemo_private.suborders where id=c.suborder_id and state in ('RETURNED','CANCELLED_BY_SUPPORT')) then raise exception 'BEMO_TRANSITION_INVALID';end if;
 select * into h from bemo_private.commission_holds where suborder_id=c.suborder_id for update;
 if not found then return jsonb_build_object('state','NO_HOLD');end if;
 select * into previous from bemo_private.commission_decisions where commission_decisions.case_id=resolve_commission_hold.case_id;
 if found then
  if previous.release_funds<>release_funds or previous.reason<>reason then raise exception 'BEMO_REQUEST_CONFLICT';end if;
  return to_jsonb(h);
 end if;
 insert into bemo_private.commission_decisions(case_id,release_funds,reason,actor_id) values(case_id,release_funds,reason,actor.id);
 if h.state in ('RELEASED','REFUNDED') then return to_jsonb(h);end if;
 target:=case when release_funds then case when h.state='CAPTURED' then 'REFUNDED' else 'RELEASED' end else 'CAPTURED' end;
 if h.state='CAPTURED' and not release_funds then return to_jsonb(h);end if;
 insert into bemo_private.balance_ledger(store_id,currency,suborder_id,actor_id,kind,available_delta,reserved_delta,reference,reason) values(h.store_id,h.currency,h.suborder_id,actor.id,case target when 'REFUNDED' then 'REFUND' when 'RELEASED' then 'RELEASE' else 'CAPTURE' end,case when release_funds then h.amount_minor else 0 end,case when h.state='HELD' then -h.amount_minor else 0 end,'case:'||c.id||':'||target,reason);
 update bemo_private.commission_holds set state=target where suborder_id=h.suborder_id returning * into h;return to_jsonb(h);
end;$$;
create function public.bemo_balance_workspace() returns jsonb language sql security invoker set search_path='' as $$select bemo_private.balance_workspace()$$;
create function public.bemo_save_commission_rule(product_id uuid,basis_points int,fixed_minor bigint,currency text,expected_version int,reason text) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.save_commission_rule($1,$2,$3,$4,$5,$6)$$;
create function public.bemo_resolve_commission_hold(case_id uuid,release_funds boolean,reason text) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.resolve_commission_hold($1,$2,$3)$$;
do $$declare t text;f text;begin
 foreach t in array array['commission_settings','commission_rules','commission_audit','order_commission_quotes','commission_holds','balance_ledger','commission_decisions'] loop
 execute format('alter table bemo_private.%I enable row level security',t);execute format('revoke all on bemo_private.%I from public,anon,authenticated,service_role',t);end loop;
 foreach f in array array['bemo_private.ledger_immutable()','bemo_private.snapshot_commission()','bemo_private.transition_commission()','bemo_private.balance_workspace()','bemo_private.save_commission_rule(uuid,int,bigint,text,int,text)','bemo_private.resolve_commission_hold(uuid,boolean,text)','public.bemo_balance_workspace()','public.bemo_save_commission_rule(uuid,int,bigint,text,int,text)','public.bemo_resolve_commission_hold(uuid,boolean,text)'] loop
 execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';
 if f not in ('bemo_private.ledger_immutable()','bemo_private.snapshot_commission()','bemo_private.transition_commission()') then execute 'grant execute on function '||f||' to authenticated';end if;end loop;
end;$$;

create or replace function bemo_private.support_case(case_id uuid,claim_case boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; c bemo_private.order_cases; buyer uuid; seller uuid;
begin
 actor:=bemo_private.support_actor();
 if claim_case is null then raise exception 'BEMO_ACTION_INVALID'; end if;
 select * into c from bemo_private.order_cases where id=case_id for update;
 if not found then raise exception 'BEMO_CASE_UNAVAILABLE'; end if;
 select p.buyer_id,s.owner_user_id into buyer,seller from bemo_private.suborders o join bemo_private.parent_orders p on p.id=o.parent_id join bemo_private.stores s on s.id=o.store_id where o.id=c.suborder_id;
 if actor.id in (buyer,seller) then raise exception 'BEMO_CASE_CONFLICT_OF_INTEREST'; end if;
 if claim_case and c.state='OPEN' and c.assigned_to is null then
  update bemo_private.order_cases set assigned_to=actor.id,state='ASSIGNED' where id=c.id returning * into c;
 end if;
 if c.assigned_to is distinct from actor.id then raise exception 'BEMO_CASE_NOT_ASSIGNED'; end if;
 insert into bemo_private.order_access_log(actor_id,suborder_id,purpose) values(actor.id,c.suborder_id,'SUPPORT_CASE:'||c.id);
 return jsonb_build_object('case',to_jsonb(c)-'assigned_to','order',bemo_private.order_projection(c.suborder_id,true),'commission_hold',(select to_jsonb(h) from bemo_private.commission_holds h where h.suborder_id=c.suborder_id));
end; $$;


create function bemo_private.finance_admin_action(store_id uuid,action text,payload jsonb,reason text,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;prior bemo_private.balance_admin_log;amount bigint;money_code text;available numeric;bank_value jsonb;v int;
begin
 actor:=bemo_private.require_actor(true);
 if not exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin') then raise exception 'BEMO_ADMIN_REQUIRED';end if;
 if action is null or action not in ('CREDIT','ADJUST_DOWN','FREEZE','UNFREEZE','BANK','PAUSE') or request_id is null or reason is null or char_length(btrim(reason)) not between 20 and 1000 or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'BEMO_FINANCE_INVALID';end if;
 perform pg_advisory_xact_lock(8201502);
 select * into prior from bemo_private.balance_admin_log l where l.request_id=finance_admin_action.request_id;
 if found then
  if prior.actor_id<>actor.id or prior.store_id is distinct from store_id or prior.action<>action or prior.payload<>payload or prior.reason<>reason then raise exception 'BEMO_REQUEST_CONFLICT';end if;
  return jsonb_build_object('saved',true);
 end if;
 if action='PAUSE' then
  insert into bemo_private.commission_settings default values on conflict do nothing;
  update bemo_private.commission_settings set enabled=false,version=version+1 where singleton;
 else
  perform id from bemo_private.stores s where s.id=store_id for update;
  if not found then raise exception 'BEMO_STORE_REQUIRED';end if;
  insert into bemo_private.balance_accounts(store_id) values(store_id) on conflict do nothing;
  if action in ('CREDIT','ADJUST_DOWN') then
   if (payload->>'amount_minor') is null or (payload->>'amount_minor')!~'^[0-9]{1,12}$' then raise exception 'BEMO_FINANCE_INVALID';end if;
   amount:=(payload->>'amount_minor')::bigint;money_code:=payload->>'currency';
   if amount<=0 or not exists(select 1 from bemo_private.currencies where currencies.code=money_code) or char_length(coalesce(payload->>'reference','')) not between 3 and 100 then raise exception 'BEMO_FINANCE_INVALID';end if;
   if action='ADJUST_DOWN' then
    select coalesce(sum(available_delta),0) into available from bemo_private.balance_ledger l where l.store_id=finance_admin_action.store_id and l.currency=money_code;
    if available<amount then raise exception 'BEMO_BALANCE_INSUFFICIENT';end if;amount:=-amount;
   end if;
   insert into bemo_private.balance_ledger(store_id,currency,actor_id,kind,available_delta,reserved_delta,reference,reason) values(store_id,money_code,actor.id,action,amount,0,'manual:'||(payload->>'reference'),reason);
  elsif action in ('FREEZE','UNFREEZE') then
   update bemo_private.balance_accounts a set frozen=(action='FREEZE'),version=version+1 where a.store_id=finance_admin_action.store_id;
  elsif action='BANK' then
   if payload - array['bank_name','beneficiary','account_number','iban','card_last4','notes','version'] <> '{}' or char_length(coalesce(payload->>'bank_name',''))>100 or char_length(coalesce(payload->>'beneficiary',''))>160 or char_length(coalesce(payload->>'account_number',''))>40 or char_length(coalesce(payload->>'iban',''))>34 or char_length(coalesce(payload->>'notes',''))>1000 or coalesce(payload->>'card_last4','')!~'^([0-9]{4})?$' then raise exception 'BEMO_FINANCE_INVALID';end if;
   select version into v from bemo_private.balance_accounts a where a.store_id=finance_admin_action.store_id;
   if (payload->>'version')::int is distinct from v then raise exception 'BEMO_VERSION_CONFLICT';end if;
   bank_value:=payload-'version';update bemo_private.balance_accounts a set bank=bank_value,version=version+1 where a.store_id=finance_admin_action.store_id;
  end if;
 end if;
 insert into bemo_private.balance_admin_log(request_id,actor_id,store_id,action,payload,reason) values(request_id,actor.id,store_id,action,payload,reason);
 return jsonb_build_object('saved',true);
end;$$;
create function bemo_private.finance_admin_workspace(target_store uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor();if not exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin') then raise exception 'BEMO_ADMIN_REQUIRED';end if;
 return jsonb_build_object('stores',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select id,title,slug from bemo_private.stores order by title,id limit 100) t),
 'account',coalesce((select to_jsonb(a) from bemo_private.balance_accounts a where a.store_id=target_store),jsonb_build_object('store_id',target_store,'frozen',false,'bank','{}'::jsonb,'version',1)),
 'balances',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select currency,sum(available_delta) available_minor,sum(reserved_delta) reserved_minor from bemo_private.balance_ledger where store_id=target_store group by currency)t),
 'history',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select id,kind,currency,available_delta,reserved_delta,reason,reference,created_at from bemo_private.balance_ledger where store_id=target_store order by created_at desc,id limit 100)t));
end;$$;
create function public.bemo_finance_admin_action(store_id uuid,action text,payload jsonb,reason text,request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.finance_admin_action($1,$2,$3,$4,$5)$$;
create function public.bemo_finance_admin_workspace(target_store uuid default null) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.finance_admin_workspace($1)$$;
revoke all on function bemo_private.finance_admin_action(uuid,text,jsonb,text,uuid),public.bemo_finance_admin_action(uuid,text,jsonb,text,uuid),bemo_private.finance_admin_workspace(uuid),public.bemo_finance_admin_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function bemo_private.finance_admin_action(uuid,text,jsonb,text,uuid),public.bemo_finance_admin_action(uuid,text,jsonb,text,uuid),bemo_private.finance_admin_workspace(uuid),public.bemo_finance_admin_workspace(uuid) to authenticated;
create function public.bemo_support_decision_with_hold(case_id uuid,decision text,reason text,goods_received boolean,expected_version int,release_funds boolean default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=bemo_private.support_decision(case_id,decision,reason,goods_received,expected_version);
 if decision in ('APPROVE_CANCEL','CONFIRM_RETURN') and release_funds is not null then
  perform bemo_private.resolve_commission_hold(case_id,release_funds,reason);
 end if;
 return result;
end;$$;
revoke all on function public.bemo_support_decision_with_hold(uuid,text,text,boolean,int,boolean) from public,anon,authenticated,service_role;
grant execute on function public.bemo_support_decision_with_hold(uuid,text,text,boolean,int,boolean) to authenticated;


