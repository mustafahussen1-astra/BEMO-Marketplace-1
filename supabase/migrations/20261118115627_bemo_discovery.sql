begin;
create table bemo_private.discovery_entries (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('brand','verified','offer')),
 store_id uuid references bemo_private.stores,
 variant_id uuid references bemo_private.product_variants,
 label text check(length(trim(label)) between 1 and 100),
 former_price bigint,
 currency text,
 enabled boolean not null default true,
 position int not null default 0,
 changed_by uuid not null references bemo_private.app_users,
 changed_at timestamptz not null default now(),
 check ((kind='offer' and variant_id is not null and former_price is not null
   and former_price between 1 and 9000000000000000 and currency is not null and currency ~ '^[A-Z]{3}$' and store_id is null)
   or (kind in ('verified','brand') and store_id is not null and variant_id is null and former_price is null and currency is null)),
 check(kind <> 'brand' or label is not null),
 unique(kind,store_id), unique(variant_id)
);
alter table bemo_private.discovery_entries enable row level security;
revoke all on bemo_private.discovery_entries from public,anon,authenticated;
create function bemo_private.discovery_feed() returns jsonb
language sql stable security definer set search_path='' as $$
 with visible as (
 select e.id,e.kind,e.position,case when e.kind='brand' then e.label else s.title end title,
 s.slug,null::uuid product_id,null::bigint price_minor,null::bigint former_price,null::text currency
 from bemo_private.discovery_entries e join bemo_private.stores s on s.id=e.store_id
 where e.enabled and bemo_private.get_store(s.slug) is not null
 union all
 select e.id,e.kind,e.position,p.title,null,p.id,v.price_minor,e.former_price,e.currency
 from bemo_private.discovery_entries e join bemo_private.product_variants v on v.id=e.variant_id
 join bemo_private.products p on p.id=v.product_id
 join bemo_private.store_settings ss on ss.store_id=p.store_id and ss.currency=v.currency
 where e.enabled and v.active and e.currency=v.currency and v.price_minor<e.former_price
 and bemo_private.get_product(p.id) is not null
 ), ranked as (select *,row_number() over(partition by kind order by position,id) ordinal from visible)
 select coalesce(jsonb_agg(to_jsonb(r)-'ordinal'-'position' order by kind,ordinal),'[]') from ranked r where ordinal<=24
$$;
create function public.bemo_discovery_feed() returns jsonb language sql stable security invoker set search_path='' as $$
 select bemo_private.discovery_feed()
$$;
revoke all on function public.bemo_discovery_feed(), bemo_private.discovery_feed() from public;
grant execute on function public.bemo_discovery_feed(), bemo_private.discovery_feed() to anon,authenticated;
create function bemo_private.set_discovery_entry(kind text, target uuid, label text, former_price bigint, currency text, enabled boolean, sort_position int)
returns void language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor();
 if not exists(select 1 from bemo_private.user_roles r where r.user_id=actor.id and r.role='superadmin') then
   raise exception 'BEMO_ADMIN_REQUIRED';
 end if;
 if kind='offer' then
   insert into bemo_private.discovery_entries(kind,variant_id,former_price,currency,enabled,position,changed_by)
   values($1,$2,$4,$5,$6,$7,actor.id)
   on conflict on constraint discovery_entries_variant_id_key do update set former_price=excluded.former_price,
   currency=excluded.currency,enabled=excluded.enabled,position=excluded.position,changed_by=excluded.changed_by,changed_at=now();
 else
   insert into bemo_private.discovery_entries(kind,store_id,label,enabled,position,changed_by)
   values($1,$2,$3,$6,$7,actor.id)
   on conflict on constraint discovery_entries_kind_store_id_key do update set label=excluded.label,
   enabled=excluded.enabled,position=excluded.position,changed_by=excluded.changed_by,changed_at=now();
 end if;
end; $$;
create function public.bemo_set_discovery_entry(kind text,target uuid,label text,former_price bigint,currency text,enabled boolean,sort_position int)
returns void language sql security invoker set search_path='' as $$
 select bemo_private.set_discovery_entry($1,$2,$3,$4,$5,$6,$7)
$$;
revoke all on function public.bemo_set_discovery_entry(text,uuid,text,bigint,text,boolean,int),bemo_private.set_discovery_entry(text,uuid,text,bigint,text,boolean,int) from public,anon;
grant execute on function public.bemo_set_discovery_entry(text,uuid,text,bigint,text,boolean,int),bemo_private.set_discovery_entry(text,uuid,text,bigint,text,boolean,int) to authenticated;
commit;
