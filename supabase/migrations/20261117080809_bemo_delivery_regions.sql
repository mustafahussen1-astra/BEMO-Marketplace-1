-- Draft region configuration. Checkout activation is a separate migration.
begin;
create table bemo_private.delivery_configs (
 store_id uuid primary key references bemo_private.stores(id),
 version int not null default 1, currency text not null references bemo_private.currencies(code),
 rules jsonb not null check(jsonb_typeof(rules)='array' and jsonb_array_length(rules)<=100),
 updated_at timestamptz not null default now()
);
alter table bemo_private.delivery_configs enable row level security;
revoke all on bemo_private.delivery_configs from public,anon,authenticated,service_role;

create function bemo_private.delivery_workspace() returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; result jsonb;
begin
 shop:=bemo_private.merchant_store();
 select jsonb_build_object('version',coalesce(c.version,0),'currency',s.currency,'rules',coalesce(c.rules,'[]'::jsonb),'configured_currency',c.currency,'checkout_active',false)
 into result from bemo_private.store_settings s left join bemo_private.delivery_configs c on c.store_id=s.store_id where s.store_id=shop.id;
 if result is null then raise exception 'BEMO_SETTINGS_REQUIRED'; end if;
 return result;
end; $$;

create function bemo_private.save_delivery_regions(rules jsonb,expected_version int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; current_version int; code text; item jsonb; normalized jsonb:='[]';
 country text; region text; label text; fee bigint; low_days int; high_days int; keys text[]:='{}'; key text;
begin
 shop:=bemo_private.merchant_store();
 select currency into code from bemo_private.store_settings where store_id=shop.id;
 if code is null then raise exception 'BEMO_SETTINGS_REQUIRED'; end if;
 select version into current_version from bemo_private.delivery_configs where store_id=shop.id;
 if expected_version is null or coalesce(current_version,0)<>expected_version then raise exception 'BEMO_VERSION_CONFLICT'; end if;
 if rules is null or jsonb_typeof(rules)<>'array' then raise exception 'BEMO_DELIVERY_INVALID'; end if;
 if jsonb_array_length(rules)>100 then raise exception 'BEMO_DELIVERY_INVALID'; end if;
 for item in select value from jsonb_array_elements(rules) loop
  if jsonb_typeof(item)<>'object' then raise exception 'BEMO_DELIVERY_INVALID'; end if;
  country:=upper(btrim(item->>'country')); region:=lower(btrim(item->>'region')); label:=btrim(item->>'label');
  if country is null or country !~ '^[A-Z]{2}$' or region is null or char_length(region) not between 1 and 120
   or label is null or char_length(label) not between 1 and 160
   or coalesce(item->>'fee_minor','') !~ '^[0-9]{1,12}$'
   or coalesce(item->>'min_days','') !~ '^[0-9]{1,3}$' or coalesce(item->>'max_days','') !~ '^[0-9]{1,3}$'
  then raise exception 'BEMO_DELIVERY_INVALID'; end if;
  fee:=(item->>'fee_minor')::bigint;low_days:=(item->>'min_days')::int;high_days:=(item->>'max_days')::int;
  if low_days>high_days or high_days>365 then raise exception 'BEMO_DELIVERY_INVALID'; end if;
  key:=country||':'||region;
  if key=any(keys) then raise exception 'BEMO_DELIVERY_DUPLICATE'; end if;
  keys:=array_append(keys,key);
  normalized:=normalized||jsonb_build_array(jsonb_build_object('country',country,'region',region,'label',label,'fee_minor',fee,'min_days',low_days,'max_days',high_days));
 end loop;
 insert into bemo_private.delivery_configs(store_id,currency,rules) values(shop.id,code,normalized)
 on conflict(store_id) do update set currency=excluded.currency,rules=excluded.rules,version=bemo_private.delivery_configs.version+1,updated_at=now();
 insert into bemo_private.merchant_events(actor_user_id,store_id,action,object_id) values(shop.owner_user_id,shop.id,'DELIVERY_REGIONS_DRAFT_UPDATED',shop.id);
 return bemo_private.delivery_workspace();
end; $$;

-- Exact region wins over country-wide '*'. No worldwide fallback or implicit free delivery.
create function bemo_private.resolve_delivery_region(shop_id uuid,country_code text,region_code text,currency_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare config bemo_private.delivery_configs; result jsonb;
begin
 select * into config from bemo_private.delivery_configs where store_id=shop_id;
 if not found or config.currency<>currency_code then raise exception 'BEMO_DELIVERY_UNAVAILABLE'; end if;
 select r into result from jsonb_array_elements(config.rules) r
 where r->>'country'=upper(btrim(country_code)) and r->>'region' in (lower(btrim(region_code)),'*')
 order by (r->>'region'='*') asc limit 1;
 if result is null then raise exception 'BEMO_DELIVERY_UNAVAILABLE'; end if;
 return result||jsonb_build_object('currency',config.currency,'rule_version',config.version);
end; $$;
create function public.bemo_delivery_workspace() returns jsonb language sql security invoker set search_path='' as $$select bemo_private.delivery_workspace()$$;
create function public.bemo_save_delivery_regions(rules jsonb,expected_version int) returns jsonb language sql security invoker set search_path='' as $$select bemo_private.save_delivery_regions($1,$2)$$;
revoke all on function bemo_private.delivery_workspace(),bemo_private.save_delivery_regions(jsonb,int),bemo_private.resolve_delivery_region(uuid,text,text,text),public.bemo_delivery_workspace(),public.bemo_save_delivery_regions(jsonb,int) from public,anon,authenticated,service_role;
grant execute on function bemo_private.delivery_workspace(),bemo_private.save_delivery_regions(jsonb,int),public.bemo_delivery_workspace(),public.bemo_save_delivery_regions(jsonb,int) to authenticated;
commit;
