/* Preserve the approved homepage layout; only merchant-published goods are listed. */
(() => {
 'use strict';const live=window.BemoLive;
 window.BEMO_ILLUSTRATIONS=Object.fromEntries((window.BEMO_CATALOG||[]).map(p=>[p.id,p.image]));
 window.BEMO_CATALOG=[];window.BEMO_STORES=[];window.BEMO_HOME_STATUS='loading';window.BEMO_STORES_STATUS='loading';
 let lang=new URL(location.href).searchParams.get('lang')==='en'?'en':'ar',saved=[];
 try{const raw=JSON.parse(localStorage.getItem('bemo-live-saved-v1')||'[]');if(Array.isArray(raw))saved=raw.filter(x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x)).slice(0,100);}catch(_){}
 const state=()=>({lang,saved:[...saved],cart:live.cart().map(x=>({qty:x.quantity}))});
 const emit=()=>window.dispatchEvent(new CustomEvent('bemo:state',{detail:state()}));
 const route=(file,params={})=>{location.href=file+'?'+new URLSearchParams({lang,...params});};
 function detail(id){const p=window.BEMO_CATALOG.find(x=>x.id===id);if(p)route('product.html',{id:p.id});}
 window.BemoCommerce={getState:state,setLanguage(value){lang=value;emit();},add:detail,detail,open(action){if(action==='account')route('account.html');else if(action==='sell')route('merchant.html');else if(action==='orders')route('orders.html');else if(action==='cart'){location.href='market.html?view=cart&lang='+lang;}else if(action==='saved')window.dispatchEvent(new CustomEvent('bemo:saved'));else route('help.html');},toggleSaved(id){saved=saved.includes(id)?saved.filter(x=>x!==id):[...saved,id].slice(-100);try{localStorage.setItem('bemo-live-saved-v1',JSON.stringify(saved));}catch(_){}emit();}};
 window.addEventListener('bemo:cart',emit);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 Promise.allSettled([live.catalog({},controller.signal),window.BemoDirectory.list({},controller.signal)]).then(async([catalogResult,directoryResult])=>{
  if(directoryResult.status==='fulfilled'){window.BEMO_STORES=directoryResult.value.stores;window.BEMO_STORES_STATUS='ready';}else window.BEMO_STORES_STATUS='error';
  if(catalogResult.status==='rejected'){window.BEMO_HOME_STATUS='error';window.dispatchEvent(new CustomEvent('bemo:catalog'));return;}
  const result=catalogResult.value;
  for(const p of result.products){const v=p.variants.reduce((a,b)=>!a||b.price_minor<a.price_minor?b:a,null);if(!v)continue;let image='';if(p.media[0])try{image=await live.imageUrl(p.media[0].storage_key,controller.signal);}catch(_){}
   window.BEMO_CATALOG.push({id:p.id,name:p.title,ar:p.title,category:p.category,store:p.store_title,store_slug:p.store_slug,price:v.price_minor/10**live.digits(v.currency),currency:v.currency,image});}
  window.BEMO_HOME_STATUS='ready';window.dispatchEvent(new CustomEvent('bemo:catalog'));
 }).catch(()=>{window.BEMO_HOME_STATUS='error';window.dispatchEvent(new CustomEvent('bemo:catalog'));}).finally(()=>clearTimeout(timer));
})();
