-- Additive merchant catalog. No seed products, orders or privileged accounts.
begin;
create table bemo_private.currencies (
 code text primary key check(code ~ '^[A-Z]{3}$'),
 minor_digits int not null check(minor_digits between 0 and 3)
);
insert into bemo_private.currencies values
 ('USD',2),('IQD',3),('EUR',2),('GBP',2),('AED',2),('SAR',2),('KWD',3),('BHD',3),('OMR',3),('JOD',3),('QAR',2),('EGP',2),('TRY',2),('JPY',0),('CAD',2),('AUD',2);
create table bemo_private.store_settings (
 store_id uuid primary key references bemo_private.stores(id),
 currency text not null references bemo_private.currencies(code),
 delivery_fee_minor bigint not null check(delivery_fee_minor between 0 and 999999999999),
 version int not null default 1,
 updated_at timestamptz not null default now()
);
create table bemo_private.products (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references bemo_private.stores(id),
 title text not null check(char_length(btrim(title)) between 5 and 160),
 description text not null check(char_length(btrim(description)) between 20 and 8000),
 category text not null check(category in ('home','fashion','electronics','beauty','sports','other')),
 status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','HIDDEN_BY_OWNER','SUSPENDED','ARCHIVED')),
 version int not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,store_id)
);
create index products_store_created on bemo_private.products(store_id,created_at desc,id);
create index products_public_created on bemo_private.products(created_at desc,id) where status='ACTIVE';
create table bemo_private.product_variants (
 id uuid primary key default gen_random_uuid(), product_id uuid not null, store_id uuid not null,
 sku text not null check(char_length(btrim(sku)) between 1 and 64),
 label text not null default '' check(char_length(label)<=120),
 price_minor bigint not null check(price_minor between 1 and 999999999999),
 currency text not null references bemo_private.currencies(code),
 active boolean not null default true, version int not null default 1,
 foreign key(product_id,store_id) references bemo_private.products(id,store_id),
 unique(store_id,sku), unique(id,store_id)
);
create table bemo_private.stock_positions (
 variant_id uuid primary key, store_id uuid not null,
 stock_on_hand int not null default 0 check(stock_on_hand between 0 and 1000000000),
 version int not null default 1, updated_at timestamptz not null default now(),
 foreign key(variant_id,store_id) references bemo_private.product_variants(id,store_id)
);
create table bemo_private.inventory_movements (
 id uuid primary key default gen_random_uuid(), variant_id uuid not null, store_id uuid not null,
 actor_user_id uuid not null references bemo_private.app_users(id),
 kind text not null check(kind in ('MANUAL_ADD','MANUAL_REMOVE','ACCEPT_DEBIT','CANCEL_RESTORE','RETURN_RESTORE')),
 delta int not null check(delta<>0), before_quantity int not null check(before_quantity>=0),
 after_quantity int not null check(after_quantity>=0),
 reason text not null check(char_length(btrim(reason)) between 3 and 500),
 request_id uuid not null, created_at timestamptz not null default now(),
 foreign key(variant_id,store_id) references bemo_private.product_variants(id,store_id),
 check(after_quantity::bigint=before_quantity::bigint+delta::bigint),
 unique(store_id,request_id)
);
create index inventory_movements_variant_created on bemo_private.inventory_movements(variant_id,created_at desc);
create table bemo_private.merchant_events (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references bemo_private.app_users(id),
 store_id uuid not null references bemo_private.stores(id), action text not null,
 object_id uuid not null, created_at timestamptz not null default now()
);
alter table bemo_private.currencies enable row level security;
alter table bemo_private.store_settings enable row level security;
alter table bemo_private.products enable row level security;
alter table bemo_private.product_variants enable row level security;
alter table bemo_private.stock_positions enable row level security;
alter table bemo_private.inventory_movements enable row level security;
alter table bemo_private.merchant_events enable row level security;
revoke all on bemo_private.currencies,bemo_private.store_settings,bemo_private.products,
 bemo_private.product_variants,bemo_private.stock_positions,bemo_private.inventory_movements,bemo_private.merchant_events
 from public,anon,authenticated,service_role;

create function bemo_private.merchant_store() returns bemo_private.stores
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; shop bemo_private.stores;
begin
 actor:=bemo_private.require_actor(true);
 select * into shop from bemo_private.stores where owner_user_id=actor.id for update;
 if shop.id is null or shop.status<>'ACTIVE' then raise exception using errcode='42501',message='BEMO_STORE_UNAVAILABLE'; end if;
 return shop;
end; $$;

create function bemo_private.merchant_settings(fee bigint, currency_code text, expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; saved bemo_private.store_settings;
begin
 shop:=bemo_private.merchant_store();
 if fee is null or fee<0 or fee>999999999999 or currency_code is null or not exists(select 1 from bemo_private.currencies where code=currency_code) or expected_version is null then
  raise exception using errcode='22023',message='BEMO_SETTINGS_INVALID'; end if;
 select * into saved from bemo_private.store_settings where store_id=shop.id;
 if coalesce(saved.version,0)<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
 if saved.currency is distinct from currency_code and exists(select 1 from bemo_private.product_variants where store_id=shop.id) then
  raise exception using errcode='22023',message='BEMO_CURRENCY_LOCKED'; end if;
 insert into bemo_private.store_settings(store_id,currency,delivery_fee_minor) values(shop.id,currency_code,fee)
 on conflict(store_id) do update set currency=excluded.currency,delivery_fee_minor=excluded.delivery_fee_minor,
 version=bemo_private.store_settings.version+1,updated_at=now() returning * into saved;
 insert into bemo_private.merchant_events(actor_user_id,store_id,action,object_id) values(shop.owner_user_id,shop.id,'SETTINGS_UPDATED',shop.id);
 return to_jsonb(saved)-'store_id';
end; $$;

create function bemo_private.save_product(product_id uuid,title text,description text,category text,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; item bemo_private.products;
begin
 shop:=bemo_private.merchant_store();
 if title is null or char_length(btrim(title)) not between 5 and 160 or description is null or char_length(btrim(description)) not between 20 and 8000
 or category is null or category not in ('home','fashion','electronics','beauty','sports','other') or expected_version is null then
 raise exception using errcode='22023',message='BEMO_PRODUCT_INVALID'; end if;
 if product_id is null or (expected_version=0 and not exists(select 1 from bemo_private.products p where p.id=product_id)) then
  if expected_version<>0 then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
  insert into bemo_private.products(id,store_id,title,description,category) values(coalesce(product_id,gen_random_uuid()),shop.id,btrim(title),btrim(description),category) returning * into item;
 else
  select p.* into item from bemo_private.products p where p.id=product_id and p.store_id=shop.id for update;
  if item.id is null or item.status in ('SUSPENDED','ARCHIVED') then raise exception using errcode='42501',message='BEMO_PRODUCT_UNAVAILABLE'; end if;
  if expected_version=0 and item.version=1 and item.title=btrim(title) and item.description=btrim(description) and item.category=category then return to_jsonb(item); end if;
  if item.version<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
  update bemo_private.products p set title=btrim(save_product.title),description=btrim(save_product.description),category=save_product.category,
  version=p.version+1,updated_at=now() where p.id=item.id returning * into item;
 end if;
 insert into bemo_private.merchant_events(actor_user_id,store_id,action,object_id) values(shop.owner_user_id,shop.id,'PRODUCT_SAVED',item.id);
 return to_jsonb(item);
end; $$;

create function bemo_private.save_variant(product_id uuid,variant_id uuid,sku text,label text,price_minor bigint,enabled boolean,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; item bemo_private.products; saved bemo_private.product_variants; settings bemo_private.store_settings;
begin
 shop:=bemo_private.merchant_store();
 select * into settings from bemo_private.store_settings where store_id=shop.id;
 if settings.store_id is null then raise exception using errcode='22023',message='BEMO_SETTINGS_REQUIRED'; end if;
 select p.* into item from bemo_private.products p where p.id=product_id and p.store_id=shop.id for update;
 if item.id is null or item.status in ('SUSPENDED','ARCHIVED') then raise exception using errcode='42501',message='BEMO_PRODUCT_UNAVAILABLE'; end if;
 if sku is null or char_length(btrim(sku)) not between 1 and 64 or label is null or char_length(label)>120 or price_minor is null
 or price_minor not between 1 and 999999999999 or enabled is null or expected_version is null then
 raise exception using errcode='22023',message='BEMO_VARIANT_INVALID'; end if;
 if not enabled and item.status='ACTIVE' and not exists(select 1 from bemo_private.product_variants v where v.product_id=item.id and v.active and v.id is distinct from variant_id) then
  raise exception using errcode='22023',message='BEMO_VARIANT_REQUIRED'; end if;
 if variant_id is null or (expected_version=0 and not exists(select 1 from bemo_private.product_variants v where v.id=variant_id)) then
  if expected_version<>0 then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
  if (select count(*) from bemo_private.product_variants v where v.product_id=item.id)>=100 then raise exception using errcode='22023',message='BEMO_VARIANT_LIMIT'; end if;
  insert into bemo_private.product_variants(id,product_id,store_id,sku,label,price_minor,currency,active)
  values(coalesce(variant_id,gen_random_uuid()),item.id,shop.id,btrim(sku),label,price_minor,settings.currency,enabled) returning * into saved;
  insert into bemo_private.stock_positions(variant_id,store_id) values(saved.id,shop.id);
 else
  select v.* into saved from bemo_private.product_variants v where v.id=variant_id and v.product_id=item.id and v.store_id=shop.id for update;
  if saved.id is null then raise exception using errcode='42501',message='BEMO_VARIANT_UNAVAILABLE'; end if;
  if expected_version=0 and saved.version=1 and saved.sku=btrim(sku) and saved.label=label and saved.price_minor=price_minor and saved.active=enabled then return to_jsonb(saved); end if;
  if saved.version<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
  update bemo_private.product_variants v set sku=btrim(save_variant.sku),label=save_variant.label,price_minor=save_variant.price_minor,
  active=enabled,version=v.version+1 where v.id=saved.id returning * into saved;
 end if;
 insert into bemo_private.merchant_events(actor_user_id,store_id,action,object_id) values(shop.owner_user_id,shop.id,'VARIANT_SAVED',saved.id);
 return to_jsonb(saved);
end; $$;

create function bemo_private.adjust_stock(variant_id uuid,delta int,reason text,request_id uuid,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; position bemo_private.stock_positions; previous bemo_private.inventory_movements; movement bemo_private.inventory_movements;
begin
 shop:=bemo_private.merchant_store();
 if variant_id is null or delta is null or delta=0 or delta not between -1000000000 and 1000000000 or reason is null
 or char_length(btrim(reason)) not between 3 and 500 or request_id is null or expected_version is null then
 raise exception using errcode='22023',message='BEMO_STOCK_INVALID'; end if;
 select m.* into previous from bemo_private.inventory_movements m where m.store_id=shop.id and m.request_id=adjust_stock.request_id;
 if previous.id is not null then
  if previous.variant_id<>variant_id or previous.delta<>delta or previous.reason<>btrim(reason) or previous.kind not in ('MANUAL_ADD','MANUAL_REMOVE') then
   raise exception using errcode='22023',message='BEMO_IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(previous);
 end if;
 select s.* into position from bemo_private.stock_positions s where s.variant_id=adjust_stock.variant_id and s.store_id=shop.id for update;
 if position.variant_id is null then raise exception using errcode='42501',message='BEMO_VARIANT_UNAVAILABLE'; end if;
 if position.version<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
 if position.stock_on_hand::bigint+delta::bigint not between 0 and 1000000000 then raise exception using errcode='22023',message='BEMO_INSUFFICIENT_STOCK'; end if;
 update bemo_private.stock_positions s set stock_on_hand=s.stock_on_hand+delta,version=s.version+1,updated_at=now() where s.variant_id=position.variant_id;
 insert into bemo_private.inventory_movements(variant_id,store_id,actor_user_id,kind,delta,before_quantity,after_quantity,reason,request_id)
 values(position.variant_id,shop.id,shop.owner_user_id,case when delta>0 then 'MANUAL_ADD' else 'MANUAL_REMOVE' end,delta,position.stock_on_hand,position.stock_on_hand+delta,btrim(reason),request_id)
 returning * into movement;
 return to_jsonb(movement);
end; $$;

create function bemo_private.merchant_catalog(limit_count int default 24,offset_count int default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; settings jsonb; items jsonb;
begin
 shop:=bemo_private.merchant_store();
 if limit_count is null or limit_count not between 1 and 100 or offset_count is null or offset_count not between 0 and 10000 then
 raise exception using errcode='22023',message='BEMO_QUERY_INVALID'; end if;
 select to_jsonb(s)-'store_id' into settings from bemo_private.store_settings s where s.store_id=shop.id;
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('variants',(
  select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('stock_on_hand',s.stock_on_hand,'stock_version',s.version) order by v.sku),'[]'::jsonb)
  from bemo_private.product_variants v join bemo_private.stock_positions s on s.variant_id=v.id where v.product_id=p.id)) order by p.created_at desc,p.id),'[]'::jsonb)
 into items from (select * from bemo_private.products where store_id=shop.id order by created_at desc,id limit limit_count offset offset_count) p;
 return jsonb_build_object('store',to_jsonb(shop)-'owner_user_id','settings',settings,'products',items,
 'currencies',(select jsonb_agg(to_jsonb(c) order by code) from bemo_private.currencies c),
 'total',(select count(*) from bemo_private.products where store_id=shop.id));
end; $$;

create function public.bemo_merchant_catalog(limit_count int default 24,offset_count int default 0) returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.merchant_catalog($1,$2)$$;
create function public.bemo_save_store_settings(fee bigint,currency_code text,expected_version int) returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.merchant_settings($1,$2,$3)$$;
create function public.bemo_save_product(product_id uuid,title text,description text,category text,expected_version int) returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.save_product($1,$2,$3,$4,$5)$$;
create function public.bemo_save_variant(product_id uuid,variant_id uuid,sku text,label text,price_minor bigint,enabled boolean,expected_version int) returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.save_variant($1,$2,$3,$4,$5,$6,$7)$$;
create function public.bemo_adjust_stock(variant_id uuid,delta int,reason text,request_id uuid,expected_version int) returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.adjust_stock($1,$2,$3,$4,$5)$$;
revoke all on function bemo_private.merchant_store(),bemo_private.merchant_settings(bigint,text,int),
 bemo_private.save_product(uuid,text,text,text,int),bemo_private.save_variant(uuid,uuid,text,text,bigint,boolean,int),
 bemo_private.adjust_stock(uuid,int,text,uuid,int),bemo_private.merchant_catalog(int,int),
 public.bemo_merchant_catalog(int,int),public.bemo_save_store_settings(bigint,text,int),
 public.bemo_save_product(uuid,text,text,text,int),public.bemo_save_variant(uuid,uuid,text,text,bigint,boolean,int),
 public.bemo_adjust_stock(uuid,int,text,uuid,int) from public,anon,authenticated,service_role;
grant execute on function bemo_private.merchant_settings(bigint,text,int),bemo_private.save_product(uuid,text,text,text,int),
 bemo_private.save_variant(uuid,uuid,text,text,bigint,boolean,int),bemo_private.adjust_stock(uuid,int,text,uuid,int),bemo_private.merchant_catalog(int,int),
 public.bemo_merchant_catalog(int,int),public.bemo_save_store_settings(bigint,text,int),public.bemo_save_product(uuid,text,text,text,int),
 public.bemo_save_variant(uuid,uuid,text,text,bigint,boolean,int),public.bemo_adjust_stock(uuid,int,text,uuid,int) to authenticated;
commit;
