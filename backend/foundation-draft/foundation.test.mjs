import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// A real embedded PostgreSQL engine. The auth schema/claims below are fixtures,
// NOT live Supabase Auth, JWT signature verification, OAuth, or concurrency tests.
const users = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const sessions = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
let db;
const claims = (i=0, extra={}) => ({sub:users[i],role:'authenticated',session_id:sessions[i],amr:[{method:'oauth',timestamp:1}],...extra});
async function asRole(role, jwt, sql, params=[]) {
  assert.ok(['anon','authenticated'].includes(role));
  await db.exec('begin');
  try {
    await db.exec('set local role '+role);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(jwt)]);
    const result=await db.query(sql,params);
    await db.exec('commit');
    return result.rows;
  } catch(error) { await db.exec('rollback'); throw error; }
}
const call = async (name, args=[], i=0, extra={}) => {
  const placeholders=args.map((_,j)=>'$'+(j+1)).join(',');
  const rows=await asRole('authenticated',claims(i,extra),`select public.${name}(${placeholders}) as value`,args);
  return rows[0].value;
};
const onboard=(i=0, extra={})=>call('bemo_onboard',['Buyer '+i,'ar'],i,extra);
const createStore=async(i=0,title='متجر جميل',slug='good-finds')=>{
 const path=users[i]+'/'+randomUUID()+'.pdf';
 await asRole('authenticated',claims(i),'insert into storage.objects(bucket_id,name) values($1,$2)',['bemo-seller-identity',path]);
 return call('bemo_register_seller',[title,slug,'Physical goods',{legal_name:'Test Seller',phone:'+9647000000000',address:'Test address',identity_path:path,terms_version:'seller-2026-11'}],i);
};
const directory=()=>asRole('anon',{},'select * from public.bemo_list_stores()');
const expectDenied=async action=>{ await assert.rejects(action); };

before(async()=>{
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select on storage.objects to anon,authenticated;
    grant insert on storage.objects to authenticated;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users(id),provider text,identity_data jsonb);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.jwt(),auth.uid() to anon,authenticated;
  `);
  const migrationDirectory = new URL('../../supabase/migrations/',import.meta.url);
  const migrations = (await readdir(migrationDirectory)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
  assert.ok(migrations.length > 0, 'Canonical migrations must exist');
  for (const name of migrations) await db.exec(await readFile(new URL(name,migrationDirectory),'utf8'));
  console.log('Embedded engine:',(await db.query('select version()')).rows[0].version);
});
beforeEach(async()=>{
  // This database exists only in memory and contains only the fixture accounts.
  const tables=await db.query("select quote_ident(schemaname)||'.'||quote_ident(tablename) as name from pg_tables where schemaname='bemo_private' and tablename not in ('reserved_store_slugs','currencies')");
  if(tables.rows.length) await db.exec('truncate '+tables.rows.map(x=>x.name).join(',')+' restart identity cascade');
  await db.exec('truncate auth.users cascade');
  await db.exec('truncate storage.objects');
  for(let i=0;i<users.length;i++){
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[users[i],`buyer${i}@gmail.com`]);
    await db.query('insert into auth.identities values($1,$2,$3)',[users[i],'google',{email:`buyer${i}@gmail.com`,email_verified:true}]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[i],users[i]]);
  }
});
after(async()=>{await db?.close();});

async function merchant(i=0) {
 await onboard(i);await createStore(i,'متجر التاجر '+i,'merchant-'+i);
 await call('bemo_save_store_settings',[2500,'IQD',0],i);
 const p=await call('bemo_save_product',[null,'منتج التاجر الجديد','وصف مفصل للمنتج المادي المعروض للبيع','other',0],i);
 const v=await call('bemo_save_variant',[p.id,null,'SKU-1','أساسي',150000,true,0],i);
 return {p,v};
}
const requestA='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function mediaFor(p,i=0){
 const m=await call('bemo_prepare_media',[p.id,randomUUID(),'صورة توضيحية للمنتج'],i);
 await asRole('authenticated',claims(i),'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', ['bemo-products',m.storage_key,{mimetype:'image/jpeg',size:1200}]);
 await call('bemo_finish_media',[m.id,false],i);return m;
}
const publicProducts=()=>asRole('anon',{},'select public.bemo_list_products() as value').then(r=>r[0].value);

test('manual topups require staff approval, isolate stores and credit exactly once',async()=>{
 await merchant();await merchant(1);await adminFixture();
 const input={amount_minor:25000,currency:'IQD',reference:'Bank-001',note:'test'};
 await call('bemo_topups',['BANK',{bank:'Test bank',beneficiary:'BEMO Test',account_number:'TEST12345',currency:'IQD',enabled:true}],2);
 const bank=(await call('bemo_topups',['MINE',{}])).banks[0];input.bank_id=bank.id;
 await assert.rejects(()=>call('bemo_topups',['SUBMIT',{...input,bank_id:null}]),/FINANCE_INVALID/);
 const submit=()=>call('bemo_topups',['SUBMIT',input]);
 const request=await submit();assert.equal((await submit()).id,request.id);
 assert.equal((await call('bemo_topups',['MINE',{}],1)).rows.length,0);
 await assert.rejects(()=>call('bemo_topups',['QUEUE',{}]),/ADMIN_REQUIRED/);
 const decision={id:request.id,reason:'Verified bank transfer in account statement'};
 await assert.rejects(()=>call('bemo_topups',['APPROVE',decision]),/ADMIN_REQUIRED/);
 assert.equal((await db.query('select * from bemo_private.balance_ledger')).rows.length,0);
 for(let i=0;i<2;i++)assert.equal((await call('bemo_topups',['APPROVE',decision],2)).state,'APPROVED');
 assert.equal((await db.query('select * from bemo_private.balance_ledger')).rows.length,1);
 await assert.rejects(()=>call('bemo_topups',['REJECT',decision],2),/REQUEST_CONFLICT/);
});

test('homepage discovery: staff-only editing, visible targets and withdrawal',async()=>{
 const {v}=await stockedMerchant();
 const sid=(await db.query('select id from bemo_private.stores limit 1')).rows[0].id;
 const feed=async()=>(await asRole('anon',{},'select public.bemo_discovery_feed() as rows'))[0].rows;
 const brand=['brand',sid,'Test brand',null,null,true,1];
 await assert.rejects(()=>call('bemo_set_discovery_entry',brand),/ADMIN_REQUIRED/);
 await adminFixture();
 await call('bemo_set_discovery_entry',brand,2);
 await call('bemo_set_discovery_entry',['offer',v.id,null,999999,'IQD',true,2],2);
 assert.deepEqual((await feed()).map(row=>row.kind),['brand','offer']);
 await call('bemo_set_discovery_entry',['offer',v.id,null,1,'IQD',true,2],2);
 assert.deepEqual((await feed()).map(row=>row.kind),['brand']);
 await call('bemo_set_discovery_entry',[...brand.slice(0,5),false,1],2);
 assert.deepEqual(await feed(),[]);
});

test('delivery drafts: owner isolation, versions, duplicates and bounded validation',async()=>{
 await merchant();await merchant(1);
 const rule={country:'iq',region:' Baghdad ',label:'Baghdad',fee_minor:5000000,min_days:1,max_days:3};
 const saved=await call('bemo_save_delivery_regions',[[rule],0]);assert.equal(saved.version,1);assert.equal(saved.checkout_active,true);assert.equal(saved.rules[0].region,'baghdad');
 assert.equal((await call('bemo_delivery_workspace',[],1)).rules.length,0);
 await assert.rejects(()=>call('bemo_save_delivery_regions',[[rule],0]),/VERSION_CONFLICT/);
 await assert.rejects(()=>call('bemo_save_delivery_regions',[[rule,rule],1]),/DELIVERY_DUPLICATE/);
 for(const changed of [{fee_minor:-1},{min_days:4,max_days:2},{max_days:366},{country:''},{region:''}])await assert.rejects(()=>call('bemo_save_delivery_regions',[[{...rule,...changed}],1]),/DELIVERY_INVALID/);
 await expectDenied(()=>asRole('anon',{},'select public.bemo_delivery_workspace()'));
 await expectDenied(()=>asRole('authenticated',claims(),'select * from bemo_private.delivery_configs'));
 assert.equal((await call('bemo_delivery_workspace')).version,1);
});
test('delivery resolution: exact region overrides national coverage; no implicit cross-currency or uncovered delivery',async()=>{
 const {p}=await merchant();const national={country:'IQ',region:'*',label:'Iraq',fee_minor:8000000,min_days:3,max_days:7};const local={...national,region:'baghdad',label:'Baghdad',fee_minor:5000000,min_days:1,max_days:2};
 await call('bemo_save_delivery_regions',[[national,local],0]);
 const resolve=(country,region,currency='IQD')=>db.query('select bemo_private.resolve_delivery_region($1,$2,$3,$4) as value',[p.store_id,country,region,currency]).then(r=>r.rows[0].value);
 assert.equal((await resolve('iq',' Baghdad ')).fee_minor,5000000);assert.equal((await resolve('IQ','basra')).fee_minor,8000000);
 await assert.rejects(()=>resolve('SA','riyadh'),/DELIVERY_UNAVAILABLE/);await assert.rejects(()=>resolve('IQ','baghdad','USD'),/DELIVERY_UNAVAILABLE/);
 await expectDenied(()=>asRole('authenticated',claims(),'select bemo_private.resolve_delivery_region($1,$2,$3,$4)',[p.store_id,'IQ','baghdad','IQD']));
 await call('bemo_save_delivery_regions',[[],1]);await assert.rejects(()=>resolve('IQ','baghdad'),/DELIVERY_UNAVAILABLE/);
});

const searchProducts=(filter={})=>asRole('anon',{},'select public.bemo_search_products($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as value',[filter.search||'',filter.store||'',filter.category||'',filter.currency||'',filter.min??null,filter.max??null,filter.stock??false,filter.sort||'newest',filter.limit??24,filter.offset??0]).then(r=>r[0].value);
test('search: currency, inclusive range and stock must match the same active variant',async()=>{
 const {p,v}=await stockedMerchant(0,1);await call('bemo_adjust_stock',[v.id,-1,'Test stock depleted',randomUUID(),2]);
 const expensive=await call('bemo_save_variant',[p.id,null,'SKU-2','Available expensive',300000,true,0]);
 await call('bemo_adjust_stock',[expensive.id,3,'Test stock',randomUUID(),1]);
 assert.equal((await searchProducts({currency:'IQD',max:150000})).length,1);
 assert.equal((await searchProducts({currency:'IQD',max:150000,stock:true})).length,0);
 const r=await searchProducts({currency:'IQD',min:300000,max:300000,stock:true});assert.equal(r.length,1);assert.equal(r[0].variants.length,1);assert.equal(r[0].variants[0].id,expensive.id);assert.equal(r[0].variants[0].sku,undefined);assert.equal(r[0].owner_user_id,undefined);
 assert.equal((await searchProducts({currency:'USD'})).length,0);assert.equal((await searchProducts({category:'fashion'})).length,0);
 await db.query('update bemo_private.product_variants set active=false where id=$1',[expensive.id]);assert.equal((await searchProducts({stock:true})).length,0);
});
test('search: global price ordering and deterministic pagination happen before limiting',async()=>{
 const a=await stockedMerchant(0),b=await stockedMerchant(1);
 await db.query('update bemo_private.product_variants set price_minor=100000 where id=$1',[b.v.id]);
 const low=await searchProducts({currency:'IQD',sort:'price_asc',limit:1});const next=await searchProducts({currency:'IQD',sort:'price_asc',limit:1,offset:1});assert.equal(low[0].id,b.p.id);assert.equal(next[0].id,a.p.id);
 assert.equal((await searchProducts({currency:'IQD',sort:'price_desc',limit:1}))[0].id,a.p.id);
 assert.equal((await searchProducts({store:'merchant-0'}))[0].id,a.p.id);
 assert.equal((await searchProducts({search:'%'})).length,0);
 await db.query('update bemo_private.product_variants set price_minor=150000 where id=$1',[b.v.id]);
 const all=await searchProducts({currency:'IQD',sort:'price_asc'});const pages=[...(await searchProducts({currency:'IQD',sort:'price_asc',limit:1})),...(await searchProducts({currency:'IQD',sort:'price_asc',limit:1,offset:1}))];assert.deepEqual(pages.map(p=>p.id),all.map(p=>p.id));
});
test('search: no cross-currency price comparison and malformed queries are rejected',async()=>{
 for(const f of [{min:1},{sort:'price_asc'},{currency:'BAD'},{currency:'IQD',min:10,max:1},{currency:'IQD',min:-1},{currency:'IQD',max:9000000000000001},{sort:'injected'},{limit:101},{offset:10001}])await assert.rejects(()=>searchProducts(f),/QUERY_INVALID/);
});
test('search: suspended, deleted and banned sellers plus archived products stay hidden',async()=>{
 const {p}=await stockedMerchant();assert.equal((await searchProducts()).length,1);
 await db.query("update bemo_private.products set status='ARCHIVED' where id=$1",[p.id]);assert.equal((await searchProducts()).length,0);
 await db.query("update bemo_private.products set status='ACTIVE' where id=$1",[p.id]);
 await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[users[0]]);assert.equal((await searchProducts()).length,0);
 await db.query('update auth.users set banned_until=null,deleted_at=now() where id=$1',[users[0]]);assert.equal((await searchProducts()).length,0);
 await db.query('update auth.users set deleted_at=null where id=$1',[users[0]]);await db.exec("update bemo_private.stores set status='SUSPENDED'");assert.equal((await searchProducts()).length,0);
});

const publicProduct=id=>asRole('anon',{},'select public.bemo_get_product($1) as value',[id]).then(r=>r[0].value);
const publicStore=slug=>asRole('anon',{},'select public.bemo_get_store($1) as value',[slug]).then(r=>r[0].value);
test('store profile: public empty store, safe projection, real product counts, suspension hiding',async()=>{
 await onboard();await createStore();let s=await publicStore('good-finds');assert.equal(s.product_count,0);assert.equal(s.currency,null);assert.equal(s.owner_user_id,undefined);assert.equal(s.profile_version,undefined);
 assert.equal(await publicStore('not-here'),null);await db.exec("update bemo_private.stores set status='SUSPENDED'");assert.equal(await publicStore('good-finds'),null);
});
test('store editing: owner isolation, exact version and unique title, no slug mutation',async()=>{
 await onboard();await createStore();await onboard(1);await createStore(1,'Other Store','other-store');
 const s=await call('bemo_save_store_profile',['My edited store','New description','Baghdad','New arrivals',1]);assert.equal(s.profile_version,2);assert.equal(s.slug,'good-finds');
 assert.equal((await publicStore('good-finds')).headline,'New arrivals');assert.equal((await publicStore('other-store')).title,'Other Store');
 await assert.rejects(()=>call('bemo_save_store_profile',['stale','','','',1]),/VERSION_CONFLICT/);
 await assert.rejects(()=>call('bemo_save_store_profile',['Other Store','','','',2]),/TITLE_TAKEN/);
 await expectDenied(()=>asRole('anon',{},"select public.bemo_store_workspace()"));
 await db.query('update bemo_private.app_users set status=$1 where auth_subject=$2',['SUSPENDED',users[0]]);assert.equal(await publicStore('good-finds'),null);
});
test('dashboard: true aggregates across states, 14 days, empty currency stays unset and private totals isolated',async()=>{
 const {v}=await stockedMerchant(0,4);await onboard(1);let d=await call('bemo_seller_dashboard');assert.equal(d.products,1);assert.equal(d.low_stock,1);assert.equal(d.orders,0);assert.equal(d.trend.length,14);assert.equal(d.cod_by_currency.length,0);
 let o=(await ordered(v)).suborders[0];d=await call('bemo_seller_dashboard');assert.equal(d.pending,1);assert.equal(d.trend.reduce((n,x)=>n+x.orders,0),1);assert.equal(d.cod_by_currency.length,0);
 o=await action(o,'ACCEPT');o=await action(o,'SHIP');o=await action(o,'DELIVER');d=await call('bemo_seller_dashboard');assert.equal(d.pending,0);assert.equal(d.cod_by_currency[0].total_minor,o.total_minor);assert.equal(d.recent_orders.length,1);assert.equal(d.recent_orders[0].buyer_id,undefined);
 await createStore(1,'Buyer Store','buyer-store');assert.equal((await call('bemo_seller_dashboard',[],1)).orders,0);
});
test('saved addresses: own rows only, version control, retry safety and bounded validation',async()=>{
 await onboard();await onboard(1);const id=randomUUID();const a=await call('bemo_save_address',[id,'Home',deliveryFixture,0]);assert.equal(a.version,1);
 assert.equal((await call('bemo_save_address',[id,'Home',deliveryFixture,0])).version,1);assert.equal((await call('bemo_list_addresses')).length,1);assert.equal((await call('bemo_list_addresses',[],1)).length,0);
 await assert.rejects(()=>call('bemo_save_address',[id,'Other',deliveryFixture,1],1),/ADDRESS_UNAVAILABLE/);
 await assert.rejects(()=>call('bemo_delete_address',[id,1],1),/ADDRESS_UNAVAILABLE/);
 const updated=await call('bemo_save_address',[id,'Work',deliveryFixture,1]);assert.equal(updated.version,2);
 await assert.rejects(()=>call('bemo_delete_address',[id,1]),/VERSION_CONFLICT/);
 await assert.rejects(()=>call('bemo_save_address',[randomUUID(),'Bad',{...deliveryFixture,owner_id:users[1]},0]),/ADDRESS_INVALID/);
 await assert.rejects(()=>call('bemo_save_address',[randomUUID(),'Bad',{...deliveryFixture,recipient:null},0]),/ADDRESS_INVALID/);
 await expectDenied(()=>asRole('anon',{},'select public.bemo_list_addresses()'));
 await expectDenied(()=>asRole('authenticated',claims(),'select * from bemo_private.saved_addresses'));
 await call('bemo_delete_address',[id,2]);assert.equal((await call('bemo_list_addresses')).length,0);
 for(let i=0;i<10;i++)await call('bemo_save_address',[randomUUID(),'Home '+i,deliveryFixture,0]);
 await assert.rejects(()=>call('bemo_save_address',[randomUUID(),'Overflow',deliveryFixture,0]),/ADDRESS_LIMIT/);
});
test('product detail matches public listing, exposes no owner contact and hides drafts',async()=>{
 const {p}=await merchant();assert.equal(await publicProduct(p.id),null);assert.equal(await publicProduct(randomUUID()),null);
 await mediaFor(p);await call('bemo_product_status',[p.id,'ACTIVE',1]);
 const detail=await publicProduct(p.id);assert.deepEqual(detail,(await publicProducts())[0]);
 assert.deepEqual(Object.keys(detail).sort(),['id','store_id','title','description','category','store_title','store_slug','currency','delivery_fee_minor','media','variants'].sort());
 await call('bemo_product_status',[p.id,'HIDDEN_BY_OWNER',2]);assert.equal(await publicProduct(p.id),null);
});
test('direct product links obey product, store, owner and auth visibility',async()=>{
 const {p}=await stockedMerchant();
 for(const status of ['HIDDEN_BY_OWNER','ARCHIVED','SUSPENDED']){await db.query('update bemo_private.products set status=$1 where id=$2',[status,p.id]);assert.equal(await publicProduct(p.id),null);}
 await db.query("update bemo_private.products set status='ACTIVE' where id=$1",[p.id]);
 await db.exec("update bemo_private.stores set status='CLOSED'");assert.equal(await publicProduct(p.id),null);
 await db.exec("update bemo_private.stores set status='ACTIVE'; update bemo_private.app_users set status='SUSPENDED'");assert.equal(await publicProduct(p.id),null);
 await db.exec("update bemo_private.app_users set status='ACTIVE'");
 await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[users[0]]);assert.equal(await publicProduct(p.id),null);
 await db.query('update auth.users set banned_until=null,deleted_at=now() where id=$1',[users[0]]);assert.equal(await publicProduct(p.id),null);
});
test('detail omits disabled variants and pending images',async()=>{
 const {p,v}=await stockedMerchant();await call('bemo_prepare_media',[p.id,randomUUID(),'Pending image']);
 await call('bemo_save_variant',[p.id,null,'SKU-2','Second option',250000,true,0]);
 await call('bemo_save_variant',[p.id,v.id,'SKU-1','أساسي',150000,false,1]);
 const detail=await publicProduct(p.id);assert.equal(detail.variants.length,1);assert.notEqual(detail.variants[0].id,v.id);assert.equal(detail.media.length,1);
});

// Orders use only synthetic accounts and addresses in this in-memory database.
const deliveryFixture={recipient:'Test Buyer',phone:'+9647000000000',country:'Test Country',region:'Test Region',city:'Test City',address:'Synthetic delivery address',note:'Fixture only'};
async function stockedMerchant(i=0,quantity=10){
 const {p,v}=await merchant(i);await mediaFor(p,i);await call('bemo_product_status',[p.id,'ACTIVE',1],i);
 await call('bemo_adjust_stock',[v.id,quantity,'Test opening stock',randomUUID(),1],i);return {p,v};
}
async function quoted(v,qty=2,buyer=1){return call('bemo_quote_cart',[[{variant_id:v.id,quantity:qty}]],buyer);}
async function ordered(v,qty=2,buyer=1){
 const q=await quoted(v,qty,buyer);return call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],buyer);
}
const action=(o,a,i=0,reason='',key=randomUUID())=>call('bemo_order_action',[o.id,a,reason,o.version,key],i);

test('buyer tracks manual driver arrival and final delivery',async()=>{
 const {v}=await stockedMerchant();await onboard(1);let order=(await ordered(v)).suborders[0];
 for(const [step,note] of [['ACCEPT',''],['PACK',''],['SHIP',''],['ATTEMPT_DELIVERY','DRIVER_ARRIVED'],['DELIVER','']])
   order=await action(order,step,0,note);
 const buyer=await call('bemo_get_order',[order.id],1);
 assert.equal(buyer.state,'DELIVERED');assert.ok(buyer.events.some(e=>e.action==='DRIVER_ARRIVED'));
});

test('seller registration keeps documents private and username permanent',async()=>{
 await onboard(); const store=await createStore();
 assert.equal(await call('bemo_slug_available',['good-finds']),false);
 assert.equal(await call('bemo_slug_available',['another-store']),true);
 await assert.rejects(()=>db.query("update bemo_private.stores set slug='renamed' where id=$1",[store.id]),/SLUG_PERMANENT/);
 assert.equal((await asRole('anon',{},"select * from storage.objects where bucket_id='bemo-seller-identity'")).length,0);
 await assert.rejects(()=>call('bemo_create_store',['Legacy','legacy-store','']),/permission denied/);
});
const stockOf=async v=>(await db.query('select stock_on_hand from bemo_private.stock_positions where variant_id=$1',[v.id])).rows[0].stock_on_hand;

async function support(i=2){await onboard(i);await db.query("insert into bemo_private.user_roles(user_id,role) select id,'support' from bemo_private.app_users where auth_subject=$1 on conflict do nothing",[users[i]]);}
const cases=()=>call('bemo_support_queue',[],2);
const decide=(c,o,decision,received=false,reason='Human reviewed the evidence and recorded the decision')=>call('bemo_support_decision',[c.id,decision,reason,received,o.version],2);
test('support: 24h reminder and 48h escalation are durable and deduplicated without cancellation',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();const o=(await ordered(v)).suborders[0];
 await db.query("update bemo_private.suborders set pending_since=now()-interval '25 hours' where id=$1",[o.id]);
 assert.deepEqual((await db.query('select bemo_private.process_order_deadlines() value')).rows[0].value,{reminded:1,escalated:0});
 assert.deepEqual((await db.query('select bemo_private.process_order_deadlines() value')).rows[0].value,{reminded:0,escalated:0});
 await db.query("update bemo_private.suborders set pending_since=now()-interval '49 hours' where id=$1",[o.id]);
 assert.equal((await db.query('select bemo_private.process_order_deadlines() value')).rows[0].value.escalated,1);
 assert.equal((await db.query('select bemo_private.process_order_deadlines() value')).rows[0].value.escalated,0);
 const updated=await call('bemo_get_order',[o.id],1);assert.equal(updated.state,'ESCALATED_TO_SUPPORT');assert.equal(await stockOf(v),10);
 await assert.rejects(()=>action(updated,'ACCEPT'),/BEMO_TRANSITION_INVALID/);
 assert.equal((await cases()).length,1);await assert.rejects(()=>asRole('authenticated',claims(),'select bemo_private.process_order_deadlines()'));
});
test('support: only assigned staff may read PII and all access is logged',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();let o=(await ordered(v)).suborders[0];o=await action(o,'ACCEPT');o=await action(o,'REQUEST_CANCEL',1,'Please review the requested cancellation');
 const c=(await cases())[0];await assert.rejects(()=>call('bemo_support_queue',[],1),/BEMO_SUPPORT_REQUIRED/);
 await assert.rejects(()=>call('bemo_support_case',[c.id,false],2),/BEMO_CASE_NOT_ASSIGNED/);
 const work=await call('bemo_support_case',[c.id,true],2);assert.equal(work.order.delivery.address,deliveryFixture.address);
 assert.equal((await db.query("select count(*)::int n from bemo_private.order_access_log where purpose like 'SUPPORT_CASE:%'")).rows[0].n,1);
 await db.query("insert into bemo_private.user_roles(user_id,role) select id,'support' from bemo_private.app_users where auth_subject=$1",[users[0]]);
 await assert.rejects(()=>call('bemo_support_case',[c.id,true]),/BEMO_CASE_CONFLICT_OF_INTEREST/);
 await db.query("delete from bemo_private.user_roles where user_id=(select id from bemo_private.app_users where auth_subject=$1)",[users[2]]);
 await assert.rejects(()=>call('bemo_support_case',[c.id,false],2),/BEMO_SUPPORT_REQUIRED/);
});
test('support: cancellation only restocks on explicit goods receipt and is exactly once',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();let o=(await ordered(v)).suborders[0];o=await action(o,'ACCEPT');o=await action(o,'REQUEST_CANCEL',1,'Cancellation requested for human review');
 const c=(await cases())[0];await call('bemo_support_case',[c.id,true],2);const done=await decide(c,o,'APPROVE_CANCEL',true);
 assert.equal(done.state,'CANCELLED_BY_SUPPORT');assert.equal(await stockOf(v),10);await decide(c,o,'APPROVE_CANCEL',true);assert.equal(await stockOf(v),10);
 assert.equal((await db.query("select count(*)::int n from bemo_private.order_lines where debit_movement_id is not null and restore_movement_id is not null")).rows[0].n,1);
});
test('support: a failed/lost delivery does not silently return stock',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();let o=(await ordered(v)).suborders[0];o=await action(o,'ACCEPT');o=await action(o,'SHIP');o=await action(o,'FAIL_DELIVERY',0,'Parcel was lost and is not physically returned');
 const c=(await cases())[0];await call('bemo_support_case',[c.id,true],2);await decide(c,o,'APPROVE_CANCEL',false);assert.equal(await stockOf(v),8);
});
test('support: return confirmation requires review and verified physical receipt',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();let o=(await ordered(v)).suborders[0];o=await action(o,'ACCEPT');o=await action(o,'SHIP');o=await action(o,'DELIVER');o=await action(o,'REQUEST_RETURN',1,'Please inspect the received product for return');
 const c=(await cases())[0];await call('bemo_support_case',[c.id,true],2);
 await assert.rejects(()=>decide(c,o,'CONFIRM_RETURN',true),/BEMO_TRANSITION_INVALID/);
 o=await decide(c,o,'REVIEW_RETURN');await assert.rejects(()=>decide(c,o,'CONFIRM_RETURN',false),/BEMO_TRANSITION_INVALID/);
 o=await decide(c,o,'CONFIRM_RETURN',true);assert.equal(o.state,'RETURNED');assert.equal(await stockOf(v),10);
});
test('support: follow-up resets deadline cycle and buyer cancellation closes delay case',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();let o=(await ordered(v)).suborders[0];
 await db.query("update bemo_private.suborders set pending_since=now()-interval '49 hours' where id=$1",[o.id]);await db.query('select bemo_private.process_order_deadlines()');
 o=await call('bemo_get_order',[o.id],1);let c=(await cases())[0];await call('bemo_support_case',[c.id,true],2);o=await decide(c,o,'FOLLOW_UP');assert.equal(o.state,'PENDING_SELLER');
 assert.equal((await db.query('select bemo_private.process_order_deadlines() value')).rows[0].value.escalated,0);
 await db.query("update bemo_private.suborders set pending_since=now()-interval '49 hours' where id=$1",[o.id]);await db.query('select bemo_private.process_order_deadlines()');
 o=await call('bemo_get_order',[o.id],1);assert.equal((await cases()).length,1);await action(o,'CANCEL',1);assert.equal((await cases()).length,0);assert.equal(await stockOf(v),10);
});
test('notifications: inbox and mark-read cannot cross accounts',async()=>{
 const {v}=await stockedMerchant();await onboard(1);const o=(await ordered(v)).suborders[0];const inbox=await call('bemo_notifications');assert.equal(inbox.length,1);assert.equal(inbox[0].user_id,undefined);
 await call('bemo_notifications',[24,0,inbox[0].id],1);assert.equal((await call('bemo_notifications'))[0].read_at,null);
 await call('bemo_notifications',[24,0,inbox[0].id]);assert.ok((await call('bemo_notifications'))[0].read_at);
 await action(o,'ACCEPT');assert.equal((await call('bemo_notifications',[],1)).length,1);
});

test('orders: checkout creates immutable quote and does not reserve stock',async()=>{
 const {v}=await stockedMerchant();await onboard(1);const order=await ordered(v);
 assert.equal(order.suborders.length,1);assert.equal(order.total_minor,302500);assert.equal(await stockOf(v),10);
 assert.equal(order.suborders[0].state,'PENDING_SELLER');assert.equal(order.suborders[0].delivery.recipient,'Test Buyer');
 const seller=await call('bemo_get_order',[order.suborders[0].id]);
 assert.equal(seller.delivery,null);assert.equal(seller.region,null);assert.equal(seller.country,null);assert.equal(seller.buyer_id,undefined);
 assert.ok(!JSON.stringify(seller).includes('7000000000'));assert.ok(!JSON.stringify(seller).includes('Test Buyer'));
});
test('orders: acceptance debits exactly once and releases delivery only to that merchant',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await onboard(2);const order=await ordered(v);let o=order.suborders[0];
 const key=randomUUID();const accepted=await action(o,'ACCEPT',0,'',key);assert.equal(accepted.state,'ACCEPTED');assert.equal(await stockOf(v),8);
 await action(o,'ACCEPT',0,'',key);assert.equal(await stockOf(v),8);
 await assert.rejects(()=>action(accepted,'ACCEPT'),/BEMO_TRANSITION_INVALID/);
 const seller=await call('bemo_get_order',[o.id]);assert.equal(seller.delivery.address,deliveryFixture.address);
 await assert.rejects(()=>call('bemo_get_order',[o.id],2),/BEMO_ORDER_UNAVAILABLE/);
 assert.deepEqual(await call('bemo_list_orders',['buyer',24,0],2),[]);
 assert.equal((await db.query("select count(*)::int n from bemo_private.inventory_movements where kind='ACCEPT_DEBIT'")).rows[0].n,1);
});
test('orders: checkout retries and key mismatches cannot create duplicate parents',async()=>{
 const {v}=await stockedMerchant();await onboard(1);const q=await quoted(v),key=randomUUID();
 const a=await call('bemo_place_order',[q.id,deliveryFixture,key],1),b=await call('bemo_place_order',[q.id,deliveryFixture,key],1);
 assert.equal(a.id,b.id);assert.equal((await call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],1)).id,a.id);
 await assert.rejects(()=>call('bemo_place_order',[q.id,{...deliveryFixture,recipient:'Changed Buyer'},key],1),/BEMO_REQUEST_CONFLICT/);
 const other=await quoted(v);await assert.rejects(()=>call('bemo_place_order',[other.id,deliveryFixture,key],1),/BEMO_REQUEST_CONFLICT/);
 assert.equal((await db.query('select count(*)::int n from bemo_private.parent_orders')).rows[0].n,1);
});
test('orders: quote price and delivery changes require a fresh customer quote',async()=>{
 const {p,v}=await stockedMerchant();await onboard(1);let q=await quoted(v);
 await call('bemo_save_store_settings',[3500,'IQD',1]);
 await assert.rejects(()=>call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],1),/BEMO_QUOTE_CHANGED/);
 q=await quoted(v);await call('bemo_save_variant',[p.id,v.id,v.sku,v.label,160000,true,1]);
 await assert.rejects(()=>call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],1),/BEMO_QUOTE_CHANGED/);
 const o=await ordered(v);assert.equal(o.total_minor,323500);
 await call('bemo_save_store_settings',[5000,'IQD',2]);assert.equal((await call('bemo_get_order',[o.suborders[0].id],1)).delivery_fee_minor,3500);
});
test('orders: expired, foreign and malformed quotes leave no partial orders',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await onboard(2);const q=await quoted(v);
 await assert.rejects(()=>call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],2),/BEMO_QUOTE_EXPIRED/);
 await assert.rejects(()=>call('bemo_place_order',[q.id,{...deliveryFixture,address:'x'},randomUUID()],1));
 await db.query("update bemo_private.checkout_quotes set expires_at=now()-interval '1 second' where id=$1",[q.id]);
 await assert.rejects(()=>call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],1),/BEMO_QUOTE_EXPIRED/);
 assert.equal((await db.query('select count(*)::int n from bemo_private.parent_orders')).rows[0].n,0);
});
test('orders: one checkout creates independent seller orders and charges each fee once',async()=>{
 const a=await stockedMerchant(0),b=await stockedMerchant(1);await onboard(2);
 const q=await call('bemo_quote_cart',[[{variant_id:a.v.id,quantity:2},{variant_id:b.v.id,quantity:3}]],2);
 const po=await call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],2);assert.equal(po.suborders.length,2);assert.equal(po.total_minor,755000);
 const first=po.suborders.find(x=>x.store_id===a.p.store_id),second=po.suborders.find(x=>x.store_id===b.p.store_id);
 await action(first,'ACCEPT');await action(second,'CANCEL',2);
 assert.equal(await stockOf(a.v),8);assert.equal(await stockOf(b.v),10);
 assert.equal((await call('bemo_list_orders',['seller',24,0],0)).length,1);
 await assert.rejects(()=>call('bemo_get_order',[second.id]),/BEMO_ORDER_UNAVAILABLE/);
 assert.equal((await call('bemo_get_order',[first.id],2)).state,'ACCEPTED');
});
test('orders: all line debits roll back when a later stock check fails',async()=>{
 const {p,v}=await stockedMerchant();await onboard(1);
 const v2=await call('bemo_save_variant',[p.id,null,'SKU-2','Another',5000,true,0]);
 await call('bemo_adjust_stock',[v2.id,10,'Fixture stock',randomUUID(),1]);
 const q=await call('bemo_quote_cart',[[{variant_id:v.id,quantity:2},{variant_id:v2.id,quantity:2}]],1);
 const po=await call('bemo_place_order',[q.id,deliveryFixture,randomUUID()],1);
 const last=[v,v2].sort((a,b)=>a.id.localeCompare(b.id))[1];await call('bemo_adjust_stock',[last.id,-10,'Unavailable inventory',randomUUID(),2]);
 await assert.rejects(()=>action(po.suborders[0],'ACCEPT'),/BEMO_STOCK_INSUFFICIENT/);
 assert.equal((await db.query("select count(*)::int n from bemo_private.inventory_movements where kind='ACCEPT_DEBIT'")).rows[0].n,0);
 assert.equal((await call('bemo_get_order',[po.suborders[0].id])).delivery,null);
 assert.equal(await stockOf([v,v2].find(x=>x.id!==last.id)),10);
});
test('orders: pending cancellation and rejection never debit or reveal delivery',async()=>{
 const {v}=await stockedMerchant();await onboard(1);const a=await ordered(v),b=await ordered(v);
 await action(a.suborders[0],'CANCEL',1);await action(b.suborders[0],'REJECT',0,'This item cannot be supplied currently');
 assert.equal(await stockOf(v),10);assert.equal((await call('bemo_get_order',[a.suborders[0].id])).delivery,null);
 await assert.rejects(()=>action(a.suborders[0],'ACCEPT'),/BEMO_VERSION_CONFLICT/);
});
test('orders: buyer cancellation after acceptance requires human support without restock',async()=>{
 const {v}=await stockedMerchant();await onboard(1);let o=(await ordered(v)).suborders[0];o=await action(o,'ACCEPT');
 await assert.rejects(()=>action(o,'CANCEL',1),/BEMO_TRANSITION_INVALID/);
 o=await action(o,'REQUEST_CANCEL',1,'Please review cancellation of this order');assert.equal(o.state,'CANCEL_REQUESTED');assert.equal(await stockOf(v),8);
 await assert.rejects(()=>action(o,'SHIP'),/BEMO_TRANSITION_INVALID/);
 assert.equal((await db.query("select count(*)::int n from bemo_private.order_cases where kind='CANCELLATION'")).rows[0].n,1);
});
test('orders: fulfillment survives product archival and delivered return does not auto-restock',async()=>{
 const {p,v}=await stockedMerchant();await onboard(1);let o=(await ordered(v)).suborders[0];o=await action(o,'ACCEPT');
 await call('bemo_product_status',[p.id,'ARCHIVED',2]);o=await action(o,'PACK');o=await action(o,'SHIP');o=await action(o,'DELIVER');
 assert.ok(o.delivered_at);o=await action(o,'REQUEST_RETURN',1,'The received item requires human inspection');assert.equal(o.state,'RETURN_REQUESTED');assert.equal(await stockOf(v),8);
});
test('orders: self ordering, duplicate variants, missing stock and mixed currencies are refused',async()=>{
 const a=await stockedMerchant();await onboard(1);
 await assert.rejects(()=>quoted(a.v,1,0),/BEMO_ITEM_UNAVAILABLE/);
 await assert.rejects(()=>quoted(a.v,11),/BEMO_STOCK_INSUFFICIENT/);
 await assert.rejects(()=>call('bemo_quote_cart',[[{variant_id:a.v.id,quantity:1},{variant_id:a.v.id,quantity:1}]],1),/BEMO_CART_INVALID/);
 for(const cart of [null,[],{},[{variant_id:a.v.id,quantity:0}],[{variant_id:a.v.id,quantity:1.5}]]) await assert.rejects(()=>call('bemo_quote_cart',[cart],1));
 const b=await stockedMerchant(2);await db.query("update bemo_private.product_variants set currency='USD' where id=$1",[b.v.id]);await db.query("update bemo_private.store_settings set currency='USD' where store_id=$1",[b.p.store_id]);
 await assert.rejects(()=>call('bemo_quote_cart',[[{variant_id:a.v.id,quantity:1},{variant_id:b.v.id,quantity:1}]],1),/BEMO_MIXED_CURRENCY/);
});
test('orders: direct PII tables and internal projections are unavailable to every client role',async()=>{
 const {v}=await stockedMerchant();await onboard(1);const o=(await ordered(v)).suborders[0];
 for(const role of ['anon','authenticated']) for(const sql of ["select * from bemo_private.order_delivery",`select bemo_private.order_projection('${o.id}',true)`,`select bemo_private.quote_snapshot('[]',null)`]) await expectDenied(()=>asRole(role,claims(1),sql));
 await expectDenied(()=>asRole('anon',{},'select public.bemo_list_orders()'));
 await db.query('delete from auth.sessions where id=$1',[sessions[1]]);await assert.rejects(()=>call('bemo_get_order',[o.id],1),/BEMO_SESSION_INVALID/);
});
test('variant create retry does not duplicate stock positions',async()=>{
 const {p}=await merchant();const args=[p.id,requestA,'SKU-RETRY','أزرق',1000,true,0];
 const a=await call('bemo_save_variant',args),b=await call('bemo_save_variant',args);assert.equal(a.id,b.id);
 assert.equal((await call('bemo_merchant_catalog')).products[0].variants.length,2);
});
test('published product retains an enabled variant and archive prevents edits',async()=>{
 const {p,v}=await merchant();await mediaFor(p);const active=await call('bemo_product_status',[p.id,'ACTIVE',1]);
 await assert.rejects(()=>call('bemo_save_variant',[p.id,v.id,v.sku,v.label,v.price_minor,false,v.version]),/BEMO_VARIANT_REQUIRED/);
 await call('bemo_product_status',[p.id,'ARCHIVED',active.version]);assert.deepEqual(await publicProducts(),[]);
 await assert.rejects(()=>call('bemo_save_product',[p.id,p.title,p.description,p.category,3]),/BEMO_PRODUCT_UNAVAILABLE/);
});
test('explicit product IDs make create retries idempotent',async()=>{
 await merchant();const args=[requestA,'منتج آخر للاختبار','هذا وصف منتج آخر لاختبار إعادة الطلب','other',0];
 const first=await call('bemo_save_product',args);const second=await call('bemo_save_product',args);
 assert.equal(first.id,second.id);assert.equal((await call('bemo_merchant_catalog')).products.length,2);
});
test('publication requires a variant and uploaded image; hidden products disappear',async()=>{
 const {p}=await merchant();assert.deepEqual(await publicProducts(),[]);
 await assert.rejects(()=>call('bemo_product_status',[p.id,'ACTIVE',1]),/BEMO_PRODUCT_IMAGE_REQUIRED/);
 await mediaFor(p);const active=await call('bemo_product_status',[p.id,'ACTIVE',1]);
 let list=await publicProducts();assert.equal(list.length,1);assert.equal(list[0].delivery_fee_minor,2500);
 assert.equal(list[0].email,undefined);assert.equal(list[0].owner_user_id,undefined);assert.equal(list[0].variants[0].sku,undefined);
 await call('bemo_product_status',[p.id,'HIDDEN_BY_OWNER',active.version]);assert.deepEqual(await publicProducts(),[]);
});
test('private image RLS denies other sellers and public draft reads',async()=>{
 const {p}=await merchant();await merchant(1);const m=await call('bemo_prepare_media',[p.id,requestA,'صورة المنتج']);
 await expectDenied(()=>asRole('authenticated',claims(1),'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['bemo-products',m.storage_key,{mimetype:'image/jpeg',size:1200}]));
 await expectDenied(()=>call('bemo_finish_media',[m.id,false]));
 await asRole('authenticated',claims(),'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['bemo-products',m.storage_key,{mimetype:'image/jpeg',size:1200}]);
 assert.equal((await asRole('anon',{},'select * from storage.objects')).length,0);
 assert.equal((await asRole('authenticated',claims(1),'select * from storage.objects')).length,0);
 assert.equal((await asRole('authenticated',claims(),'select * from storage.objects')).length,1);
 await call('bemo_finish_media',[m.id,false]);await call('bemo_product_status',[p.id,'ACTIVE',1]);
 assert.equal((await asRole('anon',{},'select * from storage.objects')).length,1);
});
test('suspension removes public products and image access immediately',async()=>{
 const {p}=await merchant();await mediaFor(p);await call('bemo_product_status',[p.id,'ACTIVE',1]);
 await db.query("update bemo_private.app_users set status='SUSPENDED' where auth_subject=$1",[users[0]]);
 assert.deepEqual(await publicProducts(),[]);assert.equal((await asRole('anon',{},'select * from storage.objects')).length,0);
});
test('image removal is soft and cannot remove last published image',async()=>{
 const {p}=await merchant();const m=await mediaFor(p);const active=await call('bemo_product_status',[p.id,'ACTIVE',1]);
 await assert.rejects(()=>call('bemo_finish_media',[m.id,true]),/BEMO_PRODUCT_IMAGE_REQUIRED/);
 await call('bemo_product_status',[p.id,'HIDDEN_BY_OWNER',active.version]);await call('bemo_finish_media',[m.id,true]);
 assert.deepEqual(await call('bemo_merchant_media',[p.id]),[]);
 assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='bemo-products'")).rows[0].n,1);
});
test('merchant catalog starts empty and delivery fee is owner-editable',async()=>{
 await onboard();await createStore();let c=await call('bemo_merchant_catalog');assert.deepEqual(c.products,[]);assert.equal(c.settings,null);
 const first=await call('bemo_save_store_settings',[2500,'IQD',0]);assert.equal(first.delivery_fee_minor,2500);
 const second=await call('bemo_save_store_settings',[0,'IQD',first.version]);assert.equal(second.delivery_fee_minor,0);
 await assert.rejects(()=>call('bemo_save_store_settings',[100,'IQD',first.version]),/BEMO_VERSION_CONFLICT/);
});
test('product and variant edits preserve tenant ownership',async()=>{
 const a=await merchant();await merchant(1);
 await assert.rejects(()=>call('bemo_save_product',[a.p.id,'اسم منتج آخر','وصف آخر طويل بما يكفي للاختبار','home',1],1),/BEMO_PRODUCT_UNAVAILABLE/);
 await assert.rejects(()=>call('bemo_save_variant',[a.p.id,a.v.id,'OTHER','',500,true,1],1),/BEMO_PRODUCT_UNAVAILABLE/);
 const own=await call('bemo_merchant_catalog',[],1);assert.equal(own.products.length,1);assert.notEqual(own.products[0].id,a.p.id);
});
test('merchant product edits reject stale versions and invalid prices',async()=>{
 const {p,v}=await merchant();
 const updated=await call('bemo_save_product',[p.id,'اسم المنتج المعدل','وصف معدل مفصل للمنتج المعروض للبيع','home',p.version]);assert.equal(updated.version,2);
 await assert.rejects(()=>call('bemo_save_product',[p.id,'اسم المنتج المعدل','وصف معدل مفصل للمنتج المعروض للبيع','home',p.version]),/BEMO_VERSION_CONFLICT/);
 for(const price of [-1,0,1000000000000]) await assert.rejects(()=>call('bemo_save_variant',[p.id,v.id,'SKU-1','',price,true,v.version]),/BEMO_VARIANT_INVALID/);
 const variant=await call('bemo_save_variant',[p.id,v.id,'SKU-2','لون أحمر',200000,true,v.version]);assert.equal(variant.sku,'SKU-2');
});
test('stock adjustments are idempotent and cannot become negative',async()=>{
 const {v}=await merchant();const args=[v.id,5,'Initial stock',requestA,1];
 const a=await call('bemo_adjust_stock',args);const b=await call('bemo_adjust_stock',args);assert.equal(a.id,b.id);
 let c=await call('bemo_merchant_catalog');assert.equal(c.products[0].variants[0].stock_on_hand,5);
 await assert.rejects(()=>call('bemo_adjust_stock',[v.id,6,'Initial stock',requestA,1]),/BEMO_IDEMPOTENCY_CONFLICT/);
 await assert.rejects(()=>call('bemo_adjust_stock',[v.id,-6,'Damaged stock','dddddddd-dddd-4ddd-8ddd-dddddddddddd',2]),/BEMO_INSUFFICIENT_STOCK/);
 c=await call('bemo_merchant_catalog');assert.equal(c.products[0].variants[0].stock_on_hand,5);
 assert.equal((await db.query('select count(*)::int n from bemo_private.inventory_movements')).rows[0].n,1);
});
test('another merchant cannot adjust stock and revoked sessions fail closed',async()=>{
 const {v}=await merchant();await merchant(1);
 await assert.rejects(()=>call('bemo_adjust_stock',[v.id,5,'Initial stock',requestA,1],1),/BEMO_VARIANT_UNAVAILABLE/);
 await db.query('delete from auth.sessions where id=$1',[sessions[0]]);
 await expectDenied(()=>call('bemo_merchant_catalog'));await expectDenied(()=>call('bemo_adjust_stock',[v.id,5,'Initial stock',requestA,1]));
});
test('store currency cannot silently change established product prices',async()=>{
 await merchant();await assert.rejects(()=>call('bemo_save_store_settings',[100,'USD',1]),/BEMO_CURRENCY_LOCKED/);
 const c=await call('bemo_merchant_catalog');assert.equal(c.settings.currency,'IQD');assert.equal(c.products[0].variants[0].currency,'IQD');
});
test('anonymous and suspended accounts cannot access merchant operations',async()=>{
 await merchant();await expectDenied(()=>asRole('anon',{},'select public.bemo_merchant_catalog()'));
 await db.query("update bemo_private.app_users set status='SUSPENDED' where auth_subject=$1",[users[0]]);
 await expectDenied(()=>call('bemo_merchant_catalog'));await expectDenied(()=>call('bemo_save_store_settings',[0,'IQD',1]));
});

test('verified Google Gmail creates a stable application identity; retry keeps it',async()=>{
  const a=await onboard(); const b=await onboard(); assert.equal(a.id,b.id); assert.notEqual(a.id,users[0]);
  assert.equal((await db.query('select count(*)::int as n from bemo_private.app_users')).rows[0].n,1);
});
test('eligible first visit requires onboarding without creating a profile implicitly',async()=>{
  await assert.rejects(()=>call('bemo_get_profile'),{code:'42501',message:'BEMO_PROFILE_REQUIRED'});
  assert.equal((await db.query('select count(*)::int as n from bemo_private.app_users')).rows[0].n,0);
  await onboard();
  assert.equal((await call('bemo_get_profile')).status,'ACTIVE');
});
test('suspended profile stays unavailable and cannot be treated as new onboarding',async()=>{
  await onboard();
  await db.exec("update bemo_private.app_users set status='SUSPENDED'");
  await assert.rejects(()=>call('bemo_get_profile'),{code:'42501',message:'BEMO_PROFILE_UNAVAILABLE'});
  await assert.rejects(()=>onboard(),{code:'42501',message:'BEMO_PROFILE_UNAVAILABLE'});
});
test('anonymous visitors cannot onboard or read an application profile',async()=>{
  await expectDenied(()=>asRole('anon',{},"select public.bemo_onboard('Guest','ar')"));
  await expectDenied(()=>asRole('anon',{},'select public.bemo_get_profile()'));
});
test('missing subject cannot create a profile',async()=>{await expectDenied(()=>onboard(0,{sub:null}));});
test('non-Gmail and googlemail addresses are rejected by the server',async()=>{
  for(const email of ['buyer@example.com','buyer@googlemail.com','buyer@gmail.com.attacker.test']){
    await db.query('update auth.users set email=$1 where id=$2',[email,users[0]]);
    await db.query("update auth.identities set identity_data=jsonb_build_object('email',$1::text,'email_verified',true) where user_id=$2",[email,users[0]]);
    await expectDenied(()=>onboard());
  }
});
test('missing or unverified Google identity cannot be replaced with editable metadata',async()=>{
  await db.query("update auth.users set raw_user_meta_data='{}'::jsonb||jsonb_build_object('provider','google','email_verified',true,'role','superadmin') where id=$1",[users[0]]);
  await db.query("update auth.identities set identity_data=identity_data||'{\"email_verified\":false}' where user_id=$1",[users[0]]);
  await expectDenied(()=>onboard(0,{user_metadata:{provider:'google',role:'superadmin',email_verified:true}}));
  await db.query('delete from auth.identities where user_id=$1',[users[0]]);
  await expectDenied(()=>onboard());
});
test('an identity for another provider does not satisfy Google-only policy',async()=>{
  await db.query("update auth.identities set provider='github' where user_id=$1",[users[0]]); await expectDenied(()=>onboard());
});
test('Google identity email must match the trusted user email',async()=>{
  await db.query("update auth.identities set identity_data=identity_data||'{\"email\":\"different@gmail.com\"}' where user_id=$1",[users[0]]); await expectDenied(()=>onboard());
});
test('password and OTP sessions with a linked Google identity are rejected',async()=>{
  for(const method of ['password','otp','magiclink','anonymous']) await expectDenied(()=>onboard(0,{amr:[{method}]}));
});
test('missing or malformed session and OAuth method fail closed',async()=>{
  for(const extra of [{session_id:null},{session_id:'invalid'},{amr:null},{amr:[]},{amr:{method:'oauth'}}]) await expectDenied(()=>onboard(0,extra));
});
test('a valid session belonging to another account cannot authorize the caller',async()=>{await expectDenied(()=>onboard(0,{session_id:sessions[1]}));});
test('deleted and expired sessions deny access despite an unchanged JWT',async()=>{
  await onboard(); await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[sessions[0]]);
  await expectDenied(()=>call('bemo_get_profile'));
  await db.query('delete from auth.sessions where id=$1',[sessions[0]]); await expectDenied(()=>call('bemo_get_profile'));
});
test('unconfirmed, anonymous, banned and deleted auth users cannot onboard',async()=>{
  for(const field of ["email_confirmed_at=null","is_anonymous=true","banned_until=now()+interval '1 day'","deleted_at=now()"]){
    await db.query('update auth.users set '+field+' where id=$1',[users[0]]); await expectDenied(()=>onboard());
    await db.query('update auth.users set email_confirmed_at=now(),is_anonymous=false,banned_until=null,deleted_at=null where id=$1',[users[0]]);
  }
});
test('two accounts read and edit only their own profile',async()=>{
  const a=await onboard(0); const b=await onboard(1); assert.notEqual(a.id,b.id);
  await call('bemo_update_profile',['اسم جديد','en'],1);
  assert.equal((await call('bemo_get_profile',[],0)).id,a.id);
  assert.equal((await call('bemo_get_profile',[],1)).display_name,'اسم جديد');
  assert.equal((await call('bemo_get_profile',[],0)).display_name,a.display_name);
});
test('profile edits validate names and locale',async()=>{
  await onboard(); for(const args of [['','ar'],['x'.repeat(201),'ar'],['Buyer','invalid'],[null,'ar']]) await expectDenied(()=>call('bemo_update_profile',args));
});
test('editable metadata cannot grant administrative roles',async()=>{
  await onboard(0,{user_metadata:{role:'superadmin',status:'ACTIVE'}});
  assert.equal((await db.query('select count(*)::int as n from bemo_private.user_roles')).rows[0].n,0);
  await expectDenied(()=>asRole('authenticated',claims(),"insert into bemo_private.user_roles default values"));
});
test('one store activates immediately and a second store is rejected',async()=>{
  await onboard(); const s=await createStore(); assert.equal(s.status,'ACTIVE');
  await expectDenied(()=>createStore(0,'Second Store','second-store'));
  assert.equal((await db.query('select count(*)::int as n from bemo_private.stores')).rows[0].n,1);
});
test('store owner is derived from the caller and the other account has no store',async()=>{
  await onboard(0); await onboard(1); const s=await createStore(0);
  assert.equal((await call('bemo_get_my_store',[],0)).id,s.id); assert.equal(await call('bemo_get_my_store',[],1),null);
});
test('slug and normalized title uniqueness apply across accounts',async()=>{
  await onboard(0); await onboard(1); await createStore(0,'Good Finds','good-finds');
  await expectDenied(()=>createStore(1,'Other title','good-finds'));
  await expectDenied(()=>createStore(1,' good finds ','another-slug'));
});
test('reserved and invalid slugs cannot be registered',async()=>{
  await onboard(); for(const slug of ['admin','api','../escape','with space','x'.repeat(101),'']) await expectDenied(()=>createStore(0,'Title '+slug,slug));
});
test('public directory exposes only permitted store fields and no owner contact',async()=>{
  await onboard(); const s=await createStore(); const rows=await directory(); assert.equal(rows.length,1); assert.equal(rows[0].id,s.id);
  assert.deepEqual(Object.keys(rows[0]).sort(),['id','slug','title','description','created_at'].sort());
  assert.ok(!JSON.stringify(rows).includes('@gmail.com'));
});
test('closed stores disappear and their slug and owner slots stay reserved',async()=>{
  await onboard(0); await onboard(1); await createStore(0);
  await db.exec("update bemo_private.stores set status='CLOSED'"); assert.equal((await directory()).length,0);
  await expectDenied(()=>createStore(0,'Reopened','new-slug')); await expectDenied(()=>createStore(1,'Copy','good-finds'));
});
test('suspended users lose profile/store access and public visibility immediately',async()=>{
  await onboard(); await createStore(); await db.exec("update bemo_private.app_users set status='SUSPENDED'");
  await expectDenied(()=>call('bemo_get_profile')); await expectDenied(()=>call('bemo_update_profile',['Name','ar']));
  await expectDenied(()=>call('bemo_get_my_store')); await expectDenied(()=>createStore(0,'Another','another'));
  assert.equal((await directory()).length,0); await expectDenied(()=>onboard());
});
test('direct private-table access is denied for visitors and authenticated accounts',async()=>{
  await onboard(); for(const role of ['anon','authenticated']){
    for(const table of ['app_users','stores','user_roles','audit_events']) await expectDenied(()=>asRole(role,role==='anon'?{}:claims(),'select * from bemo_private.'+table));
    await expectDenied(()=>asRole(role,role==='anon'?{}:claims(),"update bemo_private.app_users set status='ACTIVE'"));
    await expectDenied(()=>asRole(role,role==='anon'?{}:claims(),'delete from bemo_private.stores'));
  }
});
test('all private tables have RLS and no browser-role table privileges',async()=>{
  const rows=(await db.query("select c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_grant,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as user_grant from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='bemo_private' and c.relkind='r'")).rows;
  assert.ok(rows.length>=4); for(const row of rows){assert.equal(row.relrowsecurity,true,row.relname);assert.equal(row.anon_grant,false,row.relname);assert.equal(row.user_grant,false,row.relname);}
});
test('privileged functions have an empty search path and no PUBLIC execute grants',async()=>{
  const rows=(await db.query("select p.proname,p.proconfig,exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='bemo_private' and p.prosecdef")).rows;
  assert.ok(rows.length>0); for(const row of rows){assert.ok(row.proconfig?.includes('search_path=\"\"')||row.proconfig?.includes('search_path='),row.proname);assert.equal(row.public_exec,false,row.proname);}
});
test('onboarding retries preserve the owner profile choices and create one audit event',async()=>{
  const a=await onboard(); await call('bemo_update_profile',['Chosen name','en']); await onboard();
  const b=await call('bemo_get_profile'); assert.equal(b.id,a.id); assert.equal(b.display_name,'Chosen name'); assert.equal(b.locale,'en');
  assert.equal((await db.query("select count(*)::int as n from bemo_private.audit_events where action='PROFILE_CREATED'")).rows[0].n,1);
});
test('an exact create-store retry returns the original store with one audit event',async()=>{
  await onboard(); const a=await createStore(); const b=await createStore(); assert.equal(a.id,b.id);
  assert.equal((await db.query("select count(*)::int as n from bemo_private.audit_events where action='STORE_CREATED'")).rows[0].n,1);
});
test('failed writes leave no partial store or audit record',async()=>{
  await onboard(); await expectDenied(()=>createStore(0,'Shop','admin'));
  assert.equal((await db.query('select count(*)::int as n from bemo_private.stores')).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int as n from bemo_private.audit_events where action='STORE_CREATED'")).rows[0].n,0);
});
test('directory pagination is bounded and search text is literal',async()=>{
  await onboard(0); await onboard(1); await createStore(0,'Alpha Store','alpha-store'); await createStore(1,'Beta Store','beta-store');
  const query=args=>asRole('anon',{},'select * from public.bemo_list_stores($1,$2,$3)',args);
  assert.equal((await query(['ALPHA',24,0])).length,1); assert.equal((await query(['%',24,0])).length,0);
  const first=await query(['',1,0]);const second=await query(['',1,1]);assert.notEqual(first[0].id,second[0].id);
  for(const args of [['',101,0],['',1,-1],['x'.repeat(121),24,0],['',null,0]]) await expectDenied(()=>query(args));
});
test('auth bans and deletion remove public stores without a frontend cache decision',async()=>{
  await onboard(); await createStore();
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[users[0]]); assert.equal((await directory()).length,0);
  await db.query('update auth.users set banned_until=null,deleted_at=now() where id=$1',[users[0]]); assert.equal((await directory()).length,0);
});
test('authenticated callers cannot invoke internal guard helpers or audit utilities directly',async()=>{
  await onboard(); for(const sql of ['select * from bemo_private.trusted_identity()','select bemo_private.require_actor()']) await expectDenied(()=>asRole('authenticated',claims(),sql));
  await expectDenied(()=>asRole('authenticated',claims(),"delete from bemo_private.audit_events"));
});

async function enableCommission(){await db.exec("insert into bemo_private.commission_settings(singleton,enabled) values(true,true) on conflict(singleton) do update set enabled=true");}
async function adminFixture(){await onboard(2);await db.query("insert into bemo_private.user_roles(user_id,role) select id,'superadmin' from bemo_private.app_users where auth_subject=$1 on conflict do nothing",[users[2]]);}
test('seller cancellation: post-acceptance goes to support; combined balance decision is atomic',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();await enableCommission();let o=(await ordered(v)).suborders[0];await creditFixture(o.store_id);o=await action(o,'ACCEPT');await assert.rejects(()=>action(o,'REJECT',0,'Seller changed mind after acceptance'),/TRANSITION_INVALID/);o=await action(o,'REQUEST_CANCEL',0,'Seller requests cancellation for review');const c=(await cases())[0];const work=await call('bemo_support_case',[c.id,true],2);assert.equal(work.commission_hold.state,'HELD');const args=[c.id,'APPROVE_CANCEL','Support approved cancellation and release',false,o.version,true];await call('bemo_support_decision_with_hold',args,2);await call('bemo_support_decision_with_hold',args,2);assert.equal((await call('bemo_balance_workspace')).balances[0].available_minor,100000);assert.equal(await stockOf(v),8);
});
test('finance admin: credit/decrease are audited, idempotent, isolated and cannot spend reserved funds',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await adminFixture();const o=(await ordered(v)).suborders[0],sid=o.store_id;
 const credit=[sid,'CREDIT',{amount_minor:20000,currency:'IQD',reference:'bank-fixture-1'},'Manually reconciled synthetic bank transfer',randomUUID()];
 await expectDenied(()=>call('bemo_finance_admin_action',credit));await call('bemo_finance_admin_action',credit,2);await call('bemo_finance_admin_action',credit,2);assert.equal((await call('bemo_balance_workspace')).balances[0].available_minor,20000);
 await assert.rejects(()=>call('bemo_finance_admin_action',[sid,'ADJUST_DOWN',{amount_minor:30000,currency:'IQD',reference:'adjust-1'},credit[3],randomUUID()],2),/BALANCE_INSUFFICIENT/);
 await call('bemo_finance_admin_action',[sid,'ADJUST_DOWN',{amount_minor:1000,currency:'IQD',reference:'adjust-2'},credit[3],randomUUID()],2);assert.equal((await call('bemo_finance_admin_workspace',[sid],2)).balances[0].available_minor,19000);
 await expectDenied(()=>call('bemo_finance_admin_workspace',[sid],1));assert.equal((await db.query('select count(*)::int n from bemo_private.balance_admin_log')).rows[0].n,2);
});
test('finance admin: frozen balance blocks new holds, bank data is versioned and card secrets rejected',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await adminFixture();await enableCommission();let o=(await ordered(v)).suborders[0];await creditFixture(o.store_id);const act=(action,payload={})=>call('bemo_finance_admin_action',[o.store_id,action,payload,'Administrative fixture reason for testing',randomUUID()],2);
 await act('FREEZE');await assert.rejects(()=>action(o,'ACCEPT'),/BALANCE_FROZEN/);assert.equal(await stockOf(v),10);await act('UNFREEZE');
 const account=(await call('bemo_finance_admin_workspace',[o.store_id],2)).account;
 await act('BANK',{bank_name:'Test bank',beneficiary:'Synthetic merchant',account_number:'TEST123',iban:'',card_last4:'1234',notes:'Local fixture only',version:account.version});
 assert.equal((await call('bemo_balance_workspace')).bank.card_last4,'1234');await assert.rejects(()=>act('BANK',{version:account.version,cvv:'123'}),/FINANCE_INVALID/);
 o=await action(o,'ACCEPT');await act('PAUSE');assert.equal((await call('bemo_balance_workspace')).enabled,false);assert.equal((await call('bemo_balance_workspace')).balances[0].reserved_minor,15000);
});
async function creditFixture(store,amount=100000){await db.query("insert into bemo_private.balance_ledger(store_id,currency,kind,available_delta,reserved_delta,reference,reason) values($1,'IQD','CREDIT',$2,0,$3,'Synthetic approved credit')",[store,amount,randomUUID()]);}
test('privacy: list, rejection and failed acceptance never disclose any delivery field',async()=>{
 const {v}=await stockedMerchant();await onboard(1);let o=(await ordered(v)).suborders[0];
 for(const value of [await call('bemo_get_order',[o.id]),...(await call('bemo_list_orders',['seller']))])for(const secret of Object.values(deliveryFixture))if(secret)assert.ok(!JSON.stringify(value).includes(secret));
 o=await action(o,'REJECT',0,'Seller cannot fulfil this order');const rejected=await call('bemo_get_order',[o.id]);assert.equal(rejected.delivery,null);assert.equal(rejected.country,null);
});
test('commission: disabled default allows acceptance with no funds or ledger changes',async()=>{
 const {v}=await stockedMerchant();await onboard(1);const o=(await ordered(v)).suborders[0];await action(o,'ACCEPT');const b=await call('bemo_balance_workspace');assert.equal(b.enabled,false);assert.equal(b.basis_points,500);assert.equal(b.transactions.length,0);
});
test('commission: insufficient funds rolls back stock, state and disclosure atomically',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await enableCommission();const o=(await ordered(v)).suborders[0];await assert.rejects(()=>action(o,'ACCEPT'),/BALANCE_INSUFFICIENT/);assert.equal(await stockOf(v),10);const read=await call('bemo_get_order',[o.id]);assert.equal(read.state,'PENDING_SELLER');assert.equal(read.delivery,null);assert.equal((await call('bemo_balance_workspace')).transactions.length,0);
});
test('commission: reserve excludes delivery, is once-only, and captures on delivery even when disabled later',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await enableCommission();let o=(await ordered(v)).suborders[0];await creditFixture(o.store_id);const key=randomUUID();let accepted=await call('bemo_order_action',[o.id,'ACCEPT','',o.version,key]);await call('bemo_order_action',[o.id,'ACCEPT','',o.version,key]);let b=await call('bemo_balance_workspace');assert.equal(b.balances[0].available_minor,85000);assert.equal(b.balances[0].reserved_minor,15000);assert.equal(b.transactions.filter(x=>x.kind==='RESERVE').length,1);await db.exec('update bemo_private.commission_settings set enabled=false');accepted=await action(accepted,'SHIP');await action(accepted,'DELIVER');b=await call('bemo_balance_workspace');assert.equal(b.balances[0].reserved_minor,0);assert.equal(b.balances[0].available_minor,85000);
});
test('commission: assigned support decides release independently from stock, retries cannot reverse decision',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await support();await enableCommission();let o=(await ordered(v)).suborders[0];await creditFixture(o.store_id);o=await action(o,'ACCEPT');o=await action(o,'REQUEST_CANCEL',1,'Please review cancellation after acceptance');const c=(await cases())[0];await call('bemo_support_case',[c.id,true],2);await decide(c,o,'APPROVE_CANCEL',false);assert.equal((await call('bemo_balance_workspace')).balances[0].reserved_minor,15000);const args=[c.id,true,'Support approves commission release independently'];await expectDenied(()=>call('bemo_resolve_commission_hold',args,1));await call('bemo_resolve_commission_hold',args,2);await call('bemo_resolve_commission_hold',args,2);assert.equal(await stockOf(v),8);const b=await call('bemo_balance_workspace');assert.equal(b.balances[0].available_minor,100000);assert.equal(b.balances[0].reserved_minor,0);await assert.rejects(()=>call('bemo_resolve_commission_hold',[c.id,false,args[2]],2),/REQUEST_CONFLICT/);
});
test('commission: rule changes require admin and version, snapshot protects existing orders and product override wins',async()=>{
 const {v}=await stockedMerchant();await onboard(1);await onboard(2);const args=[null,700,0,null,1,'Approved test global rate change'];await expectDenied(()=>call('bemo_save_commission_rule',args));await db.query("insert into bemo_private.user_roles(user_id,role) select id,'superadmin' from bemo_private.app_users where auth_subject=$1",[users[2]]);let o=(await ordered(v)).suborders[0];await call('bemo_save_commission_rule',args,2);await assert.rejects(()=>call('bemo_save_commission_rule',args,2),/VERSION_CONFLICT/);assert.equal((await db.query('select sum(amount_minor)::int n from bemo_private.order_commission_quotes')).rows[0].n,15000);const product=o.items[0].product_id;await call('bemo_save_commission_rule',[product,0,200,'IQD',0,'Free promotional fee override test'],2);const next=(await ordered(v)).suborders[0];assert.equal((await db.query('select sum(q.amount_minor)::int n from bemo_private.order_commission_quotes q join bemo_private.order_lines l on l.id=q.line_id where l.suborder_id=$1',[next.id])).rows[0].n,400);await creditFixture(o.store_id);assert.equal((await call('bemo_balance_workspace',[],1).catch(()=>({transactions:[]}))).transactions.length,0);await assert.rejects(()=>db.exec("update bemo_private.balance_ledger set reason='tamper'"),/LEDGER_IMMUTABLE/);
});


test('checkout charges each destination once, binds the address, and rechecks fee changes',async()=>{
 const a=await stockedMerchant(0),b=await stockedMerchant(1);
 await onboard(2);
 const rule={country:'IQ',region:'baghdad',label:'Baghdad',fee_minor:450,min_days:1,max_days:2};
 await call('bemo_save_delivery_regions',[[rule],0]);
 const cart=[{variant_id:a.v.id,quantity:2},{variant_id:b.v.id,quantity:1}];
 const quote=()=>call('bemo_quote_cart',[cart],2);
 await assert.rejects(quote,/DESTINATION_REQUIRED/);
 Object.assign(cart[0],{country:'IQ',region:'Basra'});
 await assert.rejects(quote,/DELIVERY_UNAVAILABLE/);
 cart[0].region='Baghdad';
 const q=await quote(),shop=q.snapshot.stores.find(s=>s.store_id===a.p.store_id);
 assert.equal(shop.delivery_fee_minor,450);
 assert.equal(shop.max_days,2);
 const place=(id,region)=>call('bemo_place_order',[id,{...deliveryFixture,country:'IQ',region},randomUUID()],2);
 await assert.rejects(()=>place(q.id,'Basra'),/DESTINATION_CHANGED/);
 await call('bemo_save_delivery_regions',[[{...rule,fee_minor:650}],1]);
 await assert.rejects(()=>place(q.id,'Baghdad'),/QUOTE_CHANGED/);
 const fresh=await quote(),order=await place(fresh.id,'Baghdad');
 assert.equal(order.total_minor,fresh.snapshot.total_minor);
 assert.equal(order.suborders.find(s=>s.store_id===a.p.store_id).delivery_fee_minor,650);
});

test('admin console enforces roles, handles moderation and sends notifications once',async()=>{
 const {p}=await stockedMerchant();await onboard(1);await adminFixture();
 const directory=(section,i=2)=>call('bemo_console',[section,'',0],i);
 await assert.rejects(()=>directory('accounts',1),/ADMIN_REQUIRED/);
 const op=(action,id,key=randomUUID())=>call('bemo_console_action',[action,id,'Console test message',key],2);
 const account=(await directory('accounts')).rows.find(x=>x.related);
 await op('product_suspend',p.id);assert.equal((await directory('products')).rows[0].status,'SUSPENDED');
 await op('product_restore',p.id);await op('verify',p.store_id);assert.equal((await directory('stores')).rows[0].related,'APPROVED');
 await op('reject',p.store_id);await op('store_suspend',p.store_id);await op('store_restore',p.store_id);
 const key=randomUUID();await op('notify',account.id,key);await op('notify',account.id,key);
 assert.equal((await call('bemo_notifications')).filter(x=>x.body==='Console test message').length,1);
 await op('broadcast',null);await op('account_suspend',account.id);await op('account_restore',account.id);
 assert.equal((await directory('log')).rows.length,10);
});

test('store branding publication is owner-scoped and atomic with profile edits',async()=>{
 await onboard();await createStore();const shop=await call('bemo_store_workspace');
 const args=['Updated shop','Description','','',shop.profile_version];
 await assert.rejects(()=>call('bemo_publish_store_profile',[...args,{cover:'foreign/path.png'}]),/MEDIA_INVALID/);
 const next=await call('bemo_publish_store_profile',[...args,{logo:null}]);
 assert.equal(next.title,'Updated shop');assert.equal(next.logo_path,null);
 await assert.rejects(()=>call('bemo_publish_store_profile',[...args,{}]),/VERSION_CONFLICT/);
});

test('detailed listing creates a priced option and initial stock atomically',async()=>{
 await stockedMerchant();
 const id=randomUUID(),vid=randomUUID(),details={title:'Classic shoes',description:'Black lace-up shoes with a polished finish.',category:'fashion',sku:'SHOE-001',price:25000000,former:30000000,offer:'Weekend'};
 const args=[id,vid,details,3];
 await call('bemo_save_listing',args);await call('bemo_save_listing',args);
 const row=(await db.query('select v.former_minor,v.offer_title,s.stock_on_hand from bemo_private.product_variants v join bemo_private.stock_positions s on s.variant_id=v.id where v.id=$1',[vid])).rows[0];
 assert.equal(Number(row.former_minor),30000000);assert.equal(row.offer_title,'Weekend');assert.equal(row.stock_on_hand,3);
 await assert.rejects(()=>call('bemo_save_listing',[randomUUID(),randomUUID(),{...details,former:100},1]),/VARIANT_INVALID/);
});
