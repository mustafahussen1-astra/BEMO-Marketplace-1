/* Shared compact catalogue filters. Values are public browsing preferences only. */
(() => {'use strict';
 const labels={currency:['العملة','Currency'],all:['كل العملات','All currencies'],min:['أقل سعر','Min price'],max:['أعلى سعر','Max price'],stock:['المتوفر فقط','In stock only'],sort:['ترتيب','Sort'],newest:['الأحدث','Newest'],price_asc:['السعر: الأقل أولًا','Price: low to high'],price_desc:['السعر: الأعلى أولًا','Price: high to low'],reset:['مسح الفلاتر','Clear filters'],hint:['اختر عملة لتحديد السعر أو ترتيبه','Choose a currency to filter or sort prices']};
 function create(root,params){
  const live=window.BemoLive,fields={},texts=[];
  const make=(tag,key)=>{const n=document.createElement(tag);if(key)texts.push([n,key]);return n;};
  function field(key,type){const label=make('label'),span=make('span',key),input=make(type);input.id='filter-'+key;label.setAttribute('for',input.id);label.append(span,input);root.append(label);fields[key]=input;return input;}
  const currency=field('currency','select'),blank=make('option','all');blank.value='';currency.append(blank);
  for(const code of live.currencies){const n=make('option');n.value=code;n.textContent=code;currency.append(n);}
  const min=field('min','input'),max=field('max','input');for(const n of [min,max]){n.type='text';n.inputMode='decimal';n.maxLength=20;n.dir='ltr';}
  const sort=field('sort','select');for(const key of ['newest','price_asc','price_desc']){const n=make('option',key);n.value=key;sort.append(n);}
  const stockLabel=make('label'),stock=make('input'),stockText=make('span','stock');stock.type='checkbox';stock.id='filter-stock';stockLabel.setAttribute('for',stock.id);stockLabel.className='catalog-stock-toggle';stockLabel.append(stock,stockText);root.append(stockLabel);fields.stock=stock;
  const reset=make('button','reset');reset.type='button';reset.className='catalog-filter-reset';root.append(reset);
  const hint=make('span','hint');hint.className='catalog-filter-hint';root.append(hint);
  currency.value=live.currencies.includes(params.get('currency'))?params.get('currency'):'';
  min.value=params.get('min')||'';max.value=params.get('max')||'';sort.value=['price_asc','price_desc'].includes(params.get('sort'))?params.get('sort'):'newest';stock.checked=params.get('stock')==='1';
  function refresh(){const chosen=Boolean(currency.value);min.disabled=max.disabled=!chosen;for(const o of sort.children)o.disabled=o.value!=='newest'&&!chosen;hint.hidden=chosen;if(!chosen){min.value=max.value='';sort.value='newest';}}
  currency.addEventListener('change',refresh);refresh();
  function read(){const value={currency:currency.value,min:min.value.trim(),max:max.value.trim(),sort:sort.value,inStock:stock.checked};live.filters(value);return value;}
  function resetValues(){currency.value=min.value=max.value='';sort.value='newest';stock.checked=false;refresh();}
  reset.addEventListener('click',()=>{resetValues();root.closest('form').requestSubmit();});
  return {read,active(){const v=read();return Boolean(v.currency||v.min||v.max||v.inStock||v.sort!=='newest');},translate(lang){for(const [n,key] of texts)n.textContent=labels[key][lang==='ar'?0:1];},writeParams(p){const v=read();for(const [k,value] of [['currency',v.currency],['min',v.min],['max',v.max],['stock',v.inStock?'1':''],['sort',v.sort!=='newest'?v.sort:'']])value?p.set(k,value):p.delete(k);},reset:resetValues};
 }
 window.BemoCatalogFilters=Object.freeze({create});
})();
