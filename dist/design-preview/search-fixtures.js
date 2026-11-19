/* Structured, synthetic QA fixtures. Never import these into the live database. */
(function(root){
 const stores=[
  {id:'form-field',name:'Form & Field',seller:'Form & Field team',seller_ar:'فريق فورم آند فيلد',badges:[{type:'registered',status:'active'},{type:'verified',status:'active'}],zones:[{country:'A',region:'North',city:'Garden',fee:0},{country:'A',region:'South',city:'Port',fee:8}],rating:4.6},
  {id:'everyday',name:'Everyday Studio',seller:'Everyday Studio team',seller_ar:'فريق إيفريداي ستوديو',badges:[{type:'registered',status:'active'},{type:'excellent',status:'active'},{type:'verified',status:'revoked'}],zones:[{country:'A',region:'North',city:'Garden',fee:5},{country:'B',region:'Coast',city:'Bay',fee:0}],rating:4.8},
  {id:'northline',name:'Northline',seller:'Northline team',seller_ar:'فريق نورثلاين',badges:[{type:'registered',status:'active'},{type:'official',status:'active'},{type:'excellent',status:'expired'}],zones:[{country:'B',region:'Coast',city:'Bay',fee:6},{country:'A',region:'South',city:'Port',fee:0}],rating:4.2}
 ];
 const products=(root.BEMO_CATALOG||[]).map((p,i)=>({...p,store_id:stores.find(s=>s.name===p.store).id,brand:['BEMO Sample Home','BEMO Sample Tech','BEMO Sample Everyday'][i%3],stock:[12,8,0,20,4,6,9,15,20,0,10,7][i],currency:'USD',created:`2026-10-${String(31-i).padStart(2,'0')}`}));
 root.BEMO_SEARCH_FIXTURES={stores,products};
 const normalize=s=>String(s||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').toLocaleLowerCase().trim();
 function zone(store,f){if(!f.country)return null;return store.zones.find(z=>z.country===f.country&&(!f.region||z.region===f.region)&&(!f.city||z.city===f.city))||null}
 const validBadges=s=>s.badges.filter(b=>b.status==='active').map(b=>b.type);
 function search(f={}){
  const q=normalize(f.q),badges=f.badges||[];let eligibleStores=stores.filter(s=>(!f.store||s.id===f.store)&&(!badges.length||badges.some(b=>validBadges(s).includes(b)))&&(!f.country||zone(s,f))&&(!f.free||(f.country&&f.region&&f.city&&zone(s,f)?.fee===0))&&(!f.rating||s.rating>=Number(f.rating)));
  let rows=products.filter(p=>eligibleStores.some(s=>s.id===p.store_id)&&(!f.category||p.category===f.category)&&(!f.brand||p.brand===f.brand)&&(!f.currency||f.currency===p.currency)&&(!f.min||p.price>=Number(f.min))&&(!f.max||p.price<=Number(f.max))&&(!f.stock||p.stock>0)&&(!f.offer||p.oldPrice>p.price)&&(!q||normalize([p.name,p.ar,p.store,p.brand,p.category].join(' ')).includes(q)));
  const facets=Object.fromEntries(['home','fashion','electronics','beauty','sports'].map(c=>[c,rows.filter(p=>p.category===c).length]));
  const sorted=[...rows].sort((a,b)=>f.sort==='price_up'?a.price-b.price:f.sort==='price_down'?b.price-a.price:f.sort==='rating'?stores.find(s=>s.id===b.store_id).rating-stores.find(s=>s.id===a.store_id).rating:f.sort==='discount'?((b.oldPrice?1-b.price/b.oldPrice:0)-(a.oldPrice?1-a.price/a.oldPrice:0)):f.sort==='newest'?b.created.localeCompare(a.created):a.id-b.id);
  const storeRows=eligibleStores.filter(s=>(!f.category&&!f.brand&&!f.min&&!f.max&&!f.stock&&!f.offer||rows.some(p=>p.store_id===s.id))&&(!q||normalize([s.name,s.seller,s.seller_ar].join(' ')).includes(q)));
  const size=8,page=Math.min(Math.max(1,Number(f.page)||1),Math.max(1,Math.ceil(sorted.length/size)));
  return {items:sorted.slice((page-1)*size,page*size),stores:storeRows,total:sorted.length,facets,page,pages:Math.max(1,Math.ceil(sorted.length/size)),sample:true};
 }
 root.BemoSearchProvider={search,zone,validBadges,normalize,suggest:q=>products.filter(p=>normalize(p.name+' '+p.ar).includes(normalize(q))).slice(0,5)};
 if(typeof module!=='undefined')module.exports={search,stores,products,zone,validBadges,normalize};
})(typeof window!=='undefined'?window:globalThis);
