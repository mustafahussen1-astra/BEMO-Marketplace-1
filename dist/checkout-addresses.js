/* Addresses stay in memory and are erased at the session boundary. */
(() => {'use strict';const $=id=>document.getElementById(id),api=window.BemoAccount;let addresses=[],identity=null,revision=0;
 const lang=()=>document.documentElement.lang==='en'?'en':'ar',text=(ar,en)=>lang()==='ar'?ar:en;
 function render(){const previous=$('savedAddressSelect').value;$('savedAddressLabel').textContent=text('عنوان محفوظ','Saved address');$('manageAddresses').textContent=text('إدارة العناوين','Manage addresses');$('manageAddresses').href='addresses.html?lang='+lang();$('savedAddressSelect').replaceChildren();const first=document.createElement('option');first.value='';first.textContent=text('إدخال عنوان جديد','Enter a new address');$('savedAddressSelect').append(first);for(const a of addresses){const o=document.createElement('option');o.value=a.id;o.textContent=a.label+' — '+a.delivery.city;$('savedAddressSelect').append(o);}if(addresses.some(a=>a.id===previous))$('savedAddressSelect').value=previous;}
 $('savedAddressSelect').addEventListener('change',()=>{if(!identity||$('recipient').disabled)return;const a=addresses.find(a=>a.id===$('savedAddressSelect').value);if(a){for(const k of ['recipient','phone','country','region','city','address','note'])$(k).value=a.delivery[k]||'';$('confirmQuote').checked=false;}});
 api.subscribe(async s=>{const id=s.phase==='ready'?s.profile?.id:null;if(id===identity)return;identity=id;const ticket=++revision;addresses=[];$('savedAddressPicker').hidden=!id;$('savedAddressStatus').textContent='';render();
  if(s.phase==='ready'&&s.profile){
    if($('recipient')&&!$('recipient').value&&s.profile.display_name)$('recipient').value=s.profile.display_name;
    if($('phone')&&!$('phone').value&&s.profile.phone)$('phone').value=s.profile.phone;
    try{
      const savedProf = JSON.parse(localStorage.getItem('bemo-profile-defaults')||'{}');
      if(savedProf.phone&&$('phone')&&!$('phone').value)$('phone').value=savedProf.phone;
      if(savedProf.country&&$('country')&&!$('country').value)$('country').value=savedProf.country;
      if(savedProf.region&&$('region')&&!$('region').value)$('region').value=savedProf.region;
      if(savedProf.city&&$('city')&&!$('city').value)$('city').value=savedProf.city;
      if(savedProf.address&&$('address')&&!$('address').value)$('address').value=savedProf.address;
    }catch(_){}
  }
  if(!id)return;const r=await api.orderScope().request('bemo_list_addresses',{});if(ticket!==revision)return;if(r.error){$('savedAddressStatus').textContent=text('تعذّر تحميل العناوين؛ يمكنك إدخال العنوان أدناه.','Could not load saved addresses. You can enter the address below.');return;}addresses=r.data;render();
  if(addresses.length>0&&!$('recipient').value){
    const def=addresses.find(a=>a.is_default)||addresses[0];
    $('savedAddressSelect').value=def.id;
    for(const k of ['recipient','phone','country','region','city','address','note'])$(k).value=def.delivery[k]||'';
  }
 });
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});render();
})();
