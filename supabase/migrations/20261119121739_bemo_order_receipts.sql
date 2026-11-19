begin;
create or replace function public.bemo_save_listing(product_id uuid,variant_id uuid,details jsonb,qty int) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; price bigint:=(details->>'price')::bigint; former bigint:=(details->>'former')::bigint; offer text:=nullif(trim(details->>'offer'),'');
begin
 if qty is null or qty not between 0 and 1000000000 or former<=price or former>999999999999 or length(offer)>100 then raise exception 'BEMO_VARIANT_INVALID';end if;
 p:=public.bemo_save_product(product_id,details->>'title',details->>'description',details->>'category',coalesce((details->>'version')::int,0));
 perform public.bemo_save_variant(product_id,variant_id,details->>'sku',coalesce(details->>'label',''),price,true,0);
 update bemo_private.product_variants v set former_minor=former,offer_title=offer where v.id=variant_id;
 if qty>0 then perform public.bemo_adjust_stock(variant_id,qty,'Initial listing quantity',variant_id,1);end if;
 return p;
end $$;

alter table bemo_private.order_lines add column former_minor bigint;
create function bemo_private.capture_listing_discount() returns trigger language plpgsql set search_path='' as $$
begin
 select v.former_minor into new.former_minor from bemo_private.product_variants v where v.id=new.variant_id and v.price_minor=new.unit_price_minor and v.former_minor>new.unit_price_minor;
 return new;
end $$;
create trigger capture_listing_discount before insert on bemo_private.order_lines for each row execute function bemo_private.capture_listing_discount();
create table bemo_private.order_receipts (
 suborder_id uuid primary key references bemo_private.suborders(id),
 receipt_number uuid unique not null default gen_random_uuid(),
 snapshot jsonb not null
);
alter table bemo_private.order_receipts enable row level security;
revoke all on bemo_private.order_receipts from public, anon, authenticated;
create function bemo_private.receipt_snapshot(oid uuid) returns jsonb
language sql stable set search_path='' as $$
 select (bemo_private.order_projection(o.id,true)-'events') || jsonb_build_object(
 'store_slug',s.slug,'logo_path',s.logo_path,'items',(select jsonb_agg(jsonb_build_object('title',l.title,'sku',l.sku,'former_minor',l.former_minor,
 'variant_label',l.variant_label,'quantity',l.quantity,'unit_price_minor',l.unit_price_minor) order by l.id)
 from bemo_private.order_lines l where l.suborder_id=o.id))
 from bemo_private.suborders o join bemo_private.stores s on s.id=o.store_id where o.id=oid and o.accepted_at is not null
$$;
create function bemo_private.issue_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into bemo_private.order_receipts(suborder_id,snapshot) values(new.id,bemo_private.receipt_snapshot(new.id)) on conflict do nothing;
 return new;
end $$;
create trigger issue_receipt after update on bemo_private.suborders for each row
 when(old.accepted_at is null and new.accepted_at is not null) execute function bemo_private.issue_receipt();
insert into bemo_private.order_receipts(suborder_id,snapshot)
 select id,bemo_private.receipt_snapshot(id) from bemo_private.suborders where accepted_at is not null;
create function public.bemo_order_receipt(order_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare authorized jsonb; result jsonb;
begin
 authorized:=bemo_private.get_order(order_id);
 if authorized->>'accepted_at' is null then raise exception 'BEMO_ORDER_UNAVAILABLE';end if;
 select r.snapshot || jsonb_build_object('receipt_number',r.receipt_number,'state',authorized->>'state','delivered_at',authorized->>'delivered_at') into strict result
 from bemo_private.order_receipts r where r.suborder_id=order_id;
 return result;
end $$;
revoke all on function bemo_private.receipt_snapshot(uuid),bemo_private.issue_receipt(),public.bemo_order_receipt(uuid) from public,anon,authenticated;
grant execute on function public.bemo_order_receipt(uuid) to authenticated;
create function public.bemo_receipt_directory(search_text text,page_num int) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor();
 if not exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin') then raise exception 'BEMO_ADMIN_REQUIRED';end if;
 if page_num is null or page_num not between 0 and 100000 or length(search_text)>160 then raise exception 'BEMO_QUERY_INVALID';end if;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(q)) from
 (select r.receipt_number id,r.snapshot->>'store_title' title,o.state status,o.accepted_at created_at,o.id related,r.snapshot->>'store_slug' detail
 from bemo_private.order_receipts r join bemo_private.suborders o on o.id=r.suborder_id
 where concat_ws(' ',r.receipt_number,o.id,o.parent_id,r.snapshot->>'store_slug',o.state,to_char(o.accepted_at,'YYYY-MM-DD')) ilike '%'||coalesce(search_text,'')||'%'
 order by o.accepted_at desc,o.id limit 25 offset 25*page_num) q),'[]'::jsonb));
end $$;
revoke all on function public.bemo_receipt_directory(text,int) from public,anon;
grant execute on function public.bemo_receipt_directory(text,int) to authenticated;
create function public.bemo_receipt_finance(order_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; result jsonb;
begin
 actor:=bemo_private.require_actor();
 if not exists(select 1 from bemo_private.order_receipts r join bemo_private.suborders o on o.id=r.suborder_id join bemo_private.stores s on s.id=o.store_id where o.id=order_id and (s.owner_user_id=actor.id or exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin'))) then raise exception 'BEMO_ORDER_UNAVAILABLE';end if;
 select jsonb_build_object('state',h.state,'currency',h.currency,'amount_minor',h.amount_minor) into result from bemo_private.commission_holds h where h.suborder_id=order_id;
 return result;
end $$;
revoke all on function public.bemo_receipt_finance(uuid) from public,anon;
grant execute on function public.bemo_receipt_finance(uuid) to authenticated;
commit;
