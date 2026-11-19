do $test$
declare seller_auth uuid:=gen_random_uuid(); buyer_auth uuid:=gen_random_uuid();
 seller_session uuid:=gen_random_uuid(); buyer_session uuid:=gen_random_uuid();
 seller uuid:=gen_random_uuid(); buyer uuid:=gen_random_uuid(); shop uuid:=gen_random_uuid();
 product uuid:=gen_random_uuid(); variant uuid:=gen_random_uuid(); q jsonb; po jsonb; so jsonb; key uuid:=gen_random_uuid(); marker text:=gen_random_uuid()::text;
begin
 begin
 insert into auth.users(id,email,email_confirmed_at) values(seller_auth,'bemo-qa-s-'||marker||'@gmail.com',now()),(buyer_auth,'bemo-qa-b-'||marker||'@gmail.com',now());
 insert into auth.identities(provider_id,user_id,provider,identity_data) values(seller_auth::text,seller_auth,'google',jsonb_build_object('email','bemo-qa-s-'||marker||'@gmail.com','email_verified',true)),(buyer_auth::text,buyer_auth,'google',jsonb_build_object('email','bemo-qa-b-'||marker||'@gmail.com','email_verified',true));
 insert into auth.sessions(id,user_id) values(seller_session,seller_auth),(buyer_session,buyer_auth);
 insert into bemo_private.app_users(id,auth_subject,email_normalized,display_name) values(seller,seller_auth,'bemo-qa-s-'||marker||'@gmail.com','QA Seller'),(buyer,buyer_auth,'bemo-qa-b-'||marker||'@gmail.com','QA Buyer');
 insert into bemo_private.stores(id,owner_user_id,slug,title) values(shop,seller,'qa-'||marker,'QA '||marker);
 insert into bemo_private.store_settings(store_id,currency,delivery_fee_minor) values(shop,'IQD',2500);
 insert into bemo_private.products(id,store_id,title,description,category,status) values(product,shop,'Rollback fixture product','Synthetic QA description for rollback only','other','ACTIVE');
 insert into bemo_private.product_variants(id,product_id,store_id,sku,price_minor,currency) values(variant,product,shop,'QA-1',150000,'IQD');
 insert into bemo_private.stock_positions(variant_id,store_id,stock_on_hand) values(variant,shop,5);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',buyer_auth,'role','authenticated','session_id',buyer_session,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 set local role authenticated;
 q:=public.bemo_quote_cart(jsonb_build_array(jsonb_build_object('variant_id',variant,'quantity',2)));
 po:=public.bemo_place_order((q->>'id')::uuid,jsonb_build_object('recipient','QA Fixture','phone','0000000000','country','QA','region','QA','city','QA','address','Synthetic QA only'),gen_random_uuid());
 so:=po->'suborders'->0;
 reset role;
 if (select stock_on_hand from bemo_private.stock_positions where variant_id=variant)<>5 then raise exception 'QA_STOCK_RESERVED_TOO_EARLY'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',seller_auth,'role','authenticated','session_id',seller_session,'amr',jsonb_build_array(jsonb_build_object('method','oauth')))::text,true);
 set local role authenticated;
 if public.bemo_get_order((so->>'id')::uuid)->'delivery'<>'null'::jsonb then raise exception 'QA_PII_LEAK'; end if;
 perform public.bemo_order_action((so->>'id')::uuid,'ACCEPT','',1,key);
 perform public.bemo_order_action((so->>'id')::uuid,'ACCEPT','',1,key);
 if public.bemo_get_order((so->>'id')::uuid)->'delivery'->>'recipient'<>'QA Fixture' then raise exception 'QA_ACCEPTED_DELIVERY_MISSING'; end if;
 reset role;
 if (select stock_on_hand from bemo_private.stock_positions where variant_id=variant)<>3 then raise exception 'QA_DUPLICATE_DEBIT'; end if;
 raise sqlstate 'ZX001' using message='Verified; roll back the entire fixture subtransaction';
 exception when sqlstate 'ZX001' then null;
 end;
end $test$;
select jsonb_build_object('result','PASS: checkout, pre-accept privacy, acceptance and retry on hosted PostgreSQL; all QA fixture writes rolled back','remaining_orders',(select count(*) from bemo_private.parent_orders),'remaining_products',(select count(*) from bemo_private.products));
