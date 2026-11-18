const fs=require('fs'),vm=require('vm'),test=require('node:test'),assert=require('node:assert/strict');
function boot(query=''){
 const nodes=[],fields=new Map();let submits=0;
 const form={requestSubmit(){submits++;}};
 function el(tag){const n={tag,value:'',children:[],textContent:'',events:{},disabled:false,checked:false,hidden:false,setAttribute(k,v){this[k]=v;},append(...children){this.children.push(...children);if(this.tag==='select'&&this.children.length===1)this.value=children[0].value;},addEventListener(k,fn){this.events[k]=fn;},closest(){return form;},emit(k){this.events[k]?.();}};nodes.push(n);return n;}
 const root=el('div'),window={};const context={window,document:{createElement:el},URL,URLSearchParams,Intl,localStorage:{getItem(){return null;}},CustomEvent:function(){}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/live-commerce.js','utf8'),context);
 vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/catalog-filters.js','utf8'),context);
 const filters=window.BemoCatalogFilters.create(root,new URLSearchParams(query));for(const n of nodes)if(n.id)fields.set(n.id,n);
 return {root,filters,nodes,get:key=>fields.get('filter-'+key),submits:()=>submits};
}
test('filter controls restore public deep link and preserve values across AR/EN',()=>{
 const b=boot('currency=IQD&min=١٢٫٣٤٥&max=20&stock=1&sort=price_desc');b.filters.translate('en');assert.equal(b.get('currency').value,'IQD');assert.equal(b.get('min').disabled,false);assert.equal(b.filters.read().inStock,true);b.filters.translate('ar');assert.equal(b.get('min').value,'١٢٫٣٤٥');const p=new URLSearchParams('store=bemox&category=home&page=2');b.filters.writeParams(p);assert.equal(p.get('store'),'bemox');assert.equal(p.get('sort'),'price_desc');assert.equal(p.get('stock'),'1');assert.equal(p.get('min'),'١٢٫٣٤٥');
});
test('clearing currency cannot compare mixed currencies; clear submits once and removes filter params',()=>{
 const b=boot('currency=IQD&min=5&sort=price_asc&stock=1');b.get('currency').value='';b.get('currency').emit('change');assert.equal(b.get('min').disabled,true);assert.equal(b.get('sort').value,'newest');assert.equal(b.filters.read().min,'');b.nodes.find(n=>n.tag==='button').emit('click');assert.equal(b.submits(),1);assert.equal(b.filters.active(),false);const p=new URLSearchParams('store=bemox&currency=IQD&min=2&max=4&stock=1&sort=price_asc');b.filters.writeParams(p);assert.equal(p.toString(),'store=bemox');
});
test('invalid ranges and unsupported precision are refused before request',()=>{
 const b=boot('currency=JPY&min=1.1');assert.throws(()=>b.filters.read(),/FILTER_PRICE_INVALID/);b.get('min').value='100';b.get('max').value='50';assert.throws(()=>b.filters.read(),/FILTER_PRICE_INVALID/);b.get('max').value='100';assert.equal(b.filters.read().max,'100');
});
