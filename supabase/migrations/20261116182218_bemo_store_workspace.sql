-- Storefront, owner workspace and private saved addresses. No sample business data.
begin;
alter table bemo_private.stores add column profile_version int not null default 1;
alter table bemo_private.stores add column location_label text not null default '' check(char_length(location_label)<=160);
alter table bemo_private.stores add column headline text not null default '' check(char_length(headline)<=160);

create function bemo_private.get_store(store_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'slug',s.slug,'title',s.title,'description',s.description,
 'location_label',s.location_label,'headline',s.headline,'created_at',s.created_at,
 'product_count',(select count(*) from bemo_private.products p where p.store_id=s.id and p.status='ACTIVE'),
 'categories',(select coalesce(jsonb_agg(x.category order by x.category),'[]'::jsonb) from
   (select distinct p.category from bemo_private.products p where p.store_id=s.id and p.status='ACTIVE') x),
 'currency',ss.currency,'delivery_fee_minor',ss.delivery_fee_minor)
 from bemo_private.stores s join bemo_private.app_users u on u.id=s.owner_user_id
 join auth.users au on au.id=u.auth_subject left join bemo_private.store_settings ss on ss.store_id=s.id
 where s.slug=store_slug and s.status='ACTIVE' and u.status='ACTIVE' and au.deleted_at is null
 and (au.banned_until is null or au.banned_until<=now());
$$;
create function public.bemo_get_store(store_slug text) returns jsonb
language sql stable security invoker set search_path='' as $$select bemo_private.get_store($1)$$;

create function bemo_private.store_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; result jsonb;
begin
 shop:=bemo_private.merchant_store();
 select jsonb_build_object('id',shop.id,'slug',shop.slug,'title',shop.title,'description',shop.description,
 'location_label',shop.location_label,'headline',shop.headline,'profile_version',shop.profile_version,
 'currency',ss.currency,'delivery_fee_minor',ss.delivery_fee_minor) into result
 from (select 1) dummy left join bemo_private.store_settings ss on ss.store_id=shop.id;
 return result;
end; $$;
create function public.bemo_store_workspace() returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.store_workspace()$$;

create function bemo_private.save_store_profile(title text,description text,location_label text,headline text,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores;
begin
 shop:=bemo_private.merchant_store();
 if title is null or char_length(btrim(title)) not between 2 and 80 or description is null or char_length(description)>2000
 or location_label is null or char_length(location_label)>160 or headline is null or char_length(headline)>160 or expected_version is null then
 raise exception using errcode='22023',message='BEMO_STORE_PROFILE_INVALID'; end if;
 if shop.profile_version<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
 if exists(select 1 from bemo_private.stores s where lower(btrim(s.title))=lower(btrim(save_store_profile.title)) and s.id<>shop.id) then
 raise exception using errcode='23505',message='BEMO_TITLE_TAKEN'; end if;
 update bemo_private.stores s set title=btrim(save_store_profile.title),description=btrim(save_store_profile.description),
 location_label=btrim(save_store_profile.location_label),headline=btrim(save_store_profile.headline),profile_version=s.profile_version+1,updated_at=now()
 where s.id=shop.id;
 insert into bemo_private.merchant_events(actor_user_id,store_id,action,object_id) values(shop.owner_user_id,shop.id,'STORE_PROFILE_UPDATED',shop.id);
 return bemo_private.store_workspace();
end; $$;
create function public.bemo_save_store_profile(title text,description text,location_label text,headline text,expected_version int) returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.save_store_profile($1,$2,$3,$4,$5)$$;

create function bemo_private.seller_dashboard() returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores;
begin
 shop:=bemo_private.merchant_store();
 return jsonb_build_object('store',bemo_private.store_workspace(),
 'products',(select count(*) from bemo_private.products p where p.store_id=shop.id and p.status='ACTIVE'),
 'drafts',(select count(*) from bemo_private.products p where p.store_id=shop.id and p.status='DRAFT'),
 'pending',(select count(*) from bemo_private.suborders o where o.store_id=shop.id and o.state in ('PENDING_SELLER','ESCALATED_TO_SUPPORT')),
 'orders',(select count(*) from bemo_private.suborders o where o.store_id=shop.id),
 'low_stock',(select count(*) from bemo_private.product_variants v join bemo_private.stock_positions sp on sp.variant_id=v.id
 join bemo_private.products p on p.id=v.product_id where v.store_id=shop.id and v.active and p.status='ACTIVE' and sp.stock_on_hand<=5),
 'cod_by_currency',(select coalesce(jsonb_agg(x),'[]'::jsonb) from
   (select o.currency,sum(o.items_minor+o.delivery_fee_minor) as total_minor from bemo_private.suborders o
   where o.store_id=shop.id and o.state='DELIVERED' group by o.currency order by o.currency) x),
 'trend',(select jsonb_agg(x order by x.day) from
   (select to_char(d,'YYYY-MM-DD') as day,count(o.id) as orders from generate_series(date_trunc('day',now() at time zone 'UTC')-interval '13 days',date_trunc('day',now() at time zone 'UTC'),interval '1 day') d
    left join bemo_private.suborders o on o.store_id=shop.id and o.created_at>=d at time zone 'UTC' and o.created_at<(d+interval '1 day') at time zone 'UTC'
    group by d) x),
 'recent_orders',(select coalesce(jsonb_agg(x order by x.created_at desc,x.id),'[]'::jsonb) from
   (select o.id,o.state,o.currency,o.items_minor+o.delivery_fee_minor as total_minor,o.created_at
    from bemo_private.suborders o where o.store_id=shop.id order by o.created_at desc,o.id limit 6) x));
end; $$;
create function public.bemo_seller_dashboard() returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.seller_dashboard()$$;

create table bemo_private.saved_addresses (
 id uuid primary key, owner_id uuid not null references bemo_private.app_users(id),
 label text not null check(char_length(btrim(label)) between 1 and 60),
 delivery jsonb not null, version int not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index saved_addresses_owner on bemo_private.saved_addresses(owner_id,created_at,id);
alter table bemo_private.saved_addresses enable row level security;
revoke all on bemo_private.saved_addresses from public,anon,authenticated,service_role;
create function bemo_private.list_addresses() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor();
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label',a.label,'delivery',a.delivery,'version',a.version) order by a.created_at,a.id),'[]'::jsonb)
 from bemo_private.saved_addresses a where a.owner_id=actor.id);
end; $$;
create function public.bemo_list_addresses() returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.list_addresses()$$;

create function bemo_private.save_address(address_id uuid,label text,delivery jsonb,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; saved bemo_private.saved_addresses; clean jsonb;
begin
 actor:=bemo_private.require_actor(true);
 if address_id is null or label is null or char_length(btrim(label)) not between 1 and 60 or expected_version is null
 or jsonb_typeof(delivery) is distinct from 'object' then raise exception using errcode='22023',message='BEMO_ADDRESS_INVALID'; end if;
 if exists(select 1 from jsonb_each(delivery) e where e.key not in ('recipient','phone','country','region','city','address','note') or jsonb_typeof(e.value)<>'string') then
 raise exception using errcode='22023',message='BEMO_ADDRESS_INVALID'; end if;
 clean:=jsonb_build_object('recipient',btrim(delivery->>'recipient'),'phone',btrim(delivery->>'phone'),'country',btrim(delivery->>'country'),
 'region',btrim(delivery->>'region'),'city',btrim(delivery->>'city'),'address',btrim(delivery->>'address'),'note',btrim(coalesce(delivery->>'note','')));
 if coalesce(char_length(clean->>'recipient'),0) not between 2 and 120 or coalesce(clean->>'phone','') !~ '^\+?[0-9 ()-]{7,25}$'
 or coalesce(char_length(clean->>'country'),0) not between 2 and 80 or coalesce(char_length(clean->>'region'),0) not between 1 and 120
 or coalesce(char_length(clean->>'city'),0) not between 1 and 120 or coalesce(char_length(clean->>'address'),0) not between 8 and 600
 or char_length(clean->>'note')>1000 then raise exception using errcode='22023',message='BEMO_ADDRESS_INVALID'; end if;
 select a.* into saved from bemo_private.saved_addresses a where a.id=address_id;
 if saved.id is null then
  if expected_version<>0 then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
  if (select count(*) from bemo_private.saved_addresses a where a.owner_id=actor.id)>=10 then raise exception using errcode='22023',message='BEMO_ADDRESS_LIMIT'; end if;
  insert into bemo_private.saved_addresses(id,owner_id,label,delivery) values(address_id,actor.id,btrim(label),clean) returning * into saved;
 else
  if saved.owner_id<>actor.id then raise exception using errcode='42501',message='BEMO_ADDRESS_UNAVAILABLE'; end if;
  if expected_version=0 and saved.version=1 and saved.label=btrim(label) and saved.delivery=clean then
   return jsonb_build_object('id',saved.id,'label',saved.label,'delivery',saved.delivery,'version',saved.version); end if;
  if saved.version<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
  update bemo_private.saved_addresses a set label=btrim(save_address.label),delivery=clean,version=a.version+1,updated_at=now()
  where a.id=saved.id returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'label',saved.label,'delivery',saved.delivery,'version',saved.version);
end; $$;
create function public.bemo_save_address(address_id uuid,label text,delivery jsonb,expected_version int) returns jsonb
language sql security invoker set search_path='' as $$select bemo_private.save_address($1,$2,$3,$4)$$;
create function bemo_private.delete_address(address_id uuid,expected_version int) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; saved bemo_private.saved_addresses;
begin
 actor:=bemo_private.require_actor(true);
 select a.* into saved from bemo_private.saved_addresses a where a.id=address_id and a.owner_id=actor.id;
 if saved.id is null then raise exception using errcode='42501',message='BEMO_ADDRESS_UNAVAILABLE'; end if;
 if expected_version is null or saved.version<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
 delete from bemo_private.saved_addresses a where a.id=saved.id;
 return true;
end; $$;
create function public.bemo_delete_address(address_id uuid,expected_version int) returns boolean
language sql security invoker set search_path='' as $$select bemo_private.delete_address($1,$2)$$;

revoke all on function bemo_private.get_store(text),public.bemo_get_store(text),
 bemo_private.store_workspace(),public.bemo_store_workspace(),bemo_private.save_store_profile(text,text,text,text,int),public.bemo_save_store_profile(text,text,text,text,int),
 bemo_private.seller_dashboard(),public.bemo_seller_dashboard(),bemo_private.list_addresses(),public.bemo_list_addresses(),
 bemo_private.save_address(uuid,text,jsonb,int),public.bemo_save_address(uuid,text,jsonb,int),
 bemo_private.delete_address(uuid,int),public.bemo_delete_address(uuid,int) from public,anon,authenticated,service_role;
grant execute on function bemo_private.get_store(text),public.bemo_get_store(text) to anon,authenticated;
grant execute on function bemo_private.store_workspace(),public.bemo_store_workspace(),bemo_private.save_store_profile(text,text,text,text,int),public.bemo_save_store_profile(text,text,text,text,int),
 bemo_private.seller_dashboard(),public.bemo_seller_dashboard(),bemo_private.list_addresses(),public.bemo_list_addresses(),
 bemo_private.save_address(uuid,text,jsonb,int),public.bemo_save_address(uuid,text,jsonb,int),bemo_private.delete_address(uuid,int),public.bemo_delete_address(uuid,int) to authenticated;
commit;
