begin;
create table bemo_private.product_media (
 id uuid primary key, product_id uuid not null, store_id uuid not null,
 storage_key text not null unique, alt_text text not null check(char_length(btrim(alt_text)) between 1 and 240),
 status text not null default 'PENDING' check(status in ('PENDING','READY','REMOVED')),
 created_at timestamptz not null default now(),
 foreign key(product_id,store_id) references bemo_private.products(id,store_id)
);
create index product_media_product on bemo_private.product_media(product_id,created_at,id);
alter table bemo_private.product_media enable row level security;
revoke all on bemo_private.product_media from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('bemo-products','bemo-products',false,5242880,array['image/jpeg']);

create function bemo_private.prepare_media(product_id uuid,media_id uuid,alt_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; item bemo_private.products; saved bemo_private.product_media;
begin
 shop:=bemo_private.merchant_store();
 select p.* into item from bemo_private.products p where p.id=product_id and p.store_id=shop.id for update;
 if item.id is null or item.status in ('SUSPENDED','ARCHIVED') then raise exception using errcode='42501',message='BEMO_PRODUCT_UNAVAILABLE'; end if;
 if media_id is null or alt_text is null or char_length(btrim(alt_text)) not between 1 and 240 then raise exception using errcode='22023',message='BEMO_MEDIA_INVALID'; end if;
 select m.* into saved from bemo_private.product_media m where m.id=media_id;
 if saved.id is not null then
  if saved.product_id<>item.id or saved.store_id<>shop.id or saved.alt_text<>btrim(alt_text) or saved.status='REMOVED' then raise exception using errcode='22023',message='BEMO_IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(saved);
 end if;
 if (select count(*) from bemo_private.product_media m where m.product_id=item.id and m.status<>'REMOVED')>=10 then raise exception using errcode='22023',message='BEMO_MEDIA_LIMIT'; end if;
 insert into bemo_private.product_media(id,product_id,store_id,storage_key,alt_text)
 values(media_id,item.id,shop.id,shop.id::text||'/'||item.id::text||'/'||media_id::text||'.jpg',btrim(alt_text)) returning * into saved;
 return to_jsonb(saved);
end; $$;

create function bemo_private.can_upload_media(object_name text) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor(false);
 return exists(select 1 from bemo_private.product_media m join bemo_private.products p on p.id=m.product_id
 join bemo_private.stores s on s.id=m.store_id where m.storage_key=object_name and m.status='PENDING'
 and p.status not in ('SUSPENDED','ARCHIVED') and s.status='ACTIVE' and s.owner_user_id=actor.id);
exception when insufficient_privilege then return false;
end; $$;

create function bemo_private.can_read_media(object_name text) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 if exists(select 1 from bemo_private.product_media m join bemo_private.products p on p.id=m.product_id
 join bemo_private.stores s on s.id=m.store_id join bemo_private.app_users u on u.id=s.owner_user_id
 join auth.users au on au.id=u.auth_subject where m.storage_key=object_name and m.status='READY' and p.status='ACTIVE'
 and s.status='ACTIVE' and u.status='ACTIVE' and au.deleted_at is null and (au.banned_until is null or au.banned_until<=now())) then return true; end if;
 if auth.uid() is null then return false; end if;
 actor:=bemo_private.require_actor(false);
 return exists(select 1 from bemo_private.product_media m join bemo_private.stores s on s.id=m.store_id
 where m.storage_key=object_name and m.status<>'REMOVED' and s.owner_user_id=actor.id and s.status='ACTIVE');
exception when insufficient_privilege then return false;
end; $$;
create policy bemo_product_upload on storage.objects for insert to authenticated
 with check(bucket_id='bemo-products' and bemo_private.can_upload_media(name));
create policy bemo_product_read on storage.objects for select to anon,authenticated
 using(bucket_id='bemo-products' and bemo_private.can_read_media(name));
-- No browser overwrite or hard delete: published object keys stay immutable.

create function bemo_private.finish_media(media_id uuid,remove_media boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; saved bemo_private.product_media;
begin
 shop:=bemo_private.merchant_store();
 select m.* into saved from bemo_private.product_media m join bemo_private.products p on p.id=m.product_id
 where m.id=media_id and m.store_id=shop.id and p.status not in ('SUSPENDED','ARCHIVED') for update of m;
 if saved.id is null or remove_media is null then raise exception using errcode='42501',message='BEMO_MEDIA_UNAVAILABLE'; end if;
 if remove_media then
  if exists(select 1 from bemo_private.products where id=saved.product_id and status='ACTIVE')
   and not exists(select 1 from bemo_private.product_media where product_id=saved.product_id and status='READY' and id<>saved.id) then
    raise exception using errcode='22023',message='BEMO_PRODUCT_IMAGE_REQUIRED'; end if;
 else
  if saved.status='REMOVED' or not exists(select 1 from storage.objects where bucket_id='bemo-products' and name=saved.storage_key
   and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 5242880) then
   raise exception using errcode='22023',message='BEMO_MEDIA_UPLOAD_REQUIRED'; end if;
 end if;
 update bemo_private.product_media set status=case when remove_media then 'REMOVED' else 'READY' end where id=saved.id returning * into saved;
 insert into bemo_private.merchant_events(actor_user_id,store_id,action,object_id) values(shop.owner_user_id,shop.id,case when remove_media then 'MEDIA_REMOVED' else 'MEDIA_READY' end,saved.id);
 return to_jsonb(saved);
end; $$;

create function bemo_private.product_status(product_id uuid,new_status text,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; item bemo_private.products;
begin
 shop:=bemo_private.merchant_store();
 select p.* into item from bemo_private.products p where p.id=product_id and p.store_id=shop.id for update;
 if item.id is null or item.status='SUSPENDED' then raise exception using errcode='42501',message='BEMO_PRODUCT_UNAVAILABLE'; end if;
 if new_status is null or new_status not in ('ACTIVE','HIDDEN_BY_OWNER','ARCHIVED') or expected_version is null then raise exception using errcode='22023',message='BEMO_PRODUCT_INVALID'; end if;
 if item.version<>expected_version then raise exception using errcode='40001',message='BEMO_VERSION_CONFLICT'; end if;
 if item.status='ARCHIVED' and new_status<>'ARCHIVED' then raise exception using errcode='22023',message='BEMO_PRODUCT_UNAVAILABLE'; end if;
 if new_status='ACTIVE' then
  if not exists(select 1 from bemo_private.product_variants v where v.product_id=item.id and v.active) then raise exception using errcode='22023',message='BEMO_VARIANT_REQUIRED'; end if;
  if not exists(select 1 from bemo_private.product_media m where m.product_id=item.id and m.status='READY') then raise exception using errcode='22023',message='BEMO_PRODUCT_IMAGE_REQUIRED'; end if;
 end if;
 if item.status<>new_status then
  update bemo_private.products p set status=new_status,version=p.version+1,updated_at=now() where p.id=item.id returning * into item;
  insert into bemo_private.merchant_events(actor_user_id,store_id,action,object_id) values(shop.owner_user_id,shop.id,'PRODUCT_'||new_status,item.id);
 end if;
 return to_jsonb(item);
end; $$;

create function bemo_private.product_images(product_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'storage_key',m.storage_key,'alt_text',m.alt_text,'status',m.status) order by m.created_at,m.id),'[]'::jsonb)
 from bemo_private.product_media m where m.product_id=$1 and m.status<>'REMOVED';
$$;
create function bemo_private.merchant_media(product_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores;
begin
 shop:=bemo_private.merchant_store();
 if not exists(select 1 from bemo_private.products p where p.id=product_id and p.store_id=shop.id) then raise exception using errcode='42501',message='BEMO_PRODUCT_UNAVAILABLE'; end if;
 return bemo_private.product_images(product_id);
end; $$;

create function bemo_private.list_products(search_text text default '',store_slug text default '',category_filter text default '',limit_count int default 24,offset_count int default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if search_text is null or char_length(search_text)>120 or store_slug is null or char_length(store_slug)>48 or category_filter is null
 or category_filter not in ('','home','fashion','electronics','beauty','sports','other') or limit_count is null or limit_count not between 1 and 100
 or offset_count is null or offset_count not between 0 and 10000 then raise exception using errcode='22023',message='BEMO_QUERY_INVALID'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'store_id',p.store_id,'title',p.title,'description',p.description,'category',p.category,
 'store_title',s.title,'store_slug',s.slug,'currency',ss.currency,'delivery_fee_minor',ss.delivery_fee_minor,
 'media',(select coalesce(jsonb_agg(jsonb_build_object('storage_key',m.storage_key,'alt_text',m.alt_text) order by m.created_at,m.id),'[]'::jsonb)
 from bemo_private.product_media m where m.product_id=p.id and m.status='READY'),
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'price_minor',v.price_minor,'currency',v.currency,'stock_on_hand',sp.stock_on_hand) order by v.id),'[]'::jsonb)
 from bemo_private.product_variants v join bemo_private.stock_positions sp on sp.variant_id=v.id where v.product_id=p.id and v.active)) order by p.created_at desc,p.id),'[]'::jsonb)
 into result from (select p.* from bemo_private.products p join bemo_private.stores s on s.id=p.store_id
 join bemo_private.app_users u on u.id=s.owner_user_id join auth.users au on au.id=u.auth_subject
 where p.status='ACTIVE' and s.status='ACTIVE' and u.status='ACTIVE' and au.deleted_at is null and (au.banned_until is null or au.banned_until<=now())
 and (store_slug='' or s.slug=store_slug) and (category_filter='' or p.category=category_filter)
 and (btrim(search_text)='' or position(lower(btrim(search_text)) in lower(p.title||' '||p.description))>0)
 order by p.created_at desc,p.id limit limit_count offset offset_count) p
 join bemo_private.stores s on s.id=p.store_id join bemo_private.store_settings ss on ss.store_id=p.store_id;
 return result;
end; $$;
create function public.bemo_prepare_media(product_id uuid,media_id uuid,alt_text text) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.prepare_media($1,$2,$3)$$;
create function public.bemo_finish_media(media_id uuid,remove_media boolean default false) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.finish_media($1,$2)$$;
create function public.bemo_product_status(product_id uuid,new_status text,expected_version int) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.product_status($1,$2,$3)$$;
create function public.bemo_merchant_media(product_id uuid) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.merchant_media($1)$$;
create function public.bemo_list_products(search_text text default '',store_slug text default '',category_filter text default '',limit_count int default 24,offset_count int default 0) returns jsonb language sql stable security invoker set search_path='' as $$select bemo_private.list_products($1,$2,$3,$4,$5)$$;
revoke all on function bemo_private.prepare_media(uuid,uuid,text),bemo_private.can_upload_media(text),bemo_private.can_read_media(text),
 bemo_private.finish_media(uuid,boolean),bemo_private.product_status(uuid,text,int),bemo_private.product_images(uuid),bemo_private.merchant_media(uuid),bemo_private.list_products(text,text,text,int,int),
 public.bemo_prepare_media(uuid,uuid,text),public.bemo_finish_media(uuid,boolean),public.bemo_product_status(uuid,text,int),public.bemo_merchant_media(uuid),public.bemo_list_products(text,text,text,int,int)
 from public,anon,authenticated,service_role;
grant execute on function bemo_private.prepare_media(uuid,uuid,text),bemo_private.can_upload_media(text),bemo_private.finish_media(uuid,boolean),
 bemo_private.product_status(uuid,text,int),bemo_private.merchant_media(uuid),public.bemo_prepare_media(uuid,uuid,text),public.bemo_finish_media(uuid,boolean),public.bemo_product_status(uuid,text,int),public.bemo_merchant_media(uuid) to authenticated;
grant execute on function bemo_private.can_read_media(text),bemo_private.list_products(text,text,text,int,int),public.bemo_list_products(text,text,text,int,int) to anon,authenticated;
commit;
