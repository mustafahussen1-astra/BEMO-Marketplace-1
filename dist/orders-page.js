(() => {
 'use strict';const $=id=>document.getElementById(id),api=window.BemoAccount,live=window.BemoLive;
 let requestedOrder=new URL(location.href).searchParams.get('id');
 let lang=new URL(location.href).searchParams.get('lang')==='en'?'en':'ar',mode=new URL(location.href).searchParams.get('view')||'buyer';if(!['buyer','seller','support','notifications'].includes(mode))mode='buyer';
 let epoch=0,identity=null,ready=false,busy=false,page=0,selected=null,activeCase=null,requestKey=null,requestSignature=null;
 const words={skip:['انتقل إلى المحتوى','Skip to content'],browse:['المنتجات','Products'],account:['حسابي','My account'],title:['الطلبات والإشعارات','Orders & notifications'],intro:['تابع كل متجر على حدة. الدفع عند الاستلام للتاجر أو مندوبه؛ لا تحتفظ BEMO بمبالغ الدفع عند الاستلام.','Track each store separately. Pay cash on delivery to the seller or courier; BEMO does not hold COD payments.'],buyer:['مشترياتي','My purchases'],seller:['طلبات متجري','Seller orders'],notifications:['الإشعارات','Notifications'],support:['مساحة الدعم','Support workspace'],gate:['سجّل الدخول وأكمل حسابك لعرض الطلبات.','Sign in and complete your profile to view orders.'],refresh:['تحديث','Refresh'],previous:['السابق','Previous'],next:['التالي','Next'],action:['الإجراء','Action'],reason:['السبب / تفاصيل المراجعة','Reason / review details'],receipt:['تحققت من استلام جميع القطع وفحصها وصلاحيتها للإعادة إلى المخزون.','I verified that all items were physically received, inspected and can be returned to inventory.'],noRefund:['إعادة حصة الاستقطاع لرصيد التاجر منفصلة عن رد قيمة المشتريات النقدية للمشتري.','Returning commission to the seller balance is separate from refunding the buyer’s cash payment.'],submit:['تنفيذ الإجراء','Apply action'],empty:['لا توجد عناصر هنا بعد.','No items here yet.'],loading:['جارٍ التحميل…','Loading…'],details:['التفاصيل','Details'],claim:['استلام الحالة','Claim case'],read:['تحديد كمقروء','Mark read'],private:['بيانات التسليم مخفية حتى قبول التاجر بنجاح.','Delivery details remain private until the seller accepts successfully.'],reasonRequired:['اكتب سبباً واضحاً من 20 حرفاً على الأقل.','Provide a clear reason of at least 20 characters.'],error:['تعذّر تنفيذ الإجراء. حدّث البيانات وحاول مجدداً.','The action failed. Refresh and try again.'],SUPPORT_REQUIRED:['هذه المساحة مخصصة لموظفي الدعم المخولين.','This workspace requires an assigned support role.'],STOCK_INSUFFICIENT:['المخزون لا يكفي لقبول جميع القطع. لم يُخصم أي مخزون.','There is not enough stock for all items. No stock was debited.'],VERSION_CONFLICT:['تغيّر الطلب. حدّث البيانات قبل المحاولة.','This order changed. Refresh before trying again.'],SESSION_CHANGED:['تغيرت جلسة الدخول. أعد فتح الصفحة.','The sign-in session changed. Reopen this page.'],CASE_NOT_ASSIGNED:['الحالة غير مسندة إليك.','This case is not assigned to you.'],CASE_CONFLICT_OF_INTEREST:['لا يمكنك مراجعة حالة تخص مشترياتك أو متجرك.','You cannot review a case involving your purchases or store.']};
 Object.assign(words,{holdDecision:['قرار حصة الاستقطاع — مستقل عن المخزون','Commission decision — separate from inventory'],chooseDecision:['اختر قرار الرصيد','Choose a balance decision'],releaseHold:['إعادة الرصيد للتاجر','Return funds to seller'],captureHold:['استقطاع الحصة','Capture commission'],BALANCE_INSUFFICIENT:['رصيد التاجر لا يكفي لحجز حصة الطلب. لم يُقبل الطلب ولم تُكشف البيانات.','Insufficient commission balance. Order not accepted and details remain private.'],BALANCE_FROZEN:['حساب الرصيد مجمّد؛ تواصل مع الإدارة.','Balance account frozen; contact administration.'],holdRequired:['اختر إعادة الرصيد أو استقطاع الحصة.','Choose whether to release or capture commission.']});
 const states={PENDING_SELLER:['بانتظار قبول التاجر','Awaiting seller'],ESCALATED_TO_SUPPORT:['أُحيل للدعم','Escalated to support'],REJECTED_BY_SELLER:['رفضه التاجر','Rejected by seller'],CANCELLED_BY_BUYER_PRE_ACCEPT:['ألغاه المشتري قبل القبول','Buyer cancelled before acceptance'],ACCEPTED:['مقبول','Accepted'],PACKING:['قيد التجهيز','Packing'],SHIPPED:['السائق في الطريق','Driver en route'],DELIVERY_ATTEMPTED:['جرت محاولة توصيل','Delivery attempted'],DELIVERED:['تم التسليم','Delivered'],CANCEL_REQUESTED:['طلب إلغاء قيد المراجعة','Cancellation requested'],RETURN_REQUESTED:['طلب إرجاع','Return requested'],RETURN_IN_REVIEW:['الإرجاع قيد المراجعة','Return under review'],RETURNED:['تم استلام المرتجع','Return received'],CANCELLED_BY_SUPPORT:['ألغاه الدعم','Cancelled by support'],FAILED_DELIVERY:['تعذر التسليم','Delivery failed'],CLOSED:['مغلق','Closed'],SELLER_REMINDER_24H:['تذكير: طلب بانتظار ردك منذ 24 ساعة','Reminder: order awaiting your response for 24 hours'],SELLER_DELAY_48H:['تأخر رد التاجر وأُحيل الطلب للدعم','Seller delay escalated to support'],ORDER_CREATED:['طلب جديد','New order']};
 const actions={ACCEPT:['قبول الطلب وفتح البيانات','Accept order & unlock details'],REJECT:['رفض الطلب','Reject order'],PACK:['بدء التجهيز','Start packing'],SHIP:['السائق في الطريق','Dispatch driver'],ATTEMPT_DELIVERY:['تأكيد وصول السائق','Confirm driver arrival'],DELIVER:['تأكيد التسليم','Confirm delivery'],FAIL_DELIVERY:['الإبلاغ عن تعذر التسليم','Report delivery failure'],CANCEL:['إلغاء قبل القبول','Cancel before acceptance'],REQUEST_CANCEL:['طلب إلغاء من الدعم','Request cancellation'],REQUEST_RETURN:['طلب مراجعة إرجاع','Request return review'],FOLLOW_UP:['إعادة الطلب للتاجر بمهلة جديدة','Return to seller with a new deadline'],CANCEL_NON_RESPONSE:['إلغاء لعدم رد التاجر','Cancel for seller non-response'],DENY_REQUEST:['رفض الطلب مع بيان السبب','Deny request with explanation'],REVIEW_RETURN:['بدء فحص الإرجاع','Start return review'],APPROVE_CANCEL:['الموافقة على الإلغاء','Approve cancellation'],CONFIRM_RETURN:['تأكيد استلام وفحص المرتجع','Confirm return receipt and inspection']};
 const tr=(key,map=words)=>(map[key]||words.error)[lang==='ar'?0:1],node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 function language(){document.title=tr(mode)+' — BEMO';document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';document.querySelectorAll('[data-t]').forEach(n=>n.textContent=tr(n.dataset.t));document.querySelectorAll('[data-route]').forEach(n=>n.href=n.dataset.route+'?lang='+lang);$('languageButton').textContent=lang==='ar'?'English':'العربية';document.querySelectorAll('[data-mode]').forEach(n=>n.setAttribute('aria-current',n.dataset.mode===mode?'page':'false'));document.querySelectorAll('[data-mode]').forEach(n=>n.hidden=n.dataset.mode!==mode&&!(['buyer','notifications'].includes(mode)&&['buyer','notifications'].includes(n.dataset.mode)));document.querySelector('h1').textContent=tr(mode);const u=new URL(location.href);u.searchParams.set('lang',lang);u.searchParams.set('view',mode);history.replaceState(null,'',u);}
 function error(e){$('error').hidden=false;$('error').textContent=tr(e?.code||'error');}
 function emptyRows() {
  const panel=node('div',undefined,'live-empty');
  const messages={
   buyer:['لم تطلب أي منتج بعد','No purchases yet'],
   seller:['لا توجد طلبات لمتجرك حالياً','Your store has no orders yet'],
   notifications:['لا توجد إشعارات حالياً','No notifications yet'],
   support:['لا توجد حالات في قائمة الدعم','The support queue is empty']
  };
  panel.append(node('p',page?tr('empty'):tr(mode,messages)));
  if(!page && ['buyer','seller'].includes(mode)){
   const link=node('a',mode==='buyer'?tr('browse'):tr('sellerHome',{sellerHome:['لوحة التاجر','Seller dashboard']}),'secondary-button');
   link.href=(mode==='buyer'?'market.html':'seller.html')+'?lang='+lang;
   panel.append(link);
  }
  return panel;
 }
 function clearDetail(){$('detail').hidden=true;$('detailContent').replaceChildren();$('detailTitle').textContent='';$('actionForm').reset();$('action').replaceChildren();selected=null;activeCase=null;requestKey=null;requestSignature=null;}
 async function run(work){if(!ready||busy)return;busy=true;const ticket=epoch,scope=api.orderScope();$('error').hidden=true;$('status').textContent=tr('loading');document.querySelectorAll('button').forEach(n=>n.disabled=true);const request=async(name,args)=>{const r=await scope.request(name,args);if(ticket!==epoch)throw {code:'SESSION_CHANGED'};if(r.error)throw r.error;return r.data;};try{await work(request,ticket);}catch(e){if(ticket===epoch)error(e);}finally{if(ticket===epoch){busy=false;$('status').textContent='';document.querySelectorAll('button').forEach(n=>n.disabled=false);$('previous').disabled=page===0;}}}
 function options(o){if(mode==='seller')return ({PENDING_SELLER:['ACCEPT','REJECT'],ACCEPTED:['PACK','SHIP','REQUEST_CANCEL'],PACKING:['SHIP','REQUEST_CANCEL'],SHIPPED:['ATTEMPT_DELIVERY','DELIVER','FAIL_DELIVERY','REQUEST_CANCEL'],DELIVERY_ATTEMPTED:['DELIVER','FAIL_DELIVERY','REQUEST_CANCEL']})[o.state]||[];if(mode==='buyer'){if(['PENDING_SELLER','ESCALATED_TO_SUPPORT'].includes(o.state))return ['CANCEL'];if(['ACCEPTED','PACKING','SHIPPED','DELIVERY_ATTEMPTED'].includes(o.state))return ['REQUEST_CANCEL'];if(o.state==='DELIVERED')return ['REQUEST_RETURN'];return [];}return ({ESCALATED_TO_SUPPORT:['FOLLOW_UP','CANCEL_NON_RESPONSE'],CANCEL_REQUESTED:['DENY_REQUEST','APPROVE_CANCEL'],FAILED_DELIVERY:['APPROVE_CANCEL'],RETURN_REQUESTED:['DENY_REQUEST','REVIEW_RETURN'],RETURN_IN_REVIEW:['DENY_REQUEST','CONFIRM_RETURN']})[o.state]||[];}
 const stages = [
  ['PENDING_SELLER','تم الطلب','Placed'], ['ACCEPTED','قبول التاجر','Accepted'],
  ['PACKING','التجهيز','Packing'], ['SHIPPED','في الطريق','En route'],
  ['DRIVER_ARRIVED','وصل السائق','Driver arrived'], ['DELIVERED','التسليم','Delivered']
 ];
 function deliveryProgress(order) {
  const recorded = new Set(order.events.flatMap(event => [event.state,event.action]));
  recorded.add(order.state);
  recorded.add('PENDING_SELLER');
  if (order.accepted_at) recorded.add('ACCEPTED');
  const track = node('ol', undefined, 'delivery-progress');
  track.setAttribute('aria-label', lang === 'ar' ? 'مراحل التوصيل' : 'Delivery progress');
  for (const [key, ar, en] of stages) {
   const done = recorded.has(key);
   const label = lang === 'ar' ? ar : en;
   const item = node('li', undefined, done ? 'recorded' : 'unrecorded');
   const mark = node('span', done ? '✓' : '○');
   mark.setAttribute('aria-hidden','true');
   item.append(mark,node('strong',label));
   item.setAttribute('aria-label',label+' · '+(done ? (lang==='ar'?'مسجلة':'Recorded') : (lang==='ar'?'غير مسجلة':'Unrecorded')));
   track.append(item);
  }
  return track;
 }
 function needsReason(action) {
  return mode==='support'||['REJECT','REQUEST_CANCEL','REQUEST_RETURN','FAIL_DELIVERY'].includes(action);
 }
 function actionFields() {
  const action=$('action').value;
  $('reasonLabel').hidden=$('reason').hidden=!needsReason(action);
  $('reason').required=needsReason(action);
  $('reason').minLength=needsReason(action)?20:0;
  $('holdLabel').hidden=mode!=='support'||!activeCase?.commission_hold||!['APPROVE_CANCEL','CONFIRM_RETURN'].includes(action);
  $('holdDecision').required=!$('holdLabel').hidden;
  $('receiptLabel').hidden=mode!=='support'||action!=='CONFIRM_RETURN';
  $('receipt').required=!$('receiptLabel').hidden;
  $('refundNote').hidden=mode!=='support';
  if(action) $('applyAction').textContent=tr(action,actions);
 }
 $('action').addEventListener('change',actionFields);
 function detail(o,c=null){selected=o;activeCase=c;$('detail').hidden=false;$('detailTitle').textContent=o.store_title+' · '+(o.state==='DELIVERY_ATTEMPTED' && o.events?.some(e=>e.action==='DRIVER_ARRIVED') ? (lang==='ar'?'وصل السائق':'Driver arrived') : tr(o.state,states));const root=$('detailContent');root.replaceChildren(node('p',o.id,'order-reference'));const list=node('ul',undefined,'order-items');for(const i of o.items)list.append(node('li',i.title+' / '+i.variant_label+' × '+i.quantity+' — '+live.money(i.unit_price_minor*i.quantity,i.currency,lang)));root.append(deliveryProgress(o),list,node('p',(lang==='ar'?'الإجمالي مع التوصيل: ':'Total including delivery: ')+live.money(o.total_minor,o.currency,lang)));
  const disclosed=Boolean(o.delivery)&&(mode!=='seller'||Boolean(o.accepted_at));if(disclosed){root.append(node('p',lang==='ar'?'بيانات المشتري · مفتوحة':'Buyer details · Unlocked','order-unlocked'));const d=o.delivery;root.append(node('p',[d.recipient,d.phone,d.country,d.region,d.city,d.address,d.note].filter(Boolean).join('\n'),'delivery-detail'));}else root.append(node('p','🔒 '+tr('private'),'order-locked'));
  if(o.accepted_at&&['buyer','seller'].includes(mode)){
   const show=node('button',lang==='ar'?'عرض وصل الطلب':'View receipt','secondary-button');show.type='button';root.append(show);
   show.onclick=()=>run(async req=>{const receipt=await req('bemo_order_receipt',{order_id:o.id});if(selected?.id!==o.id)return;window.BemoReceipt(root,receipt,lang,live.money,tr(receipt.state,states));show.remove();
    if(mode==='seller'){const finance=node('button',lang==='ar'?'تفاصيل الاستقطاع':'Commission details','secondary-button');finance.type='button';root.append(finance);
     finance.onclick=()=>run(async req=>{const entry=await req('bemo_receipt_finance',{order_id:o.id});root.append(node('p',entry?entry.state+' · '+live.money(entry.amount_minor,entry.currency,lang):(lang==='ar'?'لا يوجد حجز مسجل':'No recorded hold')));finance.remove();});}});
  }
  if(c)root.append(node('p',c.reason,'delivery-detail'));const events=node('ol',undefined,'order-timeline');for(const e of o.events)events.append(node('li',(e.action==='DRIVER_ARRIVED'?(lang==='ar'?'وصل السائق':'Driver arrived'):tr(e.state,states))+' · '+new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(e.created_at))));if(o.events.length){const history=node('details',undefined,'order-history');history.append(node('summary',lang==='ar'?'سجل الطلب':'Order history'),events);root.append(history);}
  $('action').replaceChildren();for(const a of options(o)){const option=node('option',tr(a,actions));option.value=a;$('action').append(option);}$('actionForm').hidden=!options(o).length;$('receiptLabel').hidden=mode!=='support';$('holdLabel').hidden=mode!=='support'||!c?.commission_hold;$('holdDecision').value='';$('receipt').checked=false;$('reason').value='';actionFields();$('detailTitle').focus();
 }
 async function rows(request){clearDetail();const method=mode==='support'?'bemo_support_queue':mode==='notifications'?'bemo_notifications':'bemo_list_orders';const args={limit_count:24,offset_count:page*24};if(['buyer','seller'].includes(mode))args.view_as=mode;const result=await request(method,args);if(!Array.isArray(result))throw Error('Invalid response');$('rows').replaceChildren();if(!result.length)$('rows').append(emptyRows());
  for(const r of result){const article=node('article'),copy=node('div'),button=node('button',tr(mode==='support'?(r.unassigned?'claim':'details'):mode==='notifications'?'read':'details'),'secondary-button');button.type='button';
   copy.append(node('h2',mode==='support'?({SELLER_DELAY:lang==='ar'?'تأخر التاجر':'Seller delay',CANCELLATION:lang==='ar'?'إلغاء':'Cancellation',RETURN:lang==='ar'?'إرجاع':'Return',DELIVERY_FAILURE:lang==='ar'?'تعذر التسليم':'Delivery failure'})[r.kind]:mode==='notifications'?(r.kind==='ADMIN_MESSAGE'?(lang==='ar'?'إشعار الإدارة':'Admin notification'):tr(r.kind,states)):r.store_title));copy.append(node('p',r.id,'order-reference'));if(r.state&&mode!=='support')copy.append(node('p',tr(r.state,states),'order-state'));if(mode==='seller'&&Array.isArray(r.items))for(const i of r.items)copy.append(node('p',i.title+' / '+i.variant_label+' × '+i.quantity,'order-line-summary'));if(r.total_minor!=null)copy.append(node('p',live.money(r.total_minor,r.currency,lang)));if(mode==='notifications'){
    if(r.body)copy.append(node('p',r.body));
    copy.append(node('p',new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.created_at))));
    if(r.read_at){button.hidden=true;copy.append(node('small',lang==='ar'?'مقروء':'Read'));}
   }
   article.append(copy,button);$('rows').append(article);
   button.addEventListener('click',()=>run(async req=>{if(mode==='notifications'){await req('bemo_notifications',{mark_read:r.id});await rows(req);}else if(mode==='support'){const work=await req('bemo_support_case',{case_id:r.id,claim_case:r.unassigned});detail(work.order,{...work.case,commission_hold:work.commission_hold});}else detail(await req('bemo_get_order',{order_id:r.id}));}));
  }$('page').textContent=String(page+1);$('next').hidden=result.length<24;if(requestedOrder&&['buyer','seller'].includes(mode)){const id=requestedOrder;requestedOrder=null;if(/^[a-f0-9-]{36}$/i.test(id))detail(await request('bemo_get_order',{order_id:id}));}}
 $('refresh').addEventListener('click',()=>run(rows));$('previous').addEventListener('click',()=>{if(page){page--;run(rows);}});$('next').addEventListener('click',()=>{if(page<416){page++;run(rows);}});
 document.querySelectorAll('[data-mode]').forEach(n=>n.addEventListener('click',()=>{mode=n.dataset.mode;page=0;language();run(rows);}));$('languageButton').addEventListener('click',()=>{lang=lang==='ar'?'en':'ar';language();run(rows);});
 $('actionForm').addEventListener('submit',event=>{event.preventDefault();if(!selected)return;const action=$('action').value,reason=needsReason(action)?$('reason').value.trim():'',receipt=!$('receiptLabel').hidden&&$('receipt').checked;if((mode==='support'||['REJECT','REQUEST_CANCEL','REQUEST_RETURN','FAIL_DELIVERY'].includes(action))&&reason.length<20){error({code:'reasonRequired'});return;}const hold=$('holdLabel').hidden?'':$('holdDecision').value;if(mode==='support'&&activeCase?.commission_hold&&['APPROVE_CANCEL','CONFIRM_RETURN'].includes(action)&&!hold){error({code:'holdRequired'});return;}const signature=JSON.stringify([selected.id,selected.version,action,reason,receipt,hold]);if(signature!==requestSignature){requestSignature=signature;requestKey=crypto.randomUUID();}const o=selected,c=activeCase,key=requestKey;run(async request=>{if(mode==='support')await request('bemo_support_decision_with_hold',{case_id:c.id,decision:action,reason,goods_received:receipt,expected_version:o.version,release_funds:hold?hold==='release':null});else await request('bemo_order_action',{order_id:o.id,action,reason:action==='ATTEMPT_DELIVERY'?'DRIVER_ARRIVED':reason,expected_version:o.version,request_id:key});window.BemoToast?.(lang==='ar'?'تم تنفيذ الإجراء':'Action completed');await rows(request);if(mode!=='support')detail(await request('bemo_get_order',{order_id:o.id}));});});
 language();if(!api){error();return;}api.subscribe(s=>{const id=s.phase==='ready'?s.profile?.id:null;if(id!==identity||s.phase!=='ready'){epoch++;identity=id;busy=false;document.querySelectorAll('button').forEach(n=>n.disabled=false);ready=Boolean(id);$('rows').replaceChildren();clearDetail();$('error').hidden=true;$('status').textContent='';page=0;}ready=s.phase==='ready'&&Boolean(id);$('workspace').hidden=!ready;$('gate').hidden=ready;if(ready&&!busy)run(rows);});api.initialize();
})();
