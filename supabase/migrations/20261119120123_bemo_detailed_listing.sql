begin;
alter table bemo_private.product_variants add column former_minor bigint, add column offer_title text;
create function public.bemo_save_listing(product_id uuid,variant_id uuid,details jsonb,qty int) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; price bigint:=(details->>'price')::bigint; former bigint:=(details->>'former')::bigint; offer text:=nullif(trim(details->>'offer'),'');
begin
 if qty is null or qty not between 0 and 1000000000 or former<=price or former>999999999999 or length(offer)>100 then raise exception 'BEMO_VARIANT_INVALID';end if;
 p:=public.bemo_save_product(product_id,details->>'title',details->>'description',details->>'category',0);
 perform public.bemo_save_variant(product_id,variant_id,details->>'sku',coalesce(details->>'label',''),price,true,0);
 update bemo_private.product_variants v set former_minor=former,offer_title=offer where v.id=variant_id;
 if qty>0 then perform public.bemo_adjust_stock(variant_id,qty,'Initial listing quantity',variant_id,1);end if;
 return p;
end $$;
revoke all on function public.bemo_save_listing(uuid,uuid,jsonb,int) from public,anon,service_role;
grant execute on function public.bemo_save_listing(uuid,uuid,jsonb,int) to authenticated;
create or replace function bemo_private.get_product(product_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'store_id',p.store_id,'title',p.title,'description',p.description,'category',p.category,
 'store_title',s.title,'store_slug',s.slug,'currency',ss.currency,'delivery_fee_minor',ss.delivery_fee_minor,
 'media',(select coalesce(jsonb_agg(jsonb_build_object('storage_key',m.storage_key,'alt_text',m.alt_text) order by m.created_at,m.id),'[]'::jsonb)
 from bemo_private.product_media m where m.product_id=p.id and m.status='READY'),
 'variants',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'price_minor',v.price_minor,'currency',v.currency,'offer_title',v.offer_title,'former_minor',v.former_minor,'stock_on_hand',sp.stock_on_hand) order by v.id),'[]'::jsonb)
 from bemo_private.product_variants v join bemo_private.stock_positions sp on sp.variant_id=v.id where v.product_id=p.id and v.active))
 from bemo_private.products p
 join bemo_private.stores s on s.id=p.store_id
 join bemo_private.store_settings ss on ss.store_id=p.store_id
 join bemo_private.app_users u on u.id=s.owner_user_id
 join auth.users au on au.id=u.auth_subject
 where p.id=product_id and p.status='ACTIVE' and s.status='ACTIVE' and u.status='ACTIVE'
 and au.deleted_at is null and (au.banned_until is null or au.banned_until<=now());
$$;
create function public.bemo_save_priced_variant(product_id uuid,variant_id uuid,sku text,label text,price_minor bigint,enabled boolean,expected_version int,former bigint,offer text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 if former<=price_minor or former>999999999999 or length(offer)>100 then raise exception 'BEMO_VARIANT_INVALID';end if;
 v:=public.bemo_save_variant(product_id,variant_id,sku,label,price_minor,enabled,expected_version);
 update bemo_private.product_variants set former_minor=former,offer_title=nullif(trim(offer),'') where id=(v->>'id')::uuid;
 return v;
end $$;
revoke all on function public.bemo_save_priced_variant(uuid,uuid,text,text,bigint,boolean,int,bigint,text) from public,anon,service_role;
grant execute on function public.bemo_save_priced_variant(uuid,uuid,text,text,bigint,boolean,int,bigint,text) to authenticated;
commit;
