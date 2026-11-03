import assert from 'node:assert/strict';
// Read only the project URL and PUBLIC publishable key from stdin. Never pass
// service_role, secret keys or user sessions. No account or business data writes.
process.stdin.setRawMode?.(true);
const input=await new Promise((resolve,reject)=>{
  let buffer=''; process.stdin.setEncoding('utf8');
  const receive=chunk=>{
    if(chunk.includes('\u0003')) {process.exit(130);}
    buffer+=chunk;
    if(/[\r\n]/.test(buffer)) {process.stdin.off('data',receive);process.stdin.setRawMode?.(false);process.stdin.pause();resolve(buffer.trim());}
  };
  process.stdin.on('data',receive);process.stdin.on('error',reject);process.stdin.resume();
});
const {url,key}=JSON.parse(input);
assert.equal(new URL(url).protocol,'https:');
assert.ok(key.startsWith('sb_publishable_'),'Use a modern public publishable key');
const results=[];
async function check(name,path,body,allowed,extraHeaders={}){
  const response=await fetch(url+'/rest/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,'Content-Type':'application/json',...extraHeaders},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json();
  assert.ok(allowed.includes(response.status),name+': unexpected status '+response.status+' ('+(payload.code??'no code')+')');
  if(name==='public directory') assert.deepEqual(payload,[],'New development directory should be empty');
  if(name.startsWith('protected ')) assert.equal(payload.code,'42501');
  results.push({name,status:response.status,code:payload.code??'OK',pass:true});
}
await check('public directory','rpc/bemo_list_stores',{},[200]);
await check('protected onboard','rpc/bemo_onboard',{display_name:'Probe',locale:'ar'},[401,403]);
await check('protected get profile','rpc/bemo_get_profile',{},[401,403]);
await check('protected update profile','rpc/bemo_update_profile',{display_name:'Probe',locale:'en'},[401,403]);
await check('protected create store','rpc/bemo_create_store',{title:'Probe',slug:'probe-store',description:''},[401,403]);
await check('protected get my store','rpc/bemo_get_my_store',{},[401,403]);
await check('private schema is unexposed','rpc/list_stores',{},[406],{'Content-Profile':'bemo_private'});
await check('private table has no public route','app_users?select=*',undefined,[404]);
await check('forged session is rejected','rpc/bemo_get_profile',{},[401],{Authorization:'Bearer invalid.jwt.signature'});
console.log(JSON.stringify({project_url:url,checks:results,passed:results.length,scope:'Anonymous HTTP and forged-session denial only; no Google OAuth or authenticated-user proof.'},null,2));
