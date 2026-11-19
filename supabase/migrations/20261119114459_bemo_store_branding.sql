begin;
create or replace function public.bemo_store_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores;
begin
 shop:=bemo_private.merchant_store();
 return bemo_private.store_workspace()||jsonb_build_object('logo_path',shop.logo_path,'cover_path',shop.cover_path);
end $$;
create function public.bemo_publish_store_profile(title text,description text,location_label text,headline text,expected_version int,images jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare shop bemo_private.stores; path text;
begin
 shop:=bemo_private.merchant_store();
 if images is null or jsonb_typeof(images)<>'object' or images-'logo'-'cover'<>'{}'::jsonb then raise exception 'BEMO_MEDIA_INVALID'; end if;
 for path in select value from jsonb_each_text(images) where value is not null loop
 if split_part(path,'/',1)<>encode(sha256(convert_to(auth.uid()::text,'utf8')),'hex') or not exists(select from storage.objects where bucket_id='bemo-store-images' and name=path) then raise exception 'BEMO_MEDIA_INVALID';end if;
 end loop;
 perform bemo_private.save_store_profile(title,description,location_label,headline,expected_version);
 update bemo_private.stores set logo_path=case when images?'logo' then images->>'logo' else logo_path end,cover_path=case when images?'cover' then images->>'cover' else cover_path end where id=shop.id;
 return public.bemo_store_workspace();
end $$;
revoke all on function public.bemo_publish_store_profile(text,text,text,text,int,jsonb) from public,anon,service_role;
grant execute on function public.bemo_publish_store_profile(text,text,text,text,int,jsonb) to authenticated;
commit;
