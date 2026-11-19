-- Additive COD orders; no platform fees, wallets, payment capture or stock holds.
begin;
create table bemo_private.checkout_quotes (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references bemo_private.app_users(id),
 cart jsonb not null, snapshot jsonb not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '15 minutes')
);
create index checkout_quotes_buyer_created on bemo_private.checkout_quotes(buyer_id,created_at desc);
create table bemo_private.parent_orders (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references bemo_private.app_users(id),
 quote_id uuid not null unique references bemo_private.checkout_quotes(id), request_id uuid not null,
 currency text not null references bemo_private.currencies(code), total_minor bigint not null check(total_minor between 1 and 9000000000000000),
 created_at timestamptz not null default now(), unique(buyer_id,request_id)
);
create index parent_orders_buyer_created on bemo_private.parent_orders(buyer_id,created_at desc,id);
create table bemo_private.order_delivery (
 parent_id uuid primary key references bemo_private.parent_orders(id),
 recipient text not null check(char_length(recipient) between 2 and 120),
 phone text not null check(phone ~ '^\+?[0-9 ()-]{7,25}$'),
 country text not null check(char_length(country) between 2 and 80),
 region text not null check(char_length(region) between 1 and 120),
 city text not null check(char_length(city) between 1 and 120),
 address text not null check(char_length(address) between 8 and 600),
 note text not null default '' check(char_length(note)<=1000)
);
create table bemo_private.suborders (
 id uuid primary key default gen_random_uuid(), parent_id uuid not null references bemo_private.parent_orders(id),
 store_id uuid not null references bemo_private.stores(id), store_title text not null,
 currency text not null references bemo_private.currencies(code), items_minor bigint not null check(items_minor>0),
 delivery_fee_minor bigint not null check(delivery_fee_minor>=0),
 state text not null default 'PENDING_SELLER' check(state in ('PENDING_SELLER','ESCALATED_TO_SUPPORT','REJECTED_BY_SELLER','CANCELLED_BY_BUYER_PRE_ACCEPT','ACCEPTED','PACKING','SHIPPED','DELIVERY_ATTEMPTED','DELIVERED','CANCEL_REQUESTED','RETURN_REQUESTED','RETURN_IN_REVIEW','RETURNED','CANCELLED_BY_SUPPORT','FAILED_DELIVERY','CLOSED')),
 version int not null default 1, accepted_at timestamptz, delivered_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 pending_since timestamptz not null default now(), response_cycle int not null default 1,
 unique(parent_id,store_id)
);
create index suborders_store_created on bemo_private.suborders(store_id,created_at desc,id);
create index suborders_pending on bemo_private.suborders(pending_since,id) where state='PENDING_SELLER';
create table bemo_private.order_lines (
 id uuid primary key default gen_random_uuid(), suborder_id uuid not null references bemo_private.suborders(id),
 variant_id uuid not null references bemo_private.product_variants(id), product_id uuid not null references bemo_private.products(id),
 title text not null, variant_label text not null, sku text not null, quantity int not null check(quantity between 1 and 100),
 unit_price_minor bigint not null check(unit_price_minor>0), currency text not null references bemo_private.currencies(code),
 debit_movement_id uuid unique references bemo_private.inventory_movements(id),
 restore_movement_id uuid unique references bemo_private.inventory_movements(id), unique(suborder_id,variant_id)
);
create table bemo_private.order_events (
 id uuid primary key default gen_random_uuid(), suborder_id uuid not null references bemo_private.suborders(id),
 actor_id uuid references bemo_private.app_users(id), action text not null, from_state text, to_state text not null,
 reason text not null default '', created_at timestamptz not null default now()
);
create index order_events_suborder_created on bemo_private.order_events(suborder_id,created_at,id);
create table bemo_private.order_requests (
 actor_id uuid not null references bemo_private.app_users(id), request_id uuid not null,
 suborder_id uuid not null references bemo_private.suborders(id), action text not null, reason text not null,
 primary key(actor_id,request_id)
);
create table bemo_private.order_cases (
 id uuid primary key default gen_random_uuid(), suborder_id uuid not null references bemo_private.suborders(id),
 kind text not null check(kind in ('SELLER_DELAY','CANCELLATION','RETURN','DELIVERY_FAILURE')),
 state text not null default 'OPEN' check(state in ('OPEN','ASSIGNED','RESOLVED')),
 prior_state text not null, reason text not null, assigned_to uuid references bemo_private.app_users(id),
 resolution text, created_at timestamptz not null default now(), resolved_at timestamptz
);
create unique index order_cases_one_active on bemo_private.order_cases(suborder_id) where state<>'RESOLVED';
create index order_cases_queue on bemo_private.order_cases(state,created_at);
create table bemo_private.order_access_log (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references bemo_private.app_users(id),
 suborder_id uuid not null references bemo_private.suborders(id), purpose text not null, created_at timestamptz not null default now()
);
create table bemo_private.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references bemo_private.app_users(id),
 suborder_id uuid references bemo_private.suborders(id), kind text not null, dedup_key text not null,
 created_at timestamptz not null default now(), read_at timestamptz, unique(user_id,dedup_key)
);
create index notifications_user_created on bemo_private.notifications(user_id,created_at desc,id);

-- A single bounded snapshot, built while store rows are locked in UUID order.
-- Every merchant write already locks its store first. Stock is checked here but NOT held.
create function bemo_private.quote_snapshot(cart jsonb, buyer uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb; rowdata record; shop record; items jsonb:='[]'; shops jsonb:='[]'; ids uuid[]:='{}';
 variant uuid; qty int; code text; total bigint:=0; subtotal bigint;
begin
 if cart is null or jsonb_typeof(cart)<>'array' then raise exception 'BEMO_CART_INVALID'; end if;
 if jsonb_array_length(cart) not between 1 and 50 then raise exception 'BEMO_CART_INVALID'; end if;
 for item in select value from jsonb_array_elements(cart) loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'variant_id','') !~ '^[0-9a-fA-F-]{36}$'
   or coalesce(item->>'quantity','') !~ '^[0-9]{1,3}$' then raise exception 'BEMO_CART_INVALID'; end if;
  variant:=(item->>'variant_id')::uuid; qty:=(item->>'quantity')::int;
  if qty not between 1 and 100 or variant=any(ids) then raise exception 'BEMO_CART_INVALID'; end if;
  ids:=array_append(ids,variant);
 end loop;
 perform s.id from bemo_private.stores s where s.id in
  (select v.store_id from bemo_private.product_variants v where v.id=any(ids)) order by s.id for update;
 for item in select value from jsonb_array_elements(cart) order by value->>'variant_id' loop
  variant:=(item->>'variant_id')::uuid; qty:=(item->>'quantity')::int;
  select v.id,v.product_id,v.store_id,v.label,v.sku,v.price_minor,v.currency,p.title,s.title store_title,st.delivery_fee_minor,sp.stock_on_hand
   into rowdata from bemo_private.product_variants v join bemo_private.products p on p.id=v.product_id
   join bemo_private.stores s on s.id=v.store_id join bemo_private.store_settings st on st.store_id=s.id
   join bemo_private.stock_positions sp on sp.variant_id=v.id join bemo_private.app_users u on u.id=s.owner_user_id
   join auth.users au on au.id=u.auth_subject
   where v.id=variant and v.active and p.status='ACTIVE' and s.status='ACTIVE' and u.status='ACTIVE'
    and au.deleted_at is null and (au.banned_until is null or au.banned_until<=now()) and s.owner_user_id<>buyer
    and v.currency=st.currency;
  if not found then raise exception 'BEMO_ITEM_UNAVAILABLE'; end if;
  if rowdata.stock_on_hand<qty then raise exception 'BEMO_STOCK_INSUFFICIENT'; end if;
  if code is not null and code<>rowdata.currency then raise exception 'BEMO_MIXED_CURRENCY'; end if;
  code:=rowdata.currency;
  items:=items||jsonb_build_array(jsonb_build_object('variant_id',variant,'product_id',rowdata.product_id,'store_id',rowdata.store_id,
   'title',rowdata.title,'variant_label',rowdata.label,'sku',rowdata.sku,'quantity',qty,'unit_price_minor',rowdata.price_minor,'currency',code));
 end loop;
 for shop in select s.id,s.title,st.delivery_fee_minor from bemo_private.stores s join bemo_private.store_settings st on st.store_id=s.id
  where s.id in (select (x->>'store_id')::uuid from jsonb_array_elements(items) x) order by s.id loop
  select sum((x->>'unit_price_minor')::bigint*(x->>'quantity')::int) into subtotal from jsonb_array_elements(items) x where (x->>'store_id')::uuid=shop.id;
  total:=total+subtotal+shop.delivery_fee_minor;
  shops:=shops||jsonb_build_array(jsonb_build_object('store_id',shop.id,'store_title',shop.title,'items_minor',subtotal,'delivery_fee_minor',shop.delivery_fee_minor));
 end loop;
 if total>9000000000000000 then raise exception 'BEMO_TOTAL_TOO_LARGE'; end if;
 return jsonb_build_object('currency',code,'total_minor',total,'stores',shops,'items',items,'payment_method','COD','platform_fee_minor',0);
end; $$;

create function bemo_private.create_quote(cart jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; snapshot jsonb; q bemo_private.checkout_quotes;
begin
 actor:=bemo_private.require_actor(true);
 if (select count(*) from bemo_private.checkout_quotes where buyer_id=actor.id and created_at>now()-interval '1 minute')>=10 then raise exception 'BEMO_RATE_LIMIT'; end if;
 snapshot:=bemo_private.quote_snapshot(cart,actor.id);
 insert into bemo_private.checkout_quotes(buyer_id,cart,snapshot) values(actor.id,cart,snapshot) returning * into q;
 return jsonb_build_object('id',q.id,'expires_at',q.expires_at,'snapshot',snapshot);
end; $$;

-- Internal projection: caller must authorize the row before invoking.
create function bemo_private.order_projection(order_id uuid, details boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'parent_id',s.parent_id,'store_id',s.store_id,'store_title',s.store_title,
  'state',s.state,'version',s.version,'currency',s.currency,'items_minor',s.items_minor,'delivery_fee_minor',s.delivery_fee_minor,
  'total_minor',s.items_minor+s.delivery_fee_minor,'created_at',s.created_at,'accepted_at',s.accepted_at,'delivered_at',s.delivered_at,
  'country',d.country,'region',d.region,
  'delivery',case when details then to_jsonb(d)-'parent_id' else null end,
  'items',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'variant_id',l.variant_id,'product_id',l.product_id,'title',l.title,
    'variant_label',l.variant_label,'quantity',l.quantity,'unit_price_minor',l.unit_price_minor,'currency',l.currency) order by l.id),'[]') from bemo_private.order_lines l where l.suborder_id=s.id),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'state',e.to_state,'created_at',e.created_at) order by e.created_at,e.id),'[]') from bemo_private.order_events e where e.suborder_id=s.id))
 from bemo_private.suborders s join bemo_private.order_delivery d on d.parent_id=s.parent_id where s.id=order_id;
$$;

create function bemo_private.place_order(quote_id uuid,delivery jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; q bemo_private.checkout_quotes; po bemo_private.parent_orders; d jsonb;
 snapshot jsonb; shop jsonb; item jsonb; sid uuid; response jsonb;
begin
 actor:=bemo_private.require_actor(true);
 if request_id is null or quote_id is null or delivery is null or jsonb_typeof(delivery)<>'object' then raise exception 'BEMO_CHECKOUT_INVALID'; end if;
 d:=jsonb_build_object('recipient',btrim(delivery->>'recipient'),'phone',btrim(delivery->>'phone'),'country',btrim(delivery->>'country'),
 'region',btrim(delivery->>'region'),'city',btrim(delivery->>'city'),'address',btrim(delivery->>'address'),'note',btrim(coalesce(delivery->>'note','')));
 select * into po from bemo_private.parent_orders p where p.buyer_id=actor.id and p.request_id=place_order.request_id;
 if not found then select * into po from bemo_private.parent_orders p where p.buyer_id=actor.id and p.quote_id=place_order.quote_id; end if;
 if found then
  if po.quote_id<>quote_id or (select to_jsonb(od)-'parent_id' from bemo_private.order_delivery od where parent_id=po.id)<>d then raise exception 'BEMO_REQUEST_CONFLICT'; end if;
 else
  select * into q from bemo_private.checkout_quotes cq where cq.id=quote_id and cq.buyer_id=actor.id;
  if not found or q.expires_at<=now() then raise exception 'BEMO_QUOTE_EXPIRED'; end if;
  snapshot:=bemo_private.quote_snapshot(q.cart,actor.id);
  if snapshot<>q.snapshot then raise exception 'BEMO_QUOTE_CHANGED'; end if;
  insert into bemo_private.parent_orders(buyer_id,quote_id,request_id,currency,total_minor)
   values(actor.id,q.id,request_id,snapshot->>'currency',(snapshot->>'total_minor')::bigint) returning * into po;
  insert into bemo_private.order_delivery values(po.id,d->>'recipient',d->>'phone',d->>'country',d->>'region',d->>'city',d->>'address',d->>'note');
  for shop in select value from jsonb_array_elements(snapshot->'stores') loop
   insert into bemo_private.suborders(parent_id,store_id,store_title,currency,items_minor,delivery_fee_minor)
    values(po.id,(shop->>'store_id')::uuid,shop->>'store_title',po.currency,(shop->>'items_minor')::bigint,(shop->>'delivery_fee_minor')::bigint) returning id into sid;
   for item in select value from jsonb_array_elements(snapshot->'items') where value->>'store_id'=shop->>'store_id' loop
    insert into bemo_private.order_lines(suborder_id,variant_id,product_id,title,variant_label,sku,quantity,unit_price_minor,currency)
     values(sid,(item->>'variant_id')::uuid,(item->>'product_id')::uuid,item->>'title',item->>'variant_label',item->>'sku',(item->>'quantity')::int,(item->>'unit_price_minor')::bigint,po.currency);
   end loop;
   insert into bemo_private.order_events(suborder_id,actor_id,action,to_state) values(sid,actor.id,'CREATED','PENDING_SELLER');
   insert into bemo_private.notifications(user_id,suborder_id,kind,dedup_key)
    select owner_user_id,sid,'ORDER_CREATED',sid::text||':created' from bemo_private.stores where id=(shop->>'store_id')::uuid;
  end loop;
 end if;
 select coalesce(jsonb_agg(bemo_private.order_projection(s.id,true) order by s.id),'[]') into response from bemo_private.suborders s where parent_id=po.id;
 return jsonb_build_object('id',po.id,'currency',po.currency,'total_minor',po.total_minor,'suborders',response);
end; $$;

create function bemo_private.list_orders(view_as text,limit_count int,offset_count int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; shop_id uuid; result jsonb;
begin
 actor:=bemo_private.require_actor();
 if view_as is null or view_as not in ('buyer','seller') or limit_count is null or limit_count not between 1 and 50 or offset_count is null or offset_count not between 0 and 10000 then raise exception 'BEMO_QUERY_INVALID'; end if;
 if view_as='seller' then select id into shop_id from bemo_private.stores where owner_user_id=actor.id; end if;
 select coalesce(jsonb_agg(bemo_private.order_projection(x.id,false) order by x.created_at desc,x.id),'[]') into result from
  (select s.id,s.created_at from bemo_private.suborders s join bemo_private.parent_orders p on p.id=s.parent_id
   where (view_as='buyer' and p.buyer_id=actor.id) or (view_as='seller' and s.store_id=shop_id)
   order by s.created_at desc,s.id limit limit_count offset offset_count) x;
 return result;
end; $$;

create function bemo_private.get_order(order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; o bemo_private.suborders; buyer uuid; seller uuid; allowed boolean:=false;
begin
 actor:=bemo_private.require_actor(); select * into o from bemo_private.suborders where id=order_id;
 if not found then raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 select buyer_id into buyer from bemo_private.parent_orders where id=o.parent_id;
 select owner_user_id into seller from bemo_private.stores where id=o.store_id;
 if actor.id=buyer then allowed:=true;
 elsif actor.id=seller then allowed:=o.accepted_at is not null;
 else raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 if actor.id=seller and allowed then insert into bemo_private.order_access_log(actor_id,suborder_id,purpose) values(actor.id,o.id,'SELLER_FULFILLMENT'); end if;
 return bemo_private.order_projection(o.id,allowed);
end; $$;

create function bemo_private.order_action(order_id uuid,action text,reason text,expected_version int,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; shop bemo_private.stores; o bemo_private.suborders; buyer uuid; previous bemo_private.order_requests;
 target text; old_state text; line bemo_private.order_lines; stock bemo_private.stock_positions; movement uuid; kind text;
begin
 actor:=bemo_private.require_actor(true);
 if action is null or request_id is null or expected_version is null or reason is null or char_length(reason)>2000 then raise exception 'BEMO_ACTION_INVALID'; end if;
 -- Serialize with all merchant changes before locking the suborder.
 if action in ('ACCEPT','REJECT','PACK','SHIP','ATTEMPT_DELIVERY','DELIVER','FAIL_DELIVERY') then shop:=bemo_private.merchant_store(); end if;
 select * into o from bemo_private.suborders where id=order_id for update;
 if not found then raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 select buyer_id into buyer from bemo_private.parent_orders where id=o.parent_id;
 if shop.id is not null then
  if shop.id<>o.store_id then raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 elsif action not in ('CANCEL','REQUEST_CANCEL','REQUEST_RETURN') or actor.id<>buyer then raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 select * into previous from bemo_private.order_requests r where r.actor_id=actor.id and r.request_id=order_action.request_id;
 if found then
  if previous.suborder_id<>o.id or previous.action<>action or previous.reason<>reason then raise exception 'BEMO_REQUEST_CONFLICT'; end if;
  return bemo_private.order_projection(o.id,false);
 end if;
 if expected_version<>o.version then raise exception 'BEMO_VERSION_CONFLICT'; end if;
 old_state:=o.state;
 if action='ACCEPT' and o.state='PENDING_SELLER' then
  -- Lock in deterministic order, fail the entire transaction if ANY item is unavailable.
  for line in select * from bemo_private.order_lines where suborder_id=o.id order by variant_id loop
   select * into stock from bemo_private.stock_positions where variant_id=line.variant_id for update;
   if stock.stock_on_hand<line.quantity or not exists(select 1 from bemo_private.product_variants v join bemo_private.products p on p.id=v.product_id where v.id=line.variant_id and v.active and p.status='ACTIVE') then raise exception 'BEMO_STOCK_INSUFFICIENT'; end if;
   if line.debit_movement_id is not null then raise exception 'BEMO_STOCK_ALREADY_DEBITED'; end if;
   insert into bemo_private.inventory_movements(variant_id,store_id,actor_user_id,kind,delta,before_quantity,after_quantity,reason,request_id)
    values(line.variant_id,o.store_id,actor.id,'ACCEPT_DEBIT',-line.quantity,stock.stock_on_hand,stock.stock_on_hand-line.quantity,'ORDER_ACCEPTED',gen_random_uuid()) returning id into movement;
   update bemo_private.stock_positions set stock_on_hand=stock_on_hand-line.quantity,version=version+1,updated_at=now() where variant_id=line.variant_id;
   update bemo_private.order_lines set debit_movement_id=movement where id=line.id;
  end loop;
  target:='ACCEPTED';
 elsif action='REJECT' and o.state='PENDING_SELLER' then target:='REJECTED_BY_SELLER';
 elsif action='CANCEL' and o.state in ('PENDING_SELLER','ESCALATED_TO_SUPPORT') and o.accepted_at is null then target:='CANCELLED_BY_BUYER_PRE_ACCEPT';
 elsif action='PACK' and o.state='ACCEPTED' then target:='PACKING';
 elsif action='SHIP' and o.state in ('ACCEPTED','PACKING') then target:='SHIPPED';
 elsif action='ATTEMPT_DELIVERY' and o.state='SHIPPED' then target:='DELIVERY_ATTEMPTED';
 elsif action='DELIVER' and o.state in ('SHIPPED','DELIVERY_ATTEMPTED') then target:='DELIVERED';
 elsif action='FAIL_DELIVERY' and o.state in ('SHIPPED','DELIVERY_ATTEMPTED') then target:='FAILED_DELIVERY';kind:='DELIVERY_FAILURE';
 elsif action='REQUEST_CANCEL' and o.state in ('ACCEPTED','PACKING','SHIPPED','DELIVERY_ATTEMPTED') then target:='CANCEL_REQUESTED';kind:='CANCELLATION';
 elsif action='REQUEST_RETURN' and o.state='DELIVERED' then target:='RETURN_REQUESTED';kind:='RETURN';
 else raise exception 'BEMO_TRANSITION_INVALID'; end if;
 if action in ('REJECT','REQUEST_CANCEL','REQUEST_RETURN','FAIL_DELIVERY') and char_length(btrim(reason))<20 then raise exception 'BEMO_REASON_REQUIRED'; end if;
 update bemo_private.suborders set state=target,version=version+1,updated_at=now(),
  accepted_at=case when target='ACCEPTED' then now() else accepted_at end,
  delivered_at=case when target='DELIVERED' then now() else delivered_at end where id=o.id;
 if kind is not null then insert into bemo_private.order_cases(suborder_id,kind,prior_state,reason) values(o.id,kind,old_state,reason); end if;
 if action='CANCEL' then update bemo_private.order_cases set state='RESOLVED',resolution='BUYER_CANCELLED_PRE_ACCEPT',resolved_at=now() where suborder_id=o.id and state<>'RESOLVED'; end if;
 insert into bemo_private.order_events(suborder_id,actor_id,action,from_state,to_state,reason) values(o.id,actor.id,action,old_state,target,reason);
 insert into bemo_private.order_requests values(actor.id,request_id,o.id,action,reason);
 insert into bemo_private.notifications(user_id,suborder_id,kind,dedup_key)
  select x,o.id,target,o.id::text||':v'||(o.version+1) from (select buyer x union select owner_user_id from bemo_private.stores where id=o.store_id) recipients;
 return bemo_private.order_projection(o.id,false);
end; $$;

create function public.bemo_quote_cart(cart jsonb) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.create_quote($1)$$;
create function public.bemo_place_order(quote_id uuid,delivery jsonb,request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.place_order($1,$2,$3)$$;
create function public.bemo_list_orders(view_as text default 'buyer',limit_count int default 24,offset_count int default 0) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.list_orders($1,$2,$3)$$;
create function public.bemo_get_order(order_id uuid) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.get_order($1)$$;
create function public.bemo_order_action(order_id uuid,action text,reason text,expected_version int,request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.order_action($1,$2,$3,$4,$5)$$;

do $$declare t text; f text; begin
 foreach t in array array['checkout_quotes','parent_orders','order_delivery','suborders','order_lines','order_events','order_requests','order_cases','order_access_log','notifications'] loop
  execute format('alter table bemo_private.%I enable row level security',t);
  execute format('revoke all on bemo_private.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach f in array array['bemo_private.quote_snapshot(jsonb,uuid)','bemo_private.order_projection(uuid,boolean)',
  'bemo_private.create_quote(jsonb)','bemo_private.place_order(uuid,jsonb,uuid)','bemo_private.list_orders(text,int,int)','bemo_private.get_order(uuid)','bemo_private.order_action(uuid,text,text,int,uuid)',
  'public.bemo_quote_cart(jsonb)','public.bemo_place_order(uuid,jsonb,uuid)','public.bemo_list_orders(text,int,int)','public.bemo_get_order(uuid)','public.bemo_order_action(uuid,text,text,int,uuid)'] loop
  execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';
  if f not in ('bemo_private.quote_snapshot(jsonb,uuid)','bemo_private.order_projection(uuid,boolean)') then execute 'grant execute on function '||f||' to authenticated'; end if;
 end loop;
end; $$;
-- Support access is assigned, role-checked against trusted rows and audited.
-- No initial privileged user is provisioned by this migration.
create function bemo_private.support_actor() returns bemo_private.app_users
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor(true);
 if not exists(select 1 from bemo_private.user_roles where user_id=actor.id and role in ('support','superadmin')) then raise exception 'BEMO_SUPPORT_REQUIRED'; end if;
 return actor;
end; $$;

create function bemo_private.support_queue(limit_count int,offset_count int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; result jsonb;
begin
 actor:=bemo_private.support_actor();
 if limit_count is null or limit_count not between 1 and 50 or offset_count is null or offset_count not between 0 and 10000 then raise exception 'BEMO_QUERY_INVALID'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'suborder_id',c.suborder_id,'kind',c.kind,'state',c.state,'created_at',c.created_at,
  'assigned_to_me',c.assigned_to=actor.id,'unassigned',c.assigned_to is null) order by c.created_at,c.id),'[]') into result
 from (select * from bemo_private.order_cases where state<>'RESOLVED' order by created_at,id limit limit_count offset offset_count) c;
 return result;
end; $$;

create function bemo_private.support_case(case_id uuid,claim_case boolean) returns jsonb
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
 return jsonb_build_object('case',to_jsonb(c)-'assigned_to','order',bemo_private.order_projection(c.suborder_id,true));
end; $$;

create function bemo_private.support_decision(case_id uuid,decision text,reason text,goods_received boolean,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; c bemo_private.order_cases; o bemo_private.suborders; sid uuid; target text; buyer uuid;
 line bemo_private.order_lines; stock bemo_private.stock_positions; movement uuid; do_restore boolean:=false;
begin
 actor:=bemo_private.support_actor();
 if reason is null or char_length(btrim(reason)) not between 20 and 2000 or decision is null or goods_received is null or expected_version is null then raise exception 'BEMO_REASON_REQUIRED'; end if;
 select s.store_id into sid from bemo_private.order_cases oc join bemo_private.suborders s on s.id=oc.suborder_id where oc.id=case_id;
 if sid is null then raise exception 'BEMO_CASE_UNAVAILABLE'; end if;
 perform id from bemo_private.stores where id=sid for update;
 select s.* into o from bemo_private.suborders s join bemo_private.order_cases oc on oc.suborder_id=s.id where oc.id=case_id for update of s;
 select * into c from bemo_private.order_cases where id=case_id for update;
 select buyer_id into buyer from bemo_private.parent_orders where id=o.parent_id;
 if actor.id=buyer or exists(select 1 from bemo_private.stores where id=sid and owner_user_id=actor.id) then raise exception 'BEMO_CASE_CONFLICT_OF_INTEREST'; end if;
 if c.assigned_to is distinct from actor.id then raise exception 'BEMO_CASE_NOT_ASSIGNED'; end if;
 if c.state='RESOLVED' then
  if c.resolution=decision||':'||goods_received::text||':'||reason then return bemo_private.order_projection(o.id,false); end if;
  raise exception 'BEMO_CASE_RESOLVED';
 end if;
 if o.version<>expected_version then raise exception 'BEMO_VERSION_CONFLICT'; end if;
 if decision='FOLLOW_UP' and c.kind='SELLER_DELAY' and o.state='ESCALATED_TO_SUPPORT' then target:='PENDING_SELLER';
 elsif decision='CANCEL_NON_RESPONSE' and c.kind='SELLER_DELAY' and o.accepted_at is null and o.state='ESCALATED_TO_SUPPORT' then target:='CANCELLED_BY_SUPPORT';
 elsif decision='DENY_REQUEST' and c.kind in ('CANCELLATION','RETURN') and o.state in ('CANCEL_REQUESTED','RETURN_REQUESTED','RETURN_IN_REVIEW') then target:=c.prior_state;
 elsif decision='REVIEW_RETURN' and c.kind='RETURN' and o.state='RETURN_REQUESTED' then target:='RETURN_IN_REVIEW';
 elsif decision='APPROVE_CANCEL' and c.kind in ('CANCELLATION','DELIVERY_FAILURE') and o.state in ('CANCEL_REQUESTED','FAILED_DELIVERY') then target:='CANCELLED_BY_SUPPORT';do_restore:=goods_received;
 elsif decision='CONFIRM_RETURN' and c.kind='RETURN' and o.state='RETURN_IN_REVIEW' and goods_received then target:='RETURNED';do_restore:=true;
 else raise exception 'BEMO_TRANSITION_INVALID'; end if;
 if goods_received and not do_restore then raise exception 'BEMO_RESTOCK_INVALID'; end if;
 if do_restore then
  for line in select * from bemo_private.order_lines where suborder_id=o.id order by variant_id loop
   if line.debit_movement_id is null or line.restore_movement_id is not null then raise exception 'BEMO_RESTOCK_INVALID'; end if;
   select * into stock from bemo_private.stock_positions where variant_id=line.variant_id for update;
   if stock.stock_on_hand::bigint+line.quantity>1000000000 then raise exception 'BEMO_STOCK_INVALID'; end if;
   insert into bemo_private.inventory_movements(variant_id,store_id,actor_user_id,kind,delta,before_quantity,after_quantity,reason,request_id)
    values(line.variant_id,o.store_id,actor.id,case when target='RETURNED' then 'RETURN_RESTORE' else 'CANCEL_RESTORE' end,line.quantity,stock.stock_on_hand,stock.stock_on_hand+line.quantity,'CASE:'||c.id,gen_random_uuid()) returning id into movement;
   update bemo_private.stock_positions set stock_on_hand=stock_on_hand+line.quantity,version=version+1,updated_at=now() where variant_id=line.variant_id;
   update bemo_private.order_lines set restore_movement_id=movement where id=line.id;
  end loop;
 end if;
 update bemo_private.suborders set state=target,version=version+1,updated_at=now(),
  pending_since=case when target='PENDING_SELLER' then now() else pending_since end,
  response_cycle=response_cycle+case when target='PENDING_SELLER' then 1 else 0 end where id=o.id;
 if decision<>'REVIEW_RETURN' then update bemo_private.order_cases set state='RESOLVED',resolution=decision||':'||goods_received::text||':'||support_decision.reason,resolved_at=now() where id=c.id; end if;
 insert into bemo_private.order_events(suborder_id,actor_id,action,from_state,to_state,reason) values(o.id,actor.id,decision,o.state,target,reason);
 insert into bemo_private.notifications(user_id,suborder_id,kind,dedup_key)
  select x,o.id,target,o.id::text||':v'||(o.version+1) from (select buyer x union select owner_user_id from bemo_private.stores where id=o.store_id) recipients;
 return bemo_private.order_projection(o.id,false);
end; $$;

-- Called only by the trusted database scheduler, never a browser or service key.
-- Durable timestamps and unique notification keys make retries safe across restarts.
create function bemo_private.process_order_deadlines() returns jsonb
language plpgsql security definer set search_path='' as $$
declare o bemo_private.suborders; buyer uuid; seller uuid; reminded int:=0; escalated int:=0; affected int;
begin
 for o in select s.* from bemo_private.suborders s where s.state='PENDING_SELLER' and s.pending_since<=now()-interval '24 hours'
  and (s.pending_since<=now()-interval '48 hours' or not exists(select 1 from bemo_private.notifications n where n.suborder_id=s.id and n.dedup_key=s.id::text||':reminder:'||s.response_cycle))
  order by s.pending_since,s.id limit 500 for update of s skip locked loop
  select owner_user_id into seller from bemo_private.stores where id=o.store_id;
  insert into bemo_private.notifications(user_id,suborder_id,kind,dedup_key) values(seller,o.id,'SELLER_REMINDER_24H',o.id::text||':reminder:'||o.response_cycle) on conflict do nothing;
  get diagnostics affected=row_count;reminded:=reminded+affected;
  if o.pending_since<=now()-interval '48 hours' then
   select buyer_id into buyer from bemo_private.parent_orders where id=o.parent_id;
   insert into bemo_private.order_cases(suborder_id,kind,prior_state,reason) values(o.id,'SELLER_DELAY',o.state,'SELLER_NON_RESPONSE');
   update bemo_private.suborders set state='ESCALATED_TO_SUPPORT',version=version+1,updated_at=now() where id=o.id;
   insert into bemo_private.order_events(suborder_id,action,from_state,to_state) values(o.id,'DEADLINE_48H',o.state,'ESCALATED_TO_SUPPORT');
   insert into bemo_private.notifications(user_id,suborder_id,kind,dedup_key) values(buyer,o.id,'SELLER_DELAY_48H',o.id::text||':delay:'||o.response_cycle) on conflict do nothing;
   escalated:=escalated+1;
  end if;
 end loop;
 return jsonb_build_object('reminded',reminded,'escalated',escalated);
end; $$;

create function bemo_private.notification_inbox(limit_count int,offset_count int,mark_read uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; result jsonb;
begin
 actor:=bemo_private.require_actor();
 if limit_count is null or limit_count not between 1 and 50 or offset_count is null or offset_count not between 0 and 10000 then raise exception 'BEMO_QUERY_INVALID'; end if;
 if mark_read is not null then update bemo_private.notifications set read_at=coalesce(read_at,now()) where id=mark_read and user_id=actor.id; end if;
 select coalesce(jsonb_agg(to_jsonb(n)-'user_id'-'dedup_key' order by created_at desc,id),'[]') into result from
  (select * from bemo_private.notifications where user_id=actor.id order by created_at desc,id limit limit_count offset offset_count) n;
 return result;
end; $$;

create function public.bemo_support_queue(limit_count int default 24,offset_count int default 0) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.support_queue($1,$2)$$;
create function public.bemo_support_case(case_id uuid,claim_case boolean default false) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.support_case($1,$2)$$;
create function public.bemo_support_decision(case_id uuid,decision text,reason text,goods_received boolean,expected_version int) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.support_decision($1,$2,$3,$4,$5)$$;
create function public.bemo_notifications(limit_count int default 24,offset_count int default 0,mark_read uuid default null) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.notification_inbox($1,$2,$3)$$;
do $$declare f text; begin
 foreach f in array array['bemo_private.support_actor()','bemo_private.process_order_deadlines()',
  'bemo_private.support_queue(int,int)','bemo_private.support_case(uuid,boolean)','bemo_private.support_decision(uuid,text,text,boolean,int)','bemo_private.notification_inbox(int,int,uuid)',
  'public.bemo_support_queue(int,int)','public.bemo_support_case(uuid,boolean)','public.bemo_support_decision(uuid,text,text,boolean,int)','public.bemo_notifications(int,int,uuid)'] loop
  execute 'revoke all on function '||f||' from public,anon,authenticated,service_role';
  if f not in ('bemo_private.support_actor()','bemo_private.process_order_deadlines()') then execute 'grant execute on function '||f||' to authenticated'; end if;
 end loop;
end; $$;
commit;
