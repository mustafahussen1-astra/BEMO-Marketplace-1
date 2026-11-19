window.BemoReceipt = function renderReceipt(root, receipt, lang, money, stateLabel) {
 const ar=lang==='ar', label=(a,e)=>ar?a:e;
 const section=document.createElement('section');
 section.className='bemo-receipt';section.lang=lang;section.dir=ar?'rtl':'ltr';
 function line(tag,value,parent=section){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
 const format=value=>money(value,receipt.currency,lang);
 line('strong','BEMO');line('h3',label('وصل طلب','Order receipt'));
 line('p',receipt.store_title+' · @'+receipt.store_slug);
 const date=value=>new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 const fields=[[label('رقم الوصل','Receipt'),receipt.receipt_number],[label('الطلب الرئيسي','Checkout'),receipt.parent_id],[label('طلب المتجر','Store order'),receipt.id],[label('تاريخ الطلب','Placed'),date(receipt.created_at)],[label('تاريخ القبول','Accepted'),date(receipt.accepted_at)]];
 const dl=line('dl','');for(const [key,value] of fields){line('dt',key,dl);line('dd',value,dl);}
 if(receipt.logo_path&&/^[0-9a-f]{64}\/[0-9a-f-]{36}\.(jpg|png)$/.test(receipt.logo_path)){const img=document.createElement('img');img.src=window.BEMO_BACKEND.url+'/storage/v1/object/public/bemo-store-images/'+receipt.logo_path;img.alt=receipt.store_title;img.width=54;section.prepend(img);}
 const d=receipt.delivery;
 line('h4',label('بيانات التسليم','Delivery details'));
 line('p',[d.recipient,d.phone,d.country,d.region,d.city,d.address,d.note].filter(Boolean).join(' · '));
 for(const i of receipt.items){if(i.former_minor)line('p',label('خصم القطعة','Unit discount')+' · '+format(i.former_minor-i.unit_price_minor));line('h4',[i.title,i.variant_label,i.sku].filter(Boolean).join(' · '));line('p',i.quantity+' × '+format(i.unit_price_minor)+' = '+format(i.quantity*i.unit_price_minor));}
 line('p',label('المنتجات','Items')+' · '+format(receipt.items_minor));
 line('p',label('التوصيل','Delivery')+' · '+format(receipt.delivery_fee_minor));
 line('strong',label('الإجمالي','Total')+' · '+format(receipt.total_minor));
 line('p',stateLabel+' · '+label('الدفع نقداً عند الاستلام','Cash on delivery'));
 line('p',receipt.delivered_at?label('أبلغ التاجر عن التسليم. لا يوجد تأكيد دفع إلكتروني.','Seller reported delivery. No electronic payment confirmation.'):label('غير مدفوع · يُحصّل عند التسليم','Unpaid · collect on delivery'));
 const track=new URL('orders.html',location.href);track.search=new URLSearchParams({view:new URL(location.href).searchParams.get('view')==='seller'?'seller':'buyer',id:receipt.id,lang});
 const qr=qrcode(0,'M');qr.addData(track.href);qr.make();const code=document.createElement('img');code.src=qr.createDataURL(3,4);code.alt=label('رمز تتبع الطلب','Order tracking QR');section.append(code);
 const bars=document.createElementNS('http://www.w3.org/2000/svg','svg');JsBarcode(bars,receipt.id,{format:'CODE128',width:2,height:36,displayValue:false});bars.style.maxWidth='100%';section.append(bars);
 const help=line('a',label('دعم الطلب','Order support'));help.href='help.html?lang='+lang;
 const controls=line('div','');controls.className='receipt-actions';
 const layout=line('select','',controls);layout.setAttribute('aria-label',label('حجم الورق','Paper size'));
 for(const size of ['A4','80mm','58mm'])line('option',size,layout);
 const print=line('button',label('طباعة أو حفظ PDF','Print or save PDF'),controls);
 print.type='button';print.onclick=()=>{const style=document.createElement('style');style.textContent='@media print { @page{size:'+(layout.value==='A4'?'A4':'auto')+';margin:4mm} .bemo-receipt{max-width:'+(layout.value==='A4'?'100%':layout.value==='80mm'?'72mm':'50mm')+'} }';document.head.append(style);window.addEventListener('afterprint',()=>style.remove(),{once:true});window.print();};
 controls.setAttribute('data-html2canvas-ignore','true');
 const download=line('button',label('تنزيل PDF','Download PDF'),controls);download.type='button';
 download.onclick=async()=>{download.disabled=true;try{
  await document.fonts.ready;await window.html2pdf().set({filename:'BEMO-'+receipt.receipt_number+'.pdf',margin:8,html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4'}}).from(section).save();window.BemoToast(label('تم تجهيز الوصل','Receipt prepared'));
 }catch{window.BemoToast(label('تعذّر تجهيز الملف. أعد المحاولة أو استخدم الطباعة.','PDF failed. Retry or use print.'),true);}finally{download.disabled=false;}};
 const copy=line('button',label('نسخ رقم الوصل','Copy receipt number'),controls);copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(receipt.receipt_number);window.BemoToast(label('نُسخ رقم الوصل','Receipt number copied'));}catch{window.BemoToast(label('تعذّر النسخ','Copy failed'),true);}};
 root.append(section);
};
