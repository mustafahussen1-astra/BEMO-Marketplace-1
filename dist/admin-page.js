(() => {
  'use strict';
  const form = document.getElementById('entry');
  const fields = form.elements;
  const words = {
    title:['مركز الإدارة','Admin center'], signin:['الدخول بحساب الإدارة','Sign in as an administrator'],
    finance:['إدارة الأرصدة والرسوم','Balances and fees'], support:['طلبات الدعم','Support cases'],
    discovery:['إدارة أشرطة الرئيسية','Homepage discovery'], section:['القسم','Section'],
    brand:['الماركات','Brands'], verified:['المتاجر الموثوقة','Verified stores'], offer:['العروض','Offers'],
    storeId:['معرّف المتجر','Store ID'], variantId:['معرّف خيار المنتج','Product variant ID'],
    brandName:['اسم الماركة','Brand name'], former:['السعر السابق للخيار','Previous variant price'],
    currency:['العملة','Currency'], position:['ترتيب الظهور','Display order'],
    visible:['ظاهر في الرئيسية','Visible on homepage'], save:['حفظ','Save'],
    ADMIN_REQUIRED:['هذه المساحة مخصصة للإدارة.','Administrator access required.']
  };
  const w = window.BemoWorkspace.create(words, {
    onReady: () => w.run(async request => {
      const access = await request('bemo_workspace_access');
      if (!access.admin) throw {code:'ADMIN_REQUIRED'};
      w.$('adminControls').hidden = false;
      await loadDirectory(request);
    }),
    onClear: () => { w.$('adminControls').hidden = true; data=null;query='';page=0;section='accounts';draw();form.reset(); layout(); },
    onLanguage: () => {layout();draw();}
  });
  function layout() {
    const offer = fields.kind.value === 'offer';
    w.$('targetLabel').textContent = w.t(offer ? 'variantId' : 'storeId');
    w.$('brandField').hidden = fields.kind.value !== 'brand';
    fields.label.required = !w.$('brandField').hidden;
    w.$('offerFields').hidden = !offer;
    fields.former.required = offer;
    w.$('supportLink').href = w.url('orders.html',{view:'support'});
  }
  for (const currency of window.BemoLive.currencies) fields.currency.add(new Option(currency,currency));
  fields.kind.addEventListener('change',layout);
  form.addEventListener('submit', event => {
    event.preventDefault();
    w.run(async request => {
      const kind = fields.kind.value;
      await request('bemo_set_discovery_entry', {
        kind, target:fields.target.value.trim(), label:kind === 'brand' ? fields.label.value.trim() : null,
        former_price:kind === 'offer' ? window.BemoLive.priceMinor(fields.former.value,fields.currency.value) : null,
        currency:kind === 'offer' ? fields.currency.value : null, enabled:fields.enabled.checked, sort_position:Number(fields.position.value)
      });
    },'saving');
  });
const sections={receipts:['الوصولات','Receipts'],accounts:['الحسابات','Accounts'],stores:['المتاجر والتوثيق','Stores & verification'],products:['المنشورات','Listings'],orders:['الطلبات','Orders'],log:['سجل الإدارة','Admin history']};
const operations={account_suspend:['تعليق الحساب','Suspend account'],account_restore:['تفعيل الحساب','Restore account'],store_suspend:['إخفاء المتجر','Hide store'],store_restore:['إعادة المتجر','Restore store'],product_suspend:['إخفاء المنشور','Hide listing'],product_restore:['إعادة إلى المسودة','Restore to draft'],verify:['اعتماد التوثيق','Approve verification'],reject:['رفض التوثيق','Reject verification'],notify:['إشعار خاص','Direct notification'],broadcast:['إشعار لجميع الحسابات النشطة','Notify all active accounts']};
let section='accounts',page=0,query='',data=null;
Object.assign(words,sections,operations,{search:['بحث بالاسم أو المعرّف','Search by name or ID'],cases:['شكاوى مفتوحة','Open cases'],empty:['لا توجد نتائج','No results'],next:['التالي','Next'],prev:['السابق','Previous']});
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function button(label,fn){const b=el('button',label,'secondary-button');b.type='button';b.onclick=fn;return b;}
async function loadDirectory(request){if(section==='receipts'){const found=await request('bemo_receipt_directory',{search_text:query,page_num:page});data={...data,rows:found.rows};draw();return;}data=await request('bemo_console',{section_name:section,search_text:query,page_num:page});draw();}
function refresh(){w.run(loadDirectory);}
function operate(op,row){
 const promptText=w.lang()==='ar'?'اكتب نص الإشعار أو سبب القرار':'Enter notification text or decision reason';
 const reason=window.prompt(w.t(op)+' · '+(row?.title||'BEMO')+'\n'+promptText)?.trim();
 if(!reason||reason.length<3||reason.length>500)return;
 if(!window.confirm(w.t(op)+'\n'+reason))return;
 const key=crypto.randomUUID();
 w.run(async request=>{await request('bemo_console_action',{operation:op,target:row?.id||null,reason,request_id:key});await loadDirectory(request);},'saving');
}
function draw(){
 const root=w.$('directory');root.replaceChildren();if(!data)return;
 const metrics=el('div',null,'console-metrics'),nav=el('nav',null,'form-actions');
 for(const k of Object.keys(sections)){
 const b=button(k==='receipts'?w.t(k):w.t(k)+' · '+(data.counts?.[k]||0),()=>{section=k;page=0;query='';refresh();});
 b.setAttribute('aria-pressed',String(k===section));metrics.append(b);}
 metrics.append(el('span',w.t('cases')+' · '+data.cases));
 const search=el('form',null,'form-actions'),input=el('input');input.value=query;input.placeholder=w.t('search');input.setAttribute('aria-label',w.t('search'));input.maxLength=160;
 const submit=el('button',w.t('search'),'primary-button');search.append(input,submit);search.onsubmit=e=>{e.preventDefault();query=input.value.trim();page=0;refresh();};
 root.append(metrics,el('h2',w.t(section)),search);
 if(section==='receipts'&&data.rows.length)root.append(button(w.lang()==='ar'?'تصدير النتائج':'Export results',()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify(data.rows,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='BEMO-receipts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }));
 if(section==='accounts')root.append(button(w.t('broadcast'),()=>operate('broadcast')));
 if(!data.rows.length)root.append(el('p',w.t('empty')));
 for(const row of data.rows){const article=el('article',null,'console-entry'),actions=el('div',null,'form-actions');
 article.append(el('strong',row.title),el('p',[row.status,row.detail,row.related].filter(Boolean).join(' · ')),el('small',row.id+' · '+new Date(row.created_at).toLocaleDateString(w.lang())));
 const choices=section==='accounts'?['notify',row.status==='ACTIVE'?'account_suspend':'account_restore']:section==='stores'?[row.status==='ACTIVE'?'store_suspend':'store_restore','verify','reject']:section==='products'?[row.status==='SUSPENDED'?'product_restore':'product_suspend']:[];
 for(const op of choices)actions.append(button(w.t(op),()=>operate(op,row)));
 article.append(actions);root.append(article);}
 if(page)nav.append(button(w.t('prev'),()=>{page--;refresh();}));
 if(data.rows.length===25)nav.append(button(w.t('next'),()=>{page++;refresh();}));root.append(nav);
}
  function initOperationsHub(){
    const qEl=document.getElementById('adminTicketsQueue');
    const secList=document.getElementById('securityEventsList');
    const monEl=document.getElementById('monitorModeStatus');
    const pSelect=document.getElementById('policySlugSelect');
    const pTitle=document.getElementById('policyTitleArInput');
    const pBody=document.getElementById('policyBodyArInput');
    const pStatus=document.getElementById('policySaveStatus');

    function drawTickets(){
      if(!qEl||!window.BemoSupport)return;
      const rows=window.BemoSupport.listTickets({onlyMine:false});
      qEl.replaceChildren();
      if(!rows.length){qEl.textContent='لا توجد تذاكر أو بلاغات مفتوحة حالياً.';return;}
      for(const t of rows.slice(0,25)){
        const card=el('div');card.style.cssText='padding:12px;border:1px solid var(--bemo-border);border-radius:8px;background:var(--bemo-surface);';
        card.append(el('strong',`[${t.ticket_type}] ${t.subject} (${t.status})`),el('p',`${t.message}\nمن: ${t.reporter_name} · ${t.reporter_contact} ${t.target_ref?'· الهدف: '+t.target_ref:''}`));
        if(t.status==='OPEN'){
          const acts=el('div');acts.style.cssText='display:flex;gap:8px;margin-top:8px;';
          acts.append(button('اعتماد / حل',()=>{const n=window.prompt('ملاحظة الحل الإداري:')||'تمت المراجعة وحل الحالة.';window.BemoSupport.resolveLocalTicket(t.id,'RESOLVED',n);drawTickets();}));
          acts.append(button('رفض',()=>{const n=window.prompt('سبب الرفض:')||'تمت المراجعة والرفض.';window.BemoSupport.resolveLocalTicket(t.id,'REJECTED',n);drawTickets();}));
          card.append(acts);
        }
        qEl.append(card);
      }
    }

    function drawSecurity(){
      if(!window.BemoSupport)return;
      const st=window.BemoSupport.getSecurityState();
      if(monEl)monEl.textContent=st.monitorMode?'الوضع الحالي: وضع المراقبة الآمن (Monitor Mode — تسجيل بدون حظر تلقائي مفرط)':'الوضع الحالي: وضع التفعيل (Enforce Mode — تقييد مؤقت للحالات المرتفعة)';
      if(secList){
        secList.replaceChildren();
        const suspKeys=Object.keys(st.suspended||{});
        const allowKeys=st.allowlist||[];
        secList.textContent=`الحسابات المعلقة حالياً: ${suspKeys.length?suspKeys.join('، '):'لا يوجد'} · المستثنون (Allowlist): ${allowKeys.length?allowKeys.join('، '):'لا يوجد'} · السجلات المسجلة: ${(st.events||[]).length}`;
      }
    }

    document.getElementById('refreshTicketsBtn')?.addEventListener('click',drawTickets);
    document.getElementById('toggleMonitorBtn')?.addEventListener('click',()=>{
      const st=window.BemoSupport.getSecurityState();
      st.monitorMode=!st.monitorMode;
      window.BemoSupport.saveSecurityState(st);
      drawSecurity();
    });

    document.getElementById('securityControlForm')?.addEventListener('submit',e=>{
      e.preventDefault();
      const target=document.getElementById('secTargetId').value.trim().toLowerCase().replace(/^@/,'');
      const act=document.getElementById('secAction').value;
      const reason=document.getElementById('secReason').value.trim();
      const st=window.BemoSupport.getSecurityState();
      st.suspended=st.suspended||{};
      st.allowlist=st.allowlist||[];
      st.events=st.events||[];
      if(act==='LIFT_BLOCK'){delete st.suspended[target];}
      else if(act==='TEMP_SUSPEND'){st.suspended[target]={reason,rule:'admin_manual',until:new Date(Date.now()+86400000).toISOString()};}
      else if(act==='ALLOWLIST'){if(!st.allowlist.includes(target))st.allowlist.push(target);}
      else if(act==='REMOVE_ALLOWLIST'){st.allowlist=st.allowlist.filter(x=>x!==target);}
      st.events.unshift({target,action:act,reason,at:new Date().toISOString()});
      window.BemoSupport.saveSecurityState(st);
      e.target.reset();
      drawSecurity();
    });

    if(pSelect&&window.BemoPolicies){
      window.BemoPolicies.loadPolicies().then(rows=>{
        pSelect.replaceChildren();
        for(const p of rows){const o=new Option(p.titleAr,p.slug);pSelect.add(o);}
        const fillPolicy=()=>{const cur=rows.find(x=>x.slug===pSelect.value)||rows[0];if(cur){pTitle.value=cur.titleAr;pBody.value=cur.bodyAr;}};
        pSelect.addEventListener('change',fillPolicy);
        fillPolicy();
        document.getElementById('policyEditorForm')?.addEventListener('submit',e=>{
          e.preventDefault();
          const slug=pSelect.value;
          window.BemoPolicies.saveLocalOverride(slug,{titleAr:pTitle.value.trim(),bodyAr:pBody.value.trim(),version:(rows.find(x=>x.slug===slug)?.version||1)+1});
          pStatus.textContent='تم حفظ وتحديث نص السياسة بنجاح!';
        });
      });
    }

    drawTickets();
    drawSecurity();
  }
  initOperationsHub();
  w.start();
})();
