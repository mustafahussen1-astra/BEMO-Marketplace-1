begin;
create table bemo_private.admin_actions (
 id uuid primary key, actor uuid not null references bemo_private.app_users,
 operation text not null, target uuid, reason text not null, created_at timestamptz not null default now()
);
alter table bemo_private.admin_actions enable row level security;
revoke all on bemo_private.admin_actions from public,anon,authenticated;
alter table bemo_private.notifications add column body text;
alter table bemo_private.stores add column review_state text not null default 'PENDING' check(review_state in ('PENDING','APPROVED','REJECTED'));
create function bemo_private.console_actor() returns uuid language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor();
 if not exists(select from bemo_private.user_roles where user_id=actor.id and role='superadmin') then raise exception 'BEMO_ADMIN_REQUIRED'; end if;
 return actor.id;
end $$;
create view bemo_private.console_directory as
 select 'accounts' section,u.id,u.display_name title,u.status,u.email_normalized detail,u.created_at,coalesce(s.slug,'') related from bemo_private.app_users u left join bemo_private.stores s on s.owner_user_id=u.id
 union all select 'stores',s.id,s.title,s.status,concat_ws(' · ',s.slug,u.display_name,r.legal_name,r.phone,r.address),s.created_at,s.review_state from bemo_private.stores s join bemo_private.app_users u on u.id=s.owner_user_id left join bemo_private.seller_registration r on r.store_id=s.id
 union all select 'products',p.id,p.title,p.status,p.category,p.created_at,s.title from bemo_private.products p join bemo_private.stores s on s.id=p.store_id
 union all select 'orders',id,store_title,state,currency,created_at,id::text from bemo_private.suborders
 union all select 'log',a.id,a.operation,'',a.reason,a.created_at,concat_ws(' · ',u.display_name,a.target::text) from bemo_private.admin_actions a join bemo_private.app_users u on u.id=a.actor;
revoke all on bemo_private.console_directory from public,anon,authenticated;
create function public.bemo_console(section_name text,search_text text,page_num integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform bemo_private.console_actor();
 if page_num is null or page_num not between 0 and 100000 or length(search_text)>160 then raise exception 'BEMO_QUERY_INVALID'; end if;
 return jsonb_build_object('counts',(select jsonb_object_agg(section,n) from(select section,count(*) n from bemo_private.console_directory group by section) t),
 'cases',(select count(*) from bemo_private.order_cases where state<>'RESOLVED'),
 'rows',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc,id),'[]') from(select * from bemo_private.console_directory where section=section_name and strpos(lower(concat_ws(' ',title,detail,related,id::text,status)),lower(coalesce(search_text,'')))>0 order by created_at desc,id limit 25 offset page_num*25) r));
end $$;
create function public.bemo_console_action(operation text,target uuid,reason text,request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare admin_id uuid:=bemo_private.console_actor(); previous bemo_private.admin_actions; affected int;
begin
 if request_id is null or reason is null or length(trim(reason)) not between 3 and 500 then raise exception 'BEMO_QUERY_INVALID'; end if;
 insert into bemo_private.admin_actions values(request_id,admin_id,operation,target,reason,now()) on conflict do nothing;
 if not found then
 select * into previous from bemo_private.admin_actions where id=request_id;
 if previous.actor<>admin_id or previous.operation<>operation or previous.target is distinct from target or previous.reason<>reason then raise exception 'BEMO_REQUEST_CONFLICT'; end if;
 return;
 end if;
 case
 when operation in ('account_suspend','account_restore') then
 update bemo_private.app_users set status=case when operation='account_suspend' then 'SUSPENDED' else 'ACTIVE' end,updated_at=now() where id=target and status=case when operation='account_suspend' then 'ACTIVE' else 'SUSPENDED' end and not exists(select from bemo_private.user_roles where user_id=target);
 when operation in ('store_suspend','store_restore') then
 update bemo_private.stores set status=case when operation='store_suspend' then 'SUSPENDED' else 'ACTIVE' end,updated_at=now() where id=target and status=case when operation='store_suspend' then 'ACTIVE' else 'SUSPENDED' end;
 when operation in ('product_suspend','product_restore') then
 update bemo_private.products set status=case when operation='product_suspend' then 'SUSPENDED' else 'DRAFT' end,version=version+1,updated_at=now() where id=target and ((operation='product_suspend' and status in ('ACTIVE','DRAFT','HIDDEN_BY_OWNER')) or (operation='product_restore' and status='SUSPENDED'));
 when operation in ('verify','reject') then
 update bemo_private.stores set review_state=case when operation='verify' then 'APPROVED' else 'REJECTED' end where id=target and status='ACTIVE';
 if not found then raise exception 'BEMO_STORE_UNAVAILABLE'; end if;
 insert into bemo_private.discovery_entries(kind,store_id,enabled,changed_by) values('verified',target,operation='verify',admin_id) on conflict(kind,store_id) do update set enabled=excluded.enabled,changed_at=now(),changed_by=admin_id;
 when operation in ('notify','broadcast') then
 insert into bemo_private.notifications(user_id,kind,dedup_key,body) select id,'ADMIN_MESSAGE',request_id::text,reason from bemo_private.app_users where status='ACTIVE' and ((operation='broadcast' and target is null) or (operation='notify' and id=target));
 else raise exception 'BEMO_QUERY_INVALID';
 end case;
 get diagnostics affected=row_count;
 if affected=0 then raise exception 'BEMO_VERSION_CONFLICT'; end if;
end $$;
revoke all on function bemo_private.console_actor(),public.bemo_console(text,text,int),public.bemo_console_action(text,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.bemo_console(text,text,int),public.bemo_console_action(text,uuid,text,uuid) to authenticated;
commit;
