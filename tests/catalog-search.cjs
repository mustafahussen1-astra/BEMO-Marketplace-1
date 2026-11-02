const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);
for(const file of ['catalog.js','search-provider.js'])vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context);
const P=context.window.BemoSearchProvider,D=context.window.BEMO_SEARCH_DATA;
const cases=[
 ['catalog data preserved',()=>{assert.equal(P.search().total,12);assert.equal(D.products[0].price,189);assert.equal(D.products[0].stock,undefined);assert.equal(D.stores[0].badges,undefined)}],
 ['category counts ignore own category',()=>{const r=P.search({category:'home'});assert.equal(r.total,3);assert.equal(r.facets.fashion,3)}],
 ['store slug and name',()=>{assert.equal(P.search({store:'northline'}).total,5);assert.equal(P.search({q:'Form & Field'}).total,3);assert.equal(P.search({q:'form-field'}).stores.length,1)}],
 ['Arabic normalization and category text',()=>{assert.equal(P.search({q:'سَمَّاعَات'}).total,1);assert.equal(P.search({q:'الالكترونيات'}).total,3)}],
 ['offers and price combine',()=>assert.equal(P.search({offer:true,max:60}).total,3)],
 ['zero maximum is honored',()=>assert.equal(P.search({max:0}).total,0)],
 ['invalid ranges fail closed',()=>{for(const f of [{min:-1},{min:'NaN'},{min:50,max:20}])assert.equal(P.search(f).invalidPrice,true)}],
 ['unknown shipping and badges never match',()=>{for(const f of [{free:true},{country:'A'},{badges:['verified']},{stock:true},{rating:4}]){const r=P.search(f);assert.equal(r.total,0);assert.equal(r.stores.length,0);assert.ok(r.unsupported.length)}}],
 ['no invented sellers or brands',()=>{assert.equal(P.search({scope:'sellers'}).total,0);assert.equal(P.search({brand:'BEMO'}).total,0)}],
 ['currency mismatch excluded',()=>{assert.equal(P.search({currency:'EUR'}).total,0);assert.equal(P.search({currency:'EUR'}).stores.length,0)}],
 ['stable bounded pages',()=>{assert.equal(P.search({page:1}).items.length,8);assert.equal(P.search({page:2}).items.length,4);assert.equal(P.search({page:999}).page,2);assert.equal(P.search({page:1.5}).page,1)}],
 ['sorting and suggestion cap',()=>{const r=P.search({sort:'price_up'});assert.equal(r.items[0].price,18);assert.ok(P.suggest('a').length<=5);assert.equal(P.suggest('').length,0)}]
];for(const [name,fn]of cases){fn();console.log('PASS '+name)}console.log(cases.length+' catalog adapter tests passed. No database/security claim.');
