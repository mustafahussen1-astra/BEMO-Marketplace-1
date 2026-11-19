(() => {
 let timer, toast;
 window.BemoToast=(message,failed=false)=>{
  if(!message)return;
  if(!toast){toast=document.createElement('div');toast.className='bemo-toast';toast.setAttribute('role','status');document.body.append(toast);}
  toast.dataset.failed=String(failed);toast.textContent=message;toast.hidden=false;
  clearTimeout(timer);timer=setTimeout(()=>toast.hidden=true,4500);
 };
 window.addEventListener('bemo:cart',()=>window.BemoToast(document.documentElement.lang==='en'?'Cart updated':'تم تحديث السلة'));
 document.addEventListener('invalid',e=>{if(e.target.validity)window.BemoToast(e.target.validationMessage,true);},true);
 new MutationObserver(records=>{
  for(const change of records){const el=change.target.closest?.('[role="alert"],[role="status"]');
   if(!el||el===toast||el.hidden||!el.getClientRects().length)continue;
   const msg=el.textContent.trim();
   if(el.getAttribute('role')==='alert'||/^(تم |حُفظ|أُضيف|Saved|Added|Updated|Removed|Order placed)/i.test(msg))window.BemoToast(msg,el.getAttribute('role')==='alert');
  }
 }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
})();
