(() => {
 'use strict';
 const words={
  title:['مناطق التوصيل','Delivery regions'],seller:['مركز التاجر','Seller center'],back:['إعدادات المتجر','Store settings'],
  coverage:['تُقبل الطلبات في المناطق المحفوظة فقط. استخدم * لتغطية الدولة كاملة. عند حفظ قائمة فارغة يُطبّق السعر الأساسي للمتجر.','Orders are accepted in saved regions only. Use * for nationwide delivery. Saving an empty list restores the store’s base fee.'],
  country:['رمز الدولة (IQ، SA…)','Country code (IQ, SA…)'],region:['المنطقة أو *','Region or *'],fee:['رسوم التوصيل','Delivery fee'],
  min:['أقل مدة بالأيام','Minimum days'],max:['أقصى مدة بالأيام','Maximum days'],remove:['إزالة المنطقة','Remove region'],
  add:['إضافة منطقة','Add region'],save:['حفظ المناطق','Save regions'],reload:['استعادة المحفوظ','Reload saved regions'],
  SETTINGS_REQUIRED:['حدد عملة المتجر وسعر التوصيل الأساسي في إعدادات المتجر أولاً.','Set your store currency and base delivery fee in store settings first.'],
  DELIVERY_DUPLICATE:['هذه المنطقة مكررة في الدولة نفسها.','This region appears twice in the same country.'],
  DELIVERY_INVALID:['تحقق من الرمز والرسوم والمدة لكل منطقة.','Check the country code, fee and delivery times for each region.']
 };
 let state=null;
 const w=window.BemoWorkspace.create(words,{seller:true,onReady:()=>w.run(load),onClear:()=>{state=null;w.$('rules').replaceChildren();w.$('currencyInfo').textContent='';},onLanguage:translate});
 const $=w.$;
 function translate(){
  for(const label of $('rules').querySelectorAll('[data-key]'))label.textContent=w.t(label.dataset.key);
  if(state)$('currencyInfo').textContent=w.t('fee')+' · '+state.currency;
 }
 function add(rule={}){
  const row=w.node('fieldset',undefined,'field-pair');
  for(const [key,value] of Object.entries({country:rule.country,region:rule.region,fee:rule.fee_minor==null?'':(rule.fee_minor/10**state.minor_digits).toFixed(state.minor_digits),min:rule.min_days,max:rule.max_days})){
   const label=w.node('label'),caption=w.node('span',w.t(key)),input=w.node('input');
   caption.dataset.key=key;input.name=key;input.required=true;input.value=value??'';
   if(key==='country'){input.maxLength=2;input.pattern='[A-Za-z]{2}';input.dir='ltr';}
   else if(key==='region')input.maxLength=120;
   else{input.type='number';input.min=0;input.step=key==='fee'?String(10**-state.minor_digits):'1';if(key!=='fee')input.max=365;}
   label.append(caption,input);row.append(label);
  }
  const remove=w.node('button',w.t('remove'),'secondary-button');remove.type='button';remove.dataset.key='remove';
  remove.onclick=()=>row.remove();row.append(remove);$('rules').append(row);
 }
 function render(value){state=value;$('rules').replaceChildren();for(const rule of state.rules)add(rule);translate();}
 async function load(request){render(await request('bemo_delivery_workspace'));}
 $('reload').onclick=()=>w.run(load);$('addRule').onclick=()=>{if(state)add();};
 $('rulesForm').onsubmit=e=>{
  e.preventDefault();if(!state)return;
  w.run(async request=>{
   const rules=Array.from($('rules').children,row=>{
    const fields=row.elements,region=fields.region.value.trim();
    return {country:fields.country.value.trim(),region,label:region==='*'?fields.country.value.toUpperCase():region,fee_minor:Math.round(Number(fields.fee.value)*10**state.minor_digits),min_days:Number(fields.min.value),max_days:Number(fields.max.value)};
   });
   render(await request('bemo_save_delivery_regions',{rules,expected_version:state.version}));
  },'saving');
 };
 w.start();
})();
