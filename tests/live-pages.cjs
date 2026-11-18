const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),test=require('node:test');
const settle=async()=>{for(let i=0;i<70;i++)await Promise.resolve();},clone=x=>JSON.parse(JSON.stringify(x)),ready={phase:'ready',profile:{id:'buyer-1'}};
const order=()=>({id:'order-1',parent_id:'parent-1',store_title:'Shop',state:'PENDING_SELLER',version:1,currency:'IQD',items_minor:2000,delivery_fee_minor:1000,total_minor:3000,items:[],events:[],delivery:null});
const quote=()=>({id:'quote-1',expires_at:'2030-01-01T00:00:00Z',snapshot:{currency:'IQD',stores:[{store_id:'s',store_title:'Shop',items_minor:2000,delivery_fee_minor:1000}],items:[]}});
function boot(page,initial=ready){const html=fs.readFileSync(__dirname+'/../dist/'+page+'.html','utf8'),src=fs.readFileSync(__dirname+'/../dist/'+page+'-page.js','utf8'),nodes=new Map(),all=[],listeners={},calls=[],hooks={};let subscriber,version=0,uid=0,cart=[{variant_id:'variant-1',quantity:1,title:'Public product'}];
 function element(tag='div'){const n={tag,id:'',value:'',textContent:'',dataset:{},children:[],events:{},hidden:false,disabled:false,checked:false,append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value)this.value=this.children[0]?.value||'';},replaceChildren(...children){this.children=children;if(this.tag==='select')this.value=children[0]?.value||'';},setAttribute(k,v){this[k]=v},addEventListener(k,fn){this.events[k]=fn},focus(){},scrollIntoView(){},reset(){for(const x of all)if(['input','textarea','select'].includes(x.tag)){x.value='';x.checked=false}},emit(k){return this.events[k]?.({preventDefault(){}})}};all.push(n);return n;}
 for(const m of html.matchAll(/<([a-z0-9]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const n=element(m[1]);n.id=m[3];n.hidden=/\bhidden\b/.test(m[2]);nodes.set(n.id,n);}
 const modes=['buyer','seller','notifications','support'].map(mode=>{const n=element('button');n.dataset.mode=mode;return n});
 const get=id=>{assert(nodes.has(id),'Missing DOM node '+id);return nodes.get(id)};
 const heading=element('h1');const document={documentElement:{},querySelector:s=>s==='h1'?heading:null,getElementById:get,createElement:element,querySelectorAll(selector){if(selector==='button')return all.filter(x=>x.tag==='button');if(selector==='[data-mode]')return modes;if(selector.startsWith('#deliveryForm'))return all.filter(x=>['input','textarea'].includes(x.tag)&&!['query'].includes(x.id));return []}};
 async function request(name,args){calls.push({name,args:clone(args||{})});if(hooks.request){const r=await hooks.request(name,args);if(r)return r;}if(name==='bemo_quote_cart')return {data:quote()};if(name==='bemo_get_order')return {data:order()};if(name==='bemo_list_orders')return {data:[order()]};if(name==='bemo_place_order')return {data:{id:'parent-1'}};return {data:[]};}
 const api={subscribe(fn){subscriber=fn;fn(clone(initial))},initialize:async()=>{},orderScope(){const epoch=version;return {request:(...args)=>epoch===version?request(...args):Promise.resolve({error:{code:'SESSION_CHANGED'}})}}};
 const dispatch=type=>listeners[type]?.();const live={categories:['home','other'],cart:()=>clone(cart),clear(){cart=[];dispatch('bemo:cart')},set(id,quantity){cart=quantity?[{variant_id:id,quantity,title:'Public product'}]:[];dispatch('bemo:cart')},money:(v,c)=>v+' '+c,catalog:async()=>({products:[],hasNext:false,page:1})};
 vm.runInNewContext(src,{Event,window:{BemoAccount:api,BemoLive:live,dispatchEvent:e=>dispatch(e.type),addEventListener:(k,fn)=>listeners[k]=fn},document,URL,URLSearchParams,location:{href:'https://site.test/'+page+'.html?lang=ar',pathname:'/'+page+'.html'},history:{replaceState(){}},crypto:{randomUUID:()=>String(++uid)},Intl,Date,AbortController,setTimeout,clearTimeout});
 return {get,all,calls,hooks,modes,live,emit(s){version++;subscriber(clone(s));},fill(){for(const [k,v]of Object.entries({recipient:'Test Buyer',phone:'+9647000000000',country:'Test Country',region:'Test Region',city:'Test City',address:'Synthetic address',note:''}))get(k).value=v;get('confirmQuote').checked=true;}};
}
test('market: guest sees catalog but cannot request a private quote',async()=>{const b=boot('market',{phase:'guest'});await settle();assert.equal(b.calls.length,0);assert.equal(b.get('quoteButton').disabled,true);assert.equal(b.get('products').children.length,1);});
test('market: switching buyer and browse views preserves an uncertain checkout retry',async()=>{const b=boot('market');await settle();await b.get('cartView').emit('click');assert.equal(b.get('catalogSection').hidden,true);assert.equal(b.get('buyerSection').hidden,false);await b.get('quoteButton').emit('click');b.fill();b.hooks.request=name=>name==='bemo_place_order'?{error:{code:'NETWORK_ERROR'}}:undefined;await b.get('deliveryForm').emit('submit');await b.get('browseView').emit('click');assert.equal(b.get('buyerSection').hidden,true);await b.get('cartView').emit('click');assert.equal(b.get('checkout').hidden,false);await b.get('deliveryForm').emit('submit');const writes=b.calls.filter(x=>x.name==='bemo_place_order');assert.deepEqual(writes[0].args,writes[1].args);});
test('market: a cart edit discards an in-flight quote',async()=>{const b=boot('market');await settle();let resolve;b.hooks.request=name=>name==='bemo_quote_cart'?new Promise(r=>resolve=r):undefined;b.get('quoteButton').emit('click');await settle();b.live.set('variant-1',2);resolve({data:quote()});await settle();assert.equal(b.get('checkout').hidden,true);});
test('market: logout clears delivery and prevents late private quote display',async()=>{const b=boot('market');await settle();let resolve;b.hooks.request=name=>name==='bemo_quote_cart'?new Promise(r=>resolve=r):undefined;b.get('quoteButton').emit('click');await settle();b.get('address').value='Private address';b.emit({phase:'guest'});resolve({data:quote()});await settle();assert.equal(b.get('checkout').hidden,true);assert.equal(b.get('address').value,'');});
test('market: ambiguous submission retries same request and original delivery snapshot',async()=>{const b=boot('market');await settle();await b.get('quoteButton').emit('click');b.fill();b.hooks.request=name=>name==='bemo_place_order'?{error:{code:'NETWORK_ERROR'}}:undefined;await b.get('deliveryForm').emit('submit');b.get('recipient').value='Edited after failure';await b.get('deliveryForm').emit('submit');const writes=b.calls.filter(x=>x.name==='bemo_place_order');assert.equal(writes.length,2);assert.equal(writes[0].args.request_id,writes[1].args.request_id);assert.deepEqual(writes[0].args.delivery,writes[1].args.delivery);assert.equal(b.get('quoteButton').disabled,true);});
test('market: changed quote requires a new explicit quote and clears old contact fields',async()=>{const b=boot('market');await settle();await b.get('quoteButton').emit('click');b.fill();b.hooks.request=name=>name==='bemo_place_order'?{error:{code:'QUOTE_CHANGED'}}:undefined;await b.get('deliveryForm').emit('submit');assert.equal(b.get('checkout').hidden,true);assert.equal(b.get('address').value,'');assert.equal(b.get('quoteButton').disabled,false);});
test('orders: guest cannot read orders',async()=>{const b=boot('orders',{phase:'guest'});await settle();assert.equal(b.calls.length,0);assert.equal(b.get('workspace').hidden,true);});
test('orders: late delivery response is discarded after logout',async()=>{const b=boot('orders');await settle();let resolve;b.hooks.request=name=>name==='bemo_get_order'?new Promise(r=>resolve=r):undefined;const button=b.get('rows').children[0].children[1];button.emit('click');await settle();b.emit({phase:'guest'});resolve({data:{...order(),delivery:{recipient:'Private Buyer',phone:'0000000',address:'Private address'}}});await settle();assert.equal(b.get('detail').hidden,true);assert.equal(b.get('detailContent').children.length,0);});
test('orders: forged support entry returns a permission message without case data',async()=>{const b=boot('orders');await settle();b.hooks.request=name=>name==='bemo_support_queue'?{error:{code:'SUPPORT_REQUIRED'}}:undefined;b.modes.find(n=>n.dataset.mode==='support').emit('click');await settle();assert.equal(b.get('error').hidden,false);assert.equal(b.get('detail').hidden,true);});

test('seller sees recorded delivery stages and action-specific fields',async()=>{
 const b=boot('orders');
 await settle();
 b.modes.find(n=>n.dataset.mode==='seller').emit('click');
 await settle();
 b.hooks.request=name=>name==='bemo_get_order'?{data:{...order(),state:'SHIPPED',accepted_at:'2026-11-01',events:[]}}:undefined;
 b.get('rows').children[0].children[1].emit('click');
 await settle();
 const progress=b.get('detailContent').children.find(n=>n.className==='delivery-progress');
 assert.deepEqual(Array.from(progress.children,n=>n.className),['recorded','recorded','unrecorded','recorded','unrecorded','unrecorded']);
 assert.equal(b.get('reason').hidden,true);
 b.get('action').value='FAIL_DELIVERY';
 b.get('action').emit('change');
 assert.equal(b.get('reason').required,true);
 assert.equal(b.get('reason').hidden,false);
 assert.equal(b.get('receiptLabel').hidden,true);
 assert.equal(b.get('refundNote').hidden,true);
});

test('regional quote sends the destination, fills the delivery address and prevents confirming another region',async()=>{
 const b=boot('market');await settle();
 b.get('quoteCountry').value='iq';b.get('quoteRegion').value='Baghdad';
 const q=quote();q.snapshot.destination={country:'IQ',region:'baghdad'};
 b.hooks.request=name=>name==='bemo_quote_cart'?{data:q}:undefined;
 await b.get('quoteButton').emit('click');
 const call=b.calls.find(c=>c.name==='bemo_quote_cart');
 assert.equal(call.args.cart[0].country,'IQ');
 assert.equal(b.get('region').value,'Baghdad');
 b.fill();b.get('country').value='IQ';b.get('region').value='Basra';
 await b.get('deliveryForm').emit('submit');
 assert.equal(b.calls.some(c=>c.name==='bemo_place_order'),false);
 assert.equal(b.get('quoteRegion').value,'Basra');
});
