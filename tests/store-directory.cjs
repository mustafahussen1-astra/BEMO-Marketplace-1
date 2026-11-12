const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../dist/store-directory.js'),'utf8');
const pageSource = fs.readFileSync(path.join(__dirname,'../dist/stores-page.js'),'utf8');
const clean = x => JSON.parse(JSON.stringify(x));
const row = i => ({id:'00000000-0000-0000-0000-' + String(i).padStart(12,'0'),slug:'shop-' + i,title:'Store ' + i,description:'A store'});
function provider(reply) {
  const calls=[];
  const window={BEMO_BACKEND:{url:'https://project.supabase.co',publishableKey:'sb_publishable_test'}};
  vm.runInNewContext(source,{window,URL,fetch:async (...args)=>{calls.push(args);return typeof reply==='function'?reply():{ok:true,json:async()=>reply};}});
  return {api:window.BemoDirectory,calls};
}
const tests=[]; const test=(name,run)=>tests.push({name,run});
test('public read never sends user credentials and requests only the approved RPC',async()=>{
  const p=provider([row(1)]);const result=await p.api.list({search:'مصطفى',page:2});
  const [url,request]=p.calls[0];assert.equal(url,'https://project.supabase.co/rest/v1/rpc/bemo_list_stores');
  assert.equal(request.credentials,'omit');assert.equal(request.headers.Authorization,undefined);
  assert.deepEqual(JSON.parse(request.body),{search_text:'مصطفى',limit_count:13,offset_count:12});assert.equal(result.stores.length,1);
});
test('ignores future private fields in responses',async()=>{
  const p=provider([{...row(1),email:'private@example.com',owner_user_id:'private',access_token:'private'}]);
  assert.deepEqual(Object.keys((await p.api.list({})).stores[0]).sort(),['description','id','slug','title']);
});
test('lookahead avoids invented counts and next page on exact end',async()=>{
  const p=provider(Array.from({length:13},(_,i)=>row(i)));const r=await p.api.list({page:1});
  assert.equal(r.stores.length,12);assert.equal(r.hasNext,true);
  assert.equal((await provider(Array.from({length:12},(_,i)=>row(i))).api.list({})).hasNext,false);
});
test('server pagination bound prevents offsets above 10000',async()=>{
  const p=provider(Array.from({length:13},(_,i)=>row(i)));
  assert.equal((await p.api.list({page:834})).hasNext,false);
  for(const page of [0,-1,1.1,835,'NaN']) await assert.rejects(p.api.list({page}),/QUERY_INVALID/);
});
test('search treats SQL and markup as literal text',async()=>{
  const p=provider([]);const search="%_' <script>alert(1)</script>";await p.api.list({search});
  assert.equal(JSON.parse(p.calls[0][1].body).search_text,search);
  await assert.rejects(p.api.list({search:'a'.repeat(121)}),/QUERY_INVALID/);
});
test('malformed or failed responses never become empty success',async()=>{
  for(const value of [null,{error:'no'},[{}],[{...row(1),slug:'<bad>'}],Array(14).fill(row(1))]) await assert.rejects(provider(value).api.list({}),/RESPONSE_INVALID/);
  await assert.rejects(provider(()=>({ok:false})).api.list({}),/DIRECTORY_UNAVAILABLE/);
});
test('abort signal remains connected through network read',async()=>{
  const controller=new AbortController();const p=provider([]);await p.api.list({},controller.signal);
  assert.equal(p.calls[0][1].signal,controller.signal);
});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function page(){
  const nodes=new Map(), timers=new Map(), jobs=[];let timerId=0;
  function element(){return {dataset:{},children:[],hidden:false,value:'',attrs:{},events:{},textContent:'',append(...x){this.children.push(...x)},replaceChildren(...x){this.children=[...x]},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this.events[k]=v},setCustomValidity(v){this.validity=v},reportValidity(){},emit(k){return this.events[k]?.({preventDefault(){}})}};}
  function get(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)}
  const document={getElementById:get,documentElement:{},querySelectorAll:()=>[],querySelector:get,createElement:element};
  const location={href:'https://site.example/stores?lang=ar',pathname:'/stores'};
  const history={pushState(_,__,url){location.href='https://site.example'+url},replaceState(_,__,url){location.href='https://site.example'+url}};
  const api=provider([]).api;
  const window={BemoDirectory:{query:api.query,list(input,signal){const job=deferred();jobs.push({...job,input:clean(input),signal});return job.promise}},addEventListener(){}};
  vm.runInNewContext(pageSource,{window,document,location,history,URL,URLSearchParams,AbortController,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)});
  return {get,jobs,timers,location};
}
const drain=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
test('latest search wins when older response arrives last',async()=>{
  const p=page();p.get('storeQuery').value='new';p.get('directorySearch').emit('submit');
  assert.equal(p.jobs[0].signal.aborted,true);
  p.jobs[1].resolve({stores:[row(2)],hasNext:false});await drain();
  p.jobs[0].resolve({stores:[row(1)],hasNext:true});await drain();
  assert.equal(p.get('directoryResults').children[0].children[1].children[0].textContent,'Store 2');
  assert.equal(p.get('directoryError').hidden,true);
});
test('late failure does not hide current results; markup is text',async()=>{
  const p=page();p.get('storeQuery').value='new';p.get('directorySearch').emit('submit');
  p.jobs[1].resolve({stores:[{...row(2),title:'<img onerror=bad()>',description:'<script>bad()</script>'}],hasNext:false});await drain();
  p.jobs[0].reject(new Error('offline'));await drain();
  assert.equal(p.get('directoryResults').children[0].children[1].children[0].textContent,'<img onerror=bad()>');
  assert.equal(p.get('directoryError').hidden,true);
});
test('offline results clear and retry recovers without fake listings',async()=>{
  const p=page();p.jobs[0].reject(new Error('offline'));await drain();
  assert.equal(p.get('directoryError').hidden,false);assert.equal(p.get('directoryResults').children.length,0);
  p.get('directoryRetry').emit('click');p.jobs[1].resolve({stores:[],hasNext:false});await drain();
  assert.equal(p.get('directoryError').hidden,true);assert.equal(p.get('directoryEmpty').hidden,false);
});
(async()=>{for(const t of tests){await t.run();console.log('PASS '+t.name)}console.log(tests.length+' directory tests passed')})().catch(e=>{console.error(e);process.exitCode=1});
