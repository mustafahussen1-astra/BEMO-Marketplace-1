import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// A real embedded PostgreSQL engine. The auth schema/claims below are fixtures,
// NOT live Supabase Auth, JWT signature verification, OAuth, or concurrency tests.
const users = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const sessions = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
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
const createStore=(i=0,title='متجر جميل',slug='good-finds')=>call('bemo_create_store',[title,slug,'Physical goods'],i);
const directory=()=>asRole('anon',{},'select * from public.bemo_list_stores()');
const expectDenied=async action=>{ await assert.rejects(action); };

before(async()=>{
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
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
  const tables=await db.query("select quote_ident(schemaname)||'.'||quote_ident(tablename) as name from pg_tables where schemaname='bemo_private' and tablename<>'reserved_store_slugs'");
  if(tables.rows.length) await db.exec('truncate '+tables.rows.map(x=>x.name).join(',')+' restart identity cascade');
  await db.exec('truncate auth.users cascade');
  for(let i=0;i<2;i++){
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[users[i],`buyer${i}@gmail.com`]);
    await db.query('insert into auth.identities values($1,$2,$3)',[users[i],'google',{email:`buyer${i}@gmail.com`,email_verified:true}]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[i],users[i]]);
  }
});
after(async()=>{await db?.close();});

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
