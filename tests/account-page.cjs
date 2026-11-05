const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist');
const clone = value => JSON.parse(JSON.stringify(value));
const ready = (email = 'owner@gmail.com', id = 'profile-one') => ({phase:'ready',busy:false,provider:'ready',identity:{email},profile:{id,email,display_name:'Owner',locale:'ar',status:'ACTIVE'},store:null,error:null});
const guest = {phase:'guest',busy:false,provider:'disabled',identity:null,profile:null,store:null,error:null};
function boot(initial = guest, callback = false, apiPresent = true, hash = '') {
  const nodes = new Map(), forms = [], storage = new Map(), navigation = [], html = fs.readFileSync(path.join(root, callback ? 'auth-callback.html' : 'account.html'), 'utf8');
  let focused, current = clone(initial), subscriber, actions = {}, callbackCalls = 0;
  function element(id) {
    const node = {id,textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,dataset:{},listeners:{},attributes:{},parent:null,
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(key, value) { this.attributes[key] = value; },
      setCustomValidity(value) { this.validityMessage = value; },
      focus() { focused = id; }, scrollIntoView() { this.scrolled = true; },
      closest(selector) { if (selector !== '[hidden]') return null; let node = this; while(node) {if(node.hidden)return node;node=node.parent;}return null; },
      querySelector() { return this.heading; }, querySelectorAll() { return []; }};
    nodes.set(id, node); return node;
  }
  for (const id of [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])) element(id);
  if (!callback) {
    nodes.get('pageLoading').heading = element('loadingHeading');
    for (const [formId, names, panel] of [['onboardingForm',{display_name:'onboardingName',locale:'onboardingLocale'},'onboardingPanel'],['profileForm',{display_name:'profileName',locale:'profileLocale'},'profilePanel'],['storeForm',{title:'storeName',slug:'storeSlug',description:'storeDescription'},'storePanel']]) {
      const form = nodes.get(formId), submit = element(formId + 'Submit');
      form.parent = nodes.get(panel); submit.parent = form; form.elements = Object.fromEntries(Object.entries(names).map(([name,id]) => [name,nodes.get(id)]));
      Object.values(form.elements).forEach(input => {input.parent = form;});
      form.querySelector = () => submit;
      form.querySelectorAll = () => [...Object.values(form.elements),submit];
      form.reset = () => {for(const [name,node] of Object.entries(form.elements))node.value = name === 'locale' ? 'ar' : '';};
      form.reportValidity = () => !Object.values(form.elements).some(node => node.validityMessage);
      form.reset(); forms.push(form);
    }
    nodes.get('profileTitle').parent = nodes.get('profilePanel');
    nodes.get('storeTitle').parent = nodes.get('storePanel');
  }
  const api = {
    getState:()=>clone(current), subscribe(fn){subscriber=fn;fn(clone(current));return()=>{};}, initialize:async()=>clone(current),
    refresh:async()=>clone(current), signIn:async()=>clone(current),
    async completeCallback(){callbackCalls++;return actions.completeCallback ? actions.completeCallback() : clone(current);},
    async saveProfile(input){return actions.saveProfile ? actions.saveProfile(input) : clone(current);},
    async createStore(input){return actions.createStore ? actions.createStore(input) : clone(current);},
    async signOut(){return actions.signOut ? actions.signOut() : clone(current);}
  };
  const location = {href:'https://bemo.example/' + (callback ? 'auth-callback.html' : 'account.html') + hash,hash,replace:value=>navigation.push(value)};
  const document = {body:{dataset:{accountView:callback?'callback':'account'}},documentElement:{},getElementById:id=>{assert(nodes.has(id),'Missing required element '+id);return nodes.get(id);},querySelectorAll:selector=>selector === '.account-form input' ? forms.flatMap(form=>Object.values(form.elements)) : []};
  const context = {window:{BemoAccount:apiPresent?api:undefined},document,location,URL,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},history:{replaceState(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'account-page.js'),'utf8'),context,{filename:'account-page.js'});
  return {nodes,document,location,navigation,actions,get focused(){return focused;},get callbackCalls(){return callbackCalls;},emit(next){current=clone(next);subscriber?.(clone(next));},click(id){nodes.get(id).listeners.click?.();},submit(id){const form=nodes.get(id);form.listeners.submit({preventDefault(){},currentTarget:form});}};
}
const settle = () => new Promise(resolve=>setImmediate(resolve));
let count=0;
async function test(name, fn){await fn();console.log('PASS '+name);count++;}
(async()=>{
  await test('Disabled Google provider cannot launch sign-in',()=>{const b=boot();assert.equal(b.nodes.get('googleButton').disabled,true);assert.equal(b.nodes.get('signInPanel').hidden,false);assert.equal(b.nodes.get('profilePanel').hidden,true);});
  await test('Account-owned content is rendered as text',()=>{const s=ready();s.store={title:'<img src=x onerror=alert(1)>',slug:'safe-store',description:'<script>private</script>',status:'ACTIVE'};const b=boot(s);assert.equal(b.nodes.get('savedStoreName').textContent,s.store.title);assert.equal(b.nodes.get('savedStoreName').innerHTML,'');assert.equal(b.nodes.get('savedStoreDescription').innerHTML,'');});
  await test('Cleared engine identity removes hidden private form and display values',()=>{const s=ready();s.store={title:'Private store',slug:'private-store',description:'Private description',status:'ACTIVE'};const b=boot(s);b.nodes.get('storeName').value='Private draft';b.emit({...guest,phase:'error',error:{code:'NETWORK_ERROR',retryable:true}});for(const id of ['profileName','storeName','storeDescription','onboardingName'])assert.equal(b.nodes.get(id).value,'');for(const id of ['profileEmail','savedStoreName','savedStoreSlug','savedStoreDescription','savedStoreStatus'])assert.equal(b.nodes.get(id).textContent,'');assert.equal(b.nodes.get('profilePanel').hidden,true);});
  await test('Identity changes replace profile values and discard previous drafts',()=>{const b=boot(ready());b.nodes.get('storeName').value='Old account draft';const next=ready('second@gmail.com','profile-two');next.profile.display_name='Second owner';b.emit(next);assert.equal(b.nodes.get('profileName').value,'Second owner');assert.equal(b.nodes.get('profileEmail').textContent,'second@gmail.com');assert.equal(b.nodes.get('storeName').value,'');});
  await test('Recoverable validation errors retain the current account draft',async()=>{const s=ready(),b=boot(s);b.nodes.get('profileName').value='Unsaved draft';b.actions.saveProfile=async()=>({...s,error:{code:'PROFILE_INVALID',retryable:false}});b.submit('profileForm');await settle();assert.equal(b.nodes.get('profileName').value,'Unsaved draft');assert.equal(b.nodes.get('pageMessage').hidden,true);assert.equal(b.focused,'pageError');});
  await test('A stale store completion cannot announce success for another identity',async()=>{const b=boot(ready());b.nodes.get('storeName').value='My store';b.nodes.get('storeSlug').value='my-store';const next=ready('second@gmail.com','profile-two');next.store={title:'My store',slug:'my-store',description:'',status:'ACTIVE'};b.actions.createStore=async()=>{b.emit(next);return next;};b.submit('storeForm');await settle();assert.equal(b.nodes.get('pageMessage').hidden,true);assert.equal(b.nodes.get('pageError').hidden,false);assert.equal(b.nodes.get('profileEmail').textContent,'second@gmail.com');});
  await test('Confirmed store creation displays returned data and moves keyboard focus',async()=>{const s=ready(),b=boot(s);b.nodes.get('storeName').value='My store';b.nodes.get('storeSlug').value='my-store';b.actions.createStore=async input=>({...s,store:{...input,status:'ACTIVE'}});b.submit('storeForm');await settle();assert.equal(b.nodes.get('pageMessage').hidden,false);assert.equal(b.nodes.get('savedStoreName').textContent,'My store');assert.equal(b.nodes.get('newStoreArea').hidden,true);assert.equal(b.focused,'storeTitle');});
  await test('Sign-out clears private data and reports success only after guest state',async()=>{const b=boot(ready());b.actions.signOut=async()=>{b.emit({...guest,phase:'loading',busy:true});b.emit(guest);return guest;};b.click('signOutButton');await settle();assert.equal(b.nodes.get('profileName').value,'');assert.equal(b.nodes.get('pageMessage').hidden,false);assert.equal(b.nodes.get('profilePanel').hidden,true);});
  await test('Seller destination focuses its section after verified account load',()=>{const b=boot(ready(),false,true,'#store');assert.equal(b.nodes.get('storePanel').scrolled,true);assert.equal(b.focused,'storeTitle');});
  await test('Callback redirects only after account verification succeeds',async()=>{const b=boot(ready(),true);await settle();assert.equal(b.callbackCalls,1);assert.deepEqual(b.navigation,['account.html?lang=ar']);});
  await test('Callback errors remain local and expose only a fixed friendly message',async()=>{const b=boot({...guest,phase:'error',error:{code:'CALLBACK_DENIED',message:'private raw error'}},true);await settle();assert.deepEqual(b.navigation,[]);assert.equal(b.nodes.get('callbackReturn').hidden,false);assert(!b.nodes.get('callbackError').textContent.includes('private raw error'));assert.equal(b.focused,'callbackError');});
  await test('Missing account engine shows recovery copy without enabling Google',()=>{const b=boot(guest,false,false);assert.equal(b.nodes.get('googleButton').disabled,true);assert.equal(b.nodes.get('pageError').hidden,false);assert.equal(b.nodes.get('providerRetry').hidden,true);});
  console.log(`${count} account UI boundary checks passed. DOM stubs verify state and privacy; they do not replace browser layout or real OAuth tests.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
