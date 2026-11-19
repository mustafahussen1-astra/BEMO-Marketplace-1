/* Catalog adapter. Unknown shipping, identity, stock and review data stays unknown.
   The synthetic design-review fixtures are intentionally not imported here. */
(function(root){
  'use strict';
  const ids={'Form & Field':'form-field','Everyday Studio':'everyday','Northline':'northline'};
  const stores=Object.entries(root.BEMO_STORES||{}).map(([name,s])=>({id:ids[name]||name,name,...s}));
  const products=(root.BEMO_CATALOG||[]).map(p=>({...p,store_id:ids[p.store]||p.store,currency:'USD'}));
  const categories=['home','fashion','electronics','beauty','sports'];
  const categoryNames={home:'المنزل والمعيشة home living',fashion:'الأزياء fashion',electronics:'الإلكترونيات electronics',beauty:'الجمال beauty',sports:'الرياضة والأنشطة sports outdoors'};
  const normalize=s=>String(s||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').toLocaleLowerCase().trim();
  function search(f={}){
    const unsupported=['brand','country','region','city','rating','free','stock'].filter(k=>f[k]);
    if(f.badges?.length)unsupported.push('badges');
    if(['newest','rating','quality'].includes(f.sort))unsupported.push('sort');
    if(f.scope==='sellers')unsupported.push('sellers');
    const validNumber=v=>v===''||v==null||(Number.isFinite(Number(v))&&Number(v)>=0);
    const invalidPrice=!validNumber(f.min)||!validNumber(f.max)||(f.min!==''&&f.min!=null&&f.max!==''&&f.max!=null&&Number(f.min)>Number(f.max));
    const empty=()=>({items:[],stores:[],total:0,facets:Object.fromEntries(categories.map(c=>[c,0])),page:1,pages:1,unsupported,invalidPrice,sample:true});
    if(unsupported.length||invalidPrice)return empty();
    const q=normalize(f.q).slice(0,200),store=stores.find(s=>s.id===f.store||normalize(s.name)===normalize(f.store));
    let rows=products.filter(p=>(!f.store||p.store_id===store?.id)&&(!f.currency||f.currency===p.currency)&&(!f.min||p.price>=Number(f.min))&&((f.max===''||f.max==null)||p.price<=Number(f.max))&&(!f.offer||p.oldPrice>p.price)&&(!q||normalize([p.name,p.ar,p.store,p.store_id,categoryNames[p.category]].join(' ')).includes(q)));
    // Disjunctive category counts: all other constraints apply, category itself does not.
    const facets=Object.fromEntries(categories.map(c=>[c,rows.filter(p=>p.category===c).length]));
    if(f.category)rows=rows.filter(p=>p.category===f.category);
    const discount=p=>p.oldPrice>p.price?1-p.price/p.oldPrice:0;
    rows.sort((a,b)=>(f.sort==='price_up'?a.price-b.price:f.sort==='price_down'?b.price-a.price:f.sort==='discount'?discount(b)-discount(a):0)||a.id-b.id);
    const storeRows=stores.filter(s=>(!f.store||s.id===store?.id)&&(!q||normalize([s.id,s.name,s.ar,s.blurb].join(' ')).includes(q))&&(!f.category&&!f.min&&(f.max===''||f.max==null)&&!f.offer&&!f.currency||rows.some(p=>p.store_id===s.id)));
    const pages=Math.max(1,Math.ceil(rows.length/8)),page=Math.min(pages,Math.max(1,Math.floor(Number(f.page))||1));
    return {items:rows.slice((page-1)*8,page*8),stores:storeRows,total:rows.length,facets,page,pages,unsupported,invalidPrice:false,sample:true};
  }
  root.BEMO_SEARCH_DATA={stores,products};
  root.BemoSearchProvider={search,normalize,suggest:q=>{const n=normalize(q).slice(0,200);return n?products.filter(p=>normalize(p.name+' '+p.ar).includes(n)).slice(0,5):[]}};
})(typeof window!=='undefined'?window:globalThis);
