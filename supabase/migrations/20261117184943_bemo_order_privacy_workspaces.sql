create or replace function bemo_private.order_projection(order_id uuid, details boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',s.id,'parent_id',s.parent_id,'store_id',s.store_id,'store_title',s.store_title,
  'state',s.state,'version',s.version,'currency',s.currency,'items_minor',s.items_minor,'delivery_fee_minor',s.delivery_fee_minor,
  'total_minor',s.items_minor+s.delivery_fee_minor,'created_at',s.created_at,'accepted_at',s.accepted_at,'delivered_at',s.delivered_at,
  'country',case when details then d.country else null end,'region',case when details then d.region else null end,
  'delivery',case when details then to_jsonb(d)-'parent_id' else null end,
  'items',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'variant_id',l.variant_id,'product_id',l.product_id,'title',l.title,
    'variant_label',l.variant_label,'quantity',l.quantity,'unit_price_minor',l.unit_price_minor,'currency',l.currency) order by l.id),'[]') from bemo_private.order_lines l where l.suborder_id=s.id),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'state',e.to_state,'created_at',e.created_at) order by e.created_at,e.id),'[]') from bemo_private.order_events e where e.suborder_id=s.id))
 from bemo_private.suborders s join bemo_private.order_delivery d on d.parent_id=s.parent_id where s.id=order_id;
$$;


create function bemo_private.workspace_access() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users;
begin
 actor:=bemo_private.require_actor();
 return jsonb_build_object('seller',exists(select 1 from bemo_private.stores where owner_user_id=actor.id and status='ACTIVE'),
 'support',exists(select 1 from bemo_private.user_roles where user_id=actor.id and role in ('support','superadmin')),
 'admin',exists(select 1 from bemo_private.user_roles where user_id=actor.id and role='superadmin'));
end; $$;
create function public.bemo_workspace_access() returns jsonb language sql security invoker set search_path='' as $$ select bemo_private.workspace_access() $$;
revoke all on function bemo_private.workspace_access(),public.bemo_workspace_access() from public,anon,authenticated,service_role;
grant execute on function bemo_private.workspace_access(),public.bemo_workspace_access() to authenticated;

create or replace function bemo_private.order_action(order_id uuid,action text,reason text,expected_version int,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor bemo_private.app_users; shop bemo_private.stores; o bemo_private.suborders; buyer uuid; previous bemo_private.order_requests;
 target text; old_state text; line bemo_private.order_lines; stock bemo_private.stock_positions; movement uuid; kind text;
begin
 actor:=bemo_private.require_actor(true);
 if action is null or request_id is null or expected_version is null or reason is null or char_length(reason)>2000 then raise exception 'BEMO_ACTION_INVALID'; end if;
 -- Serialize with all merchant changes before locking the suborder.
 if action in ('ACCEPT','REJECT','PACK','SHIP','ATTEMPT_DELIVERY','DELIVER','FAIL_DELIVERY') or (action='REQUEST_CANCEL' and exists(select 1 from bemo_private.suborders so join bemo_private.stores st on st.id=so.store_id where so.id=order_id and st.owner_user_id=actor.id)) then shop:=bemo_private.merchant_store(); end if;
 select * into o from bemo_private.suborders where id=order_id for update;
 if not found then raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 select buyer_id into buyer from bemo_private.parent_orders where id=o.parent_id;
 if shop.id is not null then
  if shop.id<>o.store_id then raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 elsif action not in ('CANCEL','REQUEST_CANCEL','REQUEST_RETURN') or actor.id<>buyer then raise exception 'BEMO_ORDER_UNAVAILABLE'; end if;
 select * into previous from bemo_private.order_requests r where r.actor_id=actor.id and r.request_id=order_action.request_id;
 if found then
  if previous.suborder_id<>o.id or previous.action<>action or previous.reason<>reason then raise exception 'BEMO_REQUEST_CONFLICT'; end if;
  return bemo_private.order_projection(o.id,false);
 end if;
 if expected_version<>o.version then raise exception 'BEMO_VERSION_CONFLICT'; end if;
 old_state:=o.state;
 if action='ACCEPT' and o.state='PENDING_SELLER' then
  -- Lock in deterministic order, fail the entire transaction if ANY item is unavailable.
  for line in select * from bemo_private.order_lines where suborder_id=o.id order by variant_id loop
   select * into stock from bemo_private.stock_positions where variant_id=line.variant_id for update;
   if stock.stock_on_hand<line.quantity or not exists(select 1 from bemo_private.product_variants v join bemo_private.products p on p.id=v.product_id where v.id=line.variant_id and v.active and p.status='ACTIVE') then raise exception 'BEMO_STOCK_INSUFFICIENT'; end if;
   if line.debit_movement_id is not null then raise exception 'BEMO_STOCK_ALREADY_DEBITED'; end if;
   insert into bemo_private.inventory_movements(variant_id,store_id,actor_user_id,kind,delta,before_quantity,after_quantity,reason,request_id)
    values(line.variant_id,o.store_id,actor.id,'ACCEPT_DEBIT',-line.quantity,stock.stock_on_hand,stock.stock_on_hand-line.quantity,'ORDER_ACCEPTED',gen_random_uuid()) returning id into movement;
   update bemo_private.stock_positions set stock_on_hand=stock_on_hand-line.quantity,version=version+1,updated_at=now() where variant_id=line.variant_id;
   update bemo_private.order_lines set debit_movement_id=movement where id=line.id;
  end loop;
  target:='ACCEPTED';
 elsif action='REJECT' and o.state='PENDING_SELLER' then target:='REJECTED_BY_SELLER';
 elsif action='CANCEL' and o.state in ('PENDING_SELLER','ESCALATED_TO_SUPPORT') and o.accepted_at is null then target:='CANCELLED_BY_BUYER_PRE_ACCEPT';
 elsif action='PACK' and o.state='ACCEPTED' then target:='PACKING';
 elsif action='SHIP' and o.state in ('ACCEPTED','PACKING') then target:='SHIPPED';
 elsif action='ATTEMPT_DELIVERY' and o.state='SHIPPED' then target:='DELIVERY_ATTEMPTED';
 elsif action='DELIVER' and o.state in ('SHIPPED','DELIVERY_ATTEMPTED') then target:='DELIVERED';
 elsif action='FAIL_DELIVERY' and o.state in ('SHIPPED','DELIVERY_ATTEMPTED') then target:='FAILED_DELIVERY';kind:='DELIVERY_FAILURE';
 elsif action='REQUEST_CANCEL' and o.state in ('ACCEPTED','PACKING','SHIPPED','DELIVERY_ATTEMPTED') then target:='CANCEL_REQUESTED';kind:='CANCELLATION';
 elsif action='REQUEST_RETURN' and o.state='DELIVERED' then target:='RETURN_REQUESTED';kind:='RETURN';
 else raise exception 'BEMO_TRANSITION_INVALID'; end if;
 if action in ('REJECT','REQUEST_CANCEL','REQUEST_RETURN','FAIL_DELIVERY') and char_length(btrim(reason))<20 then raise exception 'BEMO_REASON_REQUIRED'; end if;
 update bemo_private.suborders set state=target,version=version+1,updated_at=now(),
  accepted_at=case when target='ACCEPTED' then now() else accepted_at end,
  delivered_at=case when target='DELIVERED' then now() else delivered_at end where id=o.id;
 if kind is not null then insert into bemo_private.order_cases(suborder_id,kind,prior_state,reason) values(o.id,kind,old_state,reason); end if;
 if action='CANCEL' then update bemo_private.order_cases set state='RESOLVED',resolution='BUYER_CANCELLED_PRE_ACCEPT',resolved_at=now() where suborder_id=o.id and state<>'RESOLVED'; end if;
 insert into bemo_private.order_events(suborder_id,actor_id,action,from_state,to_state,reason) values(o.id,actor.id,action,old_state,target,reason);
 insert into bemo_private.order_requests values(actor.id,request_id,o.id,action,reason);
 insert into bemo_private.notifications(user_id,suborder_id,kind,dedup_key)
  select x,o.id,target,o.id::text||':v'||(o.version+1) from (select buyer x union select owner_user_id from bemo_private.stores where id=o.store_id) recipients;
 return bemo_private.order_projection(o.id,false);
end; $$;

