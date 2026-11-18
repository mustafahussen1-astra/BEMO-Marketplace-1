begin;
create table bemo_private.funding_accounts(
 id uuid primary key default gen_random_uuid(),bank text not null,beneficiary text not null,account_number text not null,
 currency text not null references bemo_private.currencies, instructions text not null, enabled boolean not null default true,
 changed_by uuid not null references bemo_private.app_users, unique(currency,account_number)
);
alter table bemo_private.funding_accounts enable row level security;
revoke all on bemo_private.funding_accounts from public,anon,authenticated;
create table bemo_private.topup_requests (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references bemo_private.stores,
 amount_minor bigint not null check(amount_minor between 1 and 999999999999),
 currency text not null references bemo_private.currencies,
 reference text not null unique check(length(reference) between 3 and 80),
 note text not null check(length(note)<=500), receipt_path text,bank_id uuid references bemo_private.funding_accounts,
 state text not null default 'PENDING' check(state in ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz not null default now(), decided_at timestamptz,
 decided_by uuid references bemo_private.app_users, decision_note text
);
alter table bemo_private.topup_requests enable row level security;
revoke all on bemo_private.topup_requests from public,anon,authenticated;
create function bemo_private.topups(operation text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; shop bemo_private.stores; item bemo_private.topup_requests;
 staff boolean; ref text; reason text; amount bigint;
begin
 actor:=bemo_private.require_actor(true);
 select exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin') into staff;
 if operation in ('MINE','SUBMIT') then shop:=bemo_private.merchant_store();
 elsif not staff then raise exception 'BEMO_ADMIN_REQUIRED'; end if;
 if operation in ('MINE','QUEUE') then
  return jsonb_build_object('slug',shop.slug,'banks',(select coalesce(jsonb_agg(to_jsonb(b)-'changed_by' order by bank,id),'[]')
   from bemo_private.funding_accounts b where enabled or operation='QUEUE'),'rows',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from
   (select r.id,s.slug,r.amount_minor,r.currency,r.reference,r.note,r.bank_id,r.receipt_path,r.state,r.created_at,r.decision_note
    from bemo_private.topup_requests r join bemo_private.stores s on s.id=r.store_id
    where (operation='QUEUE' and r.state='PENDING') or (operation='MINE' and r.store_id=shop.id)
    order by r.created_at desc limit 100)t));
 elsif operation='BANK' then
  if coalesce(length(trim(input->>'bank')),0) not between 2 and 100 or coalesce(length(trim(input->>'beneficiary')),0) not between 2 and 160
   or coalesce(input->>'account_number','') !~ '^[A-Za-z0-9 -]{5,40}$' or length(coalesce(input->>'instructions',''))>500 then raise exception 'BEMO_FINANCE_INVALID'; end if;
  insert into bemo_private.funding_accounts(bank,beneficiary,account_number,currency,instructions,enabled,changed_by)
  values(trim(input->>'bank'),trim(input->>'beneficiary'),trim(input->>'account_number'),input->>'currency',coalesce(input->>'instructions',''),(input->>'enabled')::boolean,actor.id)
  on conflict(currency,account_number) do update set bank=excluded.bank,beneficiary=excluded.beneficiary,instructions=excluded.instructions,enabled=excluded.enabled,changed_by=excluded.changed_by;
  return jsonb_build_object('saved',true);
 elsif operation='SUBMIT' then
  ref:=lower(trim(input->>'reference'));
  if coalesce(input->>'amount_minor','') !~ '^[1-9][0-9]{0,11}$' or coalesce(length(ref),0) not between 3 and 80 then raise exception 'BEMO_FINANCE_INVALID'; end if;
  amount:=(input->>'amount_minor')::bigint;
  if input->>'receipt_path' is not null and (split_part(input->>'receipt_path','/',1)<>actor.auth_subject::text or
    not exists(select 1 from storage.objects where bucket_id='bemo-transfer-proofs' and name=input->>'receipt_path'))
  then raise exception 'BEMO_FINANCE_INVALID'; end if;
  if input->>'bank_id' is not null or exists(select 1 from bemo_private.funding_accounts where enabled) then
   if not exists(select 1 from bemo_private.funding_accounts where enabled and id=(input->>'bank_id')::uuid and currency=input->>'currency')
   then raise exception 'BEMO_FINANCE_INVALID'; end if;
  end if;
  insert into bemo_private.topup_requests(store_id,amount_minor,currency,reference,note,receipt_path,bank_id)
  values(shop.id,amount,input->>'currency',ref,coalesce(input->>'note',''),input->>'receipt_path',(input->>'bank_id')::uuid) on conflict(reference) do nothing;
  select * into item from bemo_private.topup_requests where reference=ref;
  if item.store_id<>shop.id or item.amount_minor<>amount or item.currency<>input->>'currency' or item.note<>coalesce(input->>'note','') then raise exception 'BEMO_REQUEST_CONFLICT'; end if;
 elsif operation in ('APPROVE','REJECT') then
  reason:=trim(input->>'reason');
  if coalesce(length(reason),0) not between 20 and 1000 then raise exception 'BEMO_REASON_REQUIRED'; end if;
  select * into strict item from bemo_private.topup_requests where id=(input->>'id')::uuid for update;
  if item.state='PENDING' then
   if operation='APPROVE' then
    perform bemo_private.finance_admin_action(item.store_id,'CREDIT',jsonb_build_object('amount_minor',item.amount_minor,
     'currency',item.currency,'reference',item.reference),reason,item.id);
   end if;
   update bemo_private.topup_requests set state=case operation when 'APPROVE' then 'APPROVED' else 'REJECTED' end,
    decision_note=reason,decided_by=actor.id,decided_at=now() where id=item.id returning * into item;
  elsif item.state<>(case operation when 'APPROVE' then 'APPROVED' else 'REJECTED' end) then raise exception 'BEMO_REQUEST_CONFLICT'; end if;
 else raise exception 'BEMO_FINANCE_INVALID'; end if;
 return jsonb_build_object('id',item.id,'state',item.state);
end; $$;
create function public.bemo_topups(operation text,input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select bemo_private.topups($1,$2)
$$;
revoke all on function public.bemo_topups(text,jsonb),bemo_private.topups(text,jsonb) from public,anon;
grant execute on function public.bemo_topups(text,jsonb),bemo_private.topups(text,jsonb) to authenticated;
create function bemo_private.mark_driver_arrival() returns trigger language plpgsql set search_path='' as $$
begin
 if new.action='ATTEMPT_DELIVERY' and new.reason='DRIVER_ARRIVED' then new.action:='DRIVER_ARRIVED'; end if;
 return new;
end; $$;
create trigger record_manual_arrival before insert on bemo_private.order_events
 for each row execute function bemo_private.mark_driver_arrival();
create function bemo_private.protect_store_slug() returns trigger language plpgsql set search_path='' as $$
begin
 if new.slug is distinct from old.slug then raise exception 'BEMO_SLUG_PERMANENT'; end if;
 return new;
end; $$;
create trigger permanent_store_slug before update of slug on bemo_private.stores for each row execute function bemo_private.protect_store_slug();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('bemo-transfer-proofs','bemo-transfer-proofs',false,5242880,array['image/jpeg','image/png','application/pdf']);
create policy transfer_proof_insert on storage.objects for insert to authenticated with check
 (bucket_id='bemo-transfer-proofs' and split_part(name,'/',1)=auth.uid()::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|pdf)$');
create policy transfer_proof_read on storage.objects for select to authenticated using
 (bucket_id='bemo-transfer-proofs' and (split_part(name,'/',1)=auth.uid()::text or (public.bemo_workspace_access()->>'admin')::boolean));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('bemo-seller-identity','bemo-seller-identity',false,5242880,array['image/jpeg','image/png','application/pdf']);
create policy seller_identity_insert on storage.objects for insert to authenticated with check
 (bucket_id='bemo-seller-identity' and split_part(name,'/',1)=auth.uid()::text and
 name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|pdf)$');
create table bemo_private.seller_registration (
 store_id uuid primary key references bemo_private.stores, legal_name text not null, phone text not null,
 address text not null, identity_path text not null unique, terms_version text not null,
 accepted_at timestamptz not null default now()
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('bemo-store-images','bemo-store-images',true,5242880,array['image/jpeg','image/png']);
create policy store_image_insert on storage.objects for insert to authenticated with check
 (bucket_id='bemo-store-images' and split_part(name,'/',1)=encode(sha256(convert_to(auth.uid()::text,'utf8')),'hex')
 and name ~ '^[a-f0-9]{64}/[a-f0-9-]{36}\.(png|jpg)$');
alter table bemo_private.stores add column logo_path text, add column cover_path text;
alter table bemo_private.seller_registration enable row level security;
revoke all on bemo_private.seller_registration from public,anon,authenticated;
create function bemo_private.register_seller(title text,slug text,description text,registration jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; result jsonb; path text:=registration->>'identity_path';
begin
 actor:=bemo_private.require_actor(true);
 if coalesce(length(trim(registration->>'legal_name')),0) not between 2 and 120
 or coalesce(registration->>'phone','') !~ '^\+[1-9][0-9]{7,14}$'
 or coalesce(length(trim(registration->>'address')),0) not between 8 and 400
 or registration->>'terms_version' is distinct from 'seller-2026-11'
 or split_part(path,'/',1) is distinct from actor.auth_subject::text
 or not exists(select 1 from storage.objects where bucket_id='bemo-seller-identity' and name=path)
 then raise exception 'BEMO_STORE_INVALID'; end if;
 result:=bemo_private.create_store(title,slug,description);
 if exists(select 1 from (values(registration->>'logo_path'),(registration->>'cover_path')) image(path)
 where image.path is not null and (split_part(image.path,'/',1)<>encode(sha256(convert_to(actor.auth_subject::text,'utf8')),'hex')
 or not exists(select 1 from storage.objects o where o.bucket_id='bemo-store-images' and o.name=image.path)))
 then raise exception 'BEMO_STORE_INVALID'; end if;
 update bemo_private.stores set logo_path=coalesce(logo_path,registration->>'logo_path'),cover_path=coalesce(cover_path,registration->>'cover_path')
 where id=(result->>'id')::uuid;
 insert into bemo_private.seller_registration(store_id,legal_name,phone,address,identity_path,terms_version)
 values((result->>'id')::uuid,trim(registration->>'legal_name'),registration->>'phone',trim(registration->>'address'),path,'seller-2026-11')
 on conflict(store_id) do nothing;
 return result;
end; $$;
create function public.bemo_register_seller(title text,slug text,description text,registration jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select bemo_private.register_seller($1,$2,$3,$4) $$;
create function bemo_private.slug_available(candidate text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare normalized text:=lower(trim(candidate));
begin
 perform bemo_private.require_actor();
 return length(normalized) between 3 and 48 and normalized ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 and not exists(select 1 from bemo_private.reserved_store_slugs where slug=normalized)
 and not exists(select 1 from bemo_private.stores where slug=normalized);
end; $$;
create function public.bemo_slug_available(candidate text) returns boolean language sql stable security invoker set search_path='' as $$select bemo_private.slug_available($1)$$;
revoke all on function public.bemo_slug_available(text),bemo_private.slug_available(text) from public,anon;
grant execute on function public.bemo_slug_available(text),bemo_private.slug_available(text) to authenticated;
revoke all on function public.bemo_register_seller(text,text,text,jsonb),bemo_private.register_seller(text,text,text,jsonb) from public,anon;
grant execute on function public.bemo_register_seller(text,text,text,jsonb),bemo_private.register_seller(text,text,text,jsonb) to authenticated;
revoke execute on function public.bemo_create_store(text,text,text),bemo_private.create_store(text,text,text) from authenticated,public,anon;
create function bemo_private.store_front(store_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select bemo_private.get_store($1)||jsonb_build_object('logo_path',s.logo_path,'cover_path',s.cover_path)
 from bemo_private.stores s where s.slug=$1
$$;
revoke all on function bemo_private.store_front(text) from public;
grant execute on function bemo_private.store_front(text) to authenticated,anon;
create or replace function public.bemo_get_store(store_slug text) returns jsonb language sql stable security invoker set search_path='' as $$select bemo_private.store_front($1)$$;
commit;
