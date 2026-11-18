-- Additive search endpoint: old clients retain their original catalogue contract.
begin;
create function bemo_private.search_products(
 search_text text default '',store_slug text default '',category_filter text default '',
 currency_filter text default '',min_price_minor bigint default null,max_price_minor bigint default null,
 in_stock_only boolean default false,sort_order text default 'newest',limit_count int default 24,offset_count int default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if search_text is null or char_length(search_text)>120 or store_slug is null or char_length(store_slug)>48
 or (store_slug<>'' and store_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
 or category_filter is null or category_filter not in ('','home','fashion','electronics','beauty','sports','other')
 or currency_filter is null or (currency_filter<>'' and not exists(select 1 from bemo_private.currencies where code=currency_filter))
 or (min_price_minor is not null and min_price_minor not between 0 and 9000000000000000)
 or (max_price_minor is not null and max_price_minor not between 0 and 9000000000000000)
 or (min_price_minor is not null and max_price_minor is not null and min_price_minor>max_price_minor)
 or in_stock_only is null or sort_order is null or sort_order not in ('newest','price_asc','price_desc')
 or (currency_filter='' and (min_price_minor is not null or max_price_minor is not null or sort_order<>'newest'))
 or limit_count is null or limit_count not between 1 and 100 or offset_count is null or offset_count not between 0 and 10000
 then raise exception using errcode='22023',message='BEMO_QUERY_INVALID'; end if;

 with matches as (
  select p.id,p.created_at,min(v.price_minor) as price,
   jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'price_minor',v.price_minor,'currency',v.currency,'stock_on_hand',sp.stock_on_hand) order by v.price_minor,v.id) as variants
  from bemo_private.products p
  join bemo_private.stores s on s.id=p.store_id
  join bemo_private.store_settings ss on ss.store_id=s.id
  join bemo_private.app_users u on u.id=s.owner_user_id
  join auth.users au on au.id=u.auth_subject
  join bemo_private.product_variants v on v.product_id=p.id and v.active and v.currency=ss.currency
  join bemo_private.stock_positions sp on sp.variant_id=v.id
  where p.status='ACTIVE' and s.status='ACTIVE' and u.status='ACTIVE' and au.deleted_at is null
  and (au.banned_until is null or au.banned_until<=now())
  and (store_slug='' or s.slug=store_slug) and (category_filter='' or p.category=category_filter)
  and (btrim(search_text)='' or position(lower(btrim(search_text)) in lower(p.title||' '||p.description))>0)
  and (currency_filter='' or v.currency=currency_filter)
  and (min_price_minor is null or v.price_minor>=min_price_minor)
  and (max_price_minor is null or v.price_minor<=max_price_minor)
  and (not in_stock_only or sp.stock_on_hand>0)
  group by p.id,p.created_at
 ), ordered as (
  select *,row_number() over(order by
   case when sort_order='price_asc' then price end asc,
   case when sort_order='price_desc' then price end desc,
   created_at desc,id) as ordinal from matches
 ), page as (select * from ordered order by ordinal limit limit_count offset offset_count)
 select coalesce(jsonb_agg(jsonb_set(bemo_private.get_product(id),'{variants}',variants) order by ordinal),'[]'::jsonb)
 into result from page;
 return result;
end; $$;
create function public.bemo_search_products(
 search_text text default '',store_slug text default '',category_filter text default '',
 currency_filter text default '',min_price_minor bigint default null,max_price_minor bigint default null,
 in_stock_only boolean default false,sort_order text default 'newest',limit_count int default 24,offset_count int default 0
) returns jsonb language sql stable security invoker set search_path='' as $$
 select bemo_private.search_products($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
$$;
revoke all on function bemo_private.search_products(text,text,text,text,bigint,bigint,boolean,text,int,int),public.bemo_search_products(text,text,text,text,bigint,bigint,boolean,text,int,int) from public,anon,authenticated,service_role;
grant execute on function bemo_private.search_products(text,text,text,text,bigint,bigint,boolean,text,int,int),public.bemo_search_products(text,text,text,text,bigint,bigint,boolean,text,int,int) to anon,authenticated;
commit;
