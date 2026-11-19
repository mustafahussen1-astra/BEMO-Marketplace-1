create or replace function bemo_private.get_product(product_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'store_id',p.store_id,'title',p.title,'description',p.description,'category',p.category,
 'store_title',s.title,'store_slug',s.slug,'currency',ss.currency,'delivery_fee_minor',ss.delivery_fee_minor,
 'media',(select coalesce(jsonb_agg(jsonb_build_object('storage_key',m.storage_key,'alt_text',m.alt_text) order by m.created_at,m.id),'[]'::jsonb)
 from bemo_private.product_media m where m.product_id=p.id and m.status='READY'),
 'variants',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',v.id,'label',v.label,'price_minor',v.price_minor,'currency',v.currency,'offer_title',v.offer_title,'former_minor',v.former_minor,'stock_on_hand',sp.stock_on_hand)) order by v.id),'[]'::jsonb)
 from bemo_private.product_variants v join bemo_private.stock_positions sp on sp.variant_id=v.id where v.product_id=p.id and v.active))
 from bemo_private.products p
 join bemo_private.stores s on s.id=p.store_id
 join bemo_private.store_settings ss on ss.store_id=p.store_id
 join bemo_private.app_users u on u.id=s.owner_user_id
 join auth.users au on au.id=u.auth_subject
 where p.id=product_id and p.status='ACTIVE' and s.status='ACTIVE' and u.status='ACTIVE'
 and au.deleted_at is null and (au.banned_until is null or au.banned_until<=now());
$$;

