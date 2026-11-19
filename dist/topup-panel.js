window.BemoTopups = function(w) {
  const panel = document.createElement('section');
  panel.className = 'account-card';
  w.$('workspace').prepend(panel);
  let mine = null, queue = null;
  const text = (ar,en) => w.lang()==='ar' ? ar : en;
  const node = (tag,value) => { const el=document.createElement(tag); if(value) el.textContent=value; return el; };
  function input(form,label,name,required=true) {
    const field=node('label',label), control=node('input');
    control.name=name;control.required=required;field.append(control);form.append(field);return control;
  }
  function render() {
    panel.replaceChildren();
    if(mine) {
      panel.append(node('h2',text('طلب شحن الرصيد','Request a top-up')));
      const hint=node('p',text('اكتب معرّف متجرك في وصف الحوالة: ','Include your store username in the bank reference: ')+mine.slug);
      const copy=node('button',text('نسخ المعرّف','Copy username'));
      copy.type='button';copy.onclick=()=>navigator.clipboard.writeText(mine.slug).catch(()=>{});
      panel.append(hint,copy);
      const form=node('form');form.className='account-form';
      const amount=input(form,text('مبلغ الحوالة','Transfer amount'),'amount');amount.inputMode='decimal';
      const currency=node('select');currency.setAttribute('aria-label',text('عملة الحوالة','Transfer currency'));
      for(const c of BemoLive.currencies)currency.add(new Option(c,c));form.append(currency);
      const bank=node('select'),instructions=node('p');bank.setAttribute('aria-label',text('الحساب المستلم','Receiving account'));
      for(const b of mine.banks)bank.add(new Option(b.bank+' · '+b.currency,b.id));
      if(mine.banks.length){
        form.append(bank,instructions);currency.disabled=true;
        const show=()=>{const b=mine.banks.find(v=>v.id===bank.value);currency.value=b.currency;instructions.textContent=[b.beneficiary,b.account_number,b.instructions].filter(Boolean).join(' · ');};
        show();bank.onchange=show;
      }
      const ref=input(form,text('مرجع الحوالة البنكية','Bank transfer reference'),'reference');ref.minLength=3;ref.maxLength=80;
      const note=input(form,text('البنك والملاحظات','Bank and notes'),'note',false);note.maxLength=500;
      const proof=input(form,text('إيصال الحوالة (اختياري، حتى 5 ميغابايت)','Transfer receipt (optional, up to 5 MB)'),'receipt',false);
      proof.type='file';proof.accept='image/jpeg,image/png,application/pdf';
      const submit=node('button',text('إرسال للمراجعة','Submit for review'));submit.className='primary-button';form.append(submit);
      form.onsubmit=e=>{e.preventDefault();w.run(async req=>{
        const receipt_path=proof.files[0]?await BemoAccount.transferProof(proof.files[0]):null;
        await req('bemo_topups',{operation:'SUBMIT',input:{amount_minor:BemoLive.priceMinor(amount.value,currency.value),currency:currency.value,bank_id:bank.value||null,reference:ref.value,note:note.value,receipt_path}});
        await load(req,Boolean(queue),true);
      },'saving');};
      panel.append(form);
      for(const r of mine.rows)panel.append(row(r));
    }
    if(queue) {
      const details=node('details');details.append(node('summary',text('حسابات استقبال الحوالات','Receiving bank accounts')));
      const form=node('form');form.className='account-form';
      for(const [key,label] of [['bank',text('البنك','Bank')],['beneficiary',text('المستفيد','Beneficiary')],['account_number',text('رقم الحساب أو IBAN','Account number or IBAN')],['instructions',text('تعليمات التحويل','Transfer instructions')]])input(form,label,key,key!=='instructions');
      const code=node('select');for(const c of BemoLive.currencies)code.add(new Option(c,c));form.append(code);
      const enabled=input(form,text('الحساب متاح للتحويل','Enabled for transfers'),'enabled',false);enabled.type='checkbox';enabled.checked=true;
      for(const bank of queue.banks){const edit=node('button',bank.bank+' · '+bank.account_number);edit.type='button';edit.onclick=()=>{for(const k of ['bank','beneficiary','account_number','instructions'])form.elements[k].value=bank[k];code.value=bank.currency;enabled.checked=bank.enabled;};details.append(edit);}
      form.append(node('button',text('حفظ الحساب','Save account')));details.append(form);panel.append(details);
      form.onsubmit=e=>{e.preventDefault();w.run(async req=>{await req('bemo_topups',{operation:'BANK',input:{...Object.fromEntries(new FormData(form)),currency:code.value,enabled:enabled.checked}});await load(req,true,Boolean(mine));},'saving');};
      panel.append(node('h2',text('طلبات الشحن المعلقة','Pending top-ups')));
      if(!queue.rows.length)panel.append(node('p',text('لا توجد طلبات معلقة','No pending requests')));
      for(const r of queue.rows) {
        panel.append(row(r));
        if(r.receipt_path) {
          const receipt=node('button',text('عرض الإيصال','View receipt'));
          receipt.onclick=()=>w.run(async()=>{const url=await BemoAccount.transferProof(r.receipt_path);
            const link=node('a',text('فتح الإيصال','Open receipt'));link.href=url;link.target='_blank';link.rel='noopener noreferrer';receipt.replaceWith(link);});
          panel.append(receipt);
        }
        const form=node('form');form.className='account-form';
        const reason=input(form,text('سبب قرار المراجعة','Review decision reason'),'reason');reason.minLength=20;reason.maxLength=1000;
        for(const [value,label] of [['APPROVE',text('اعتماد الحوالة','Approve transfer')],['REJECT',text('رفض','Reject')]]) {
          const b=node('button',label);b.value=value;form.append(b);
        }
        form.onsubmit=e=>{e.preventDefault();const operation=e.submitter?.value;if(!operation)return;
          w.run(async req=>{await req('bemo_topups',{operation,input:{id:r.id,reason:reason.value}});await load(req,true,Boolean(mine));},'saving');};
        panel.append(form);
      }
    }
  }
  function row(r) {
    const state={PENDING:text('قيد المراجعة','Pending'),APPROVED:text('معتمد','Approved'),REJECTED:text('مرفوض','Rejected')};
    return node('p',[r.slug,BemoLive.money(r.amount_minor,r.currency,w.lang()),r.reference,state[r.state],r.note,r.decision_note].filter(Boolean).join(' · '));
  }
  async function load(req,staff,merchant) {
    const nextMine=merchant?await req('bemo_topups',{operation:'MINE'}):null;
    const nextQueue=staff?await req('bemo_topups',{operation:'QUEUE'}):null;
    mine=nextMine;queue=nextQueue;render();
  }
  return {load,render,clear(){mine=null;queue=null;panel.replaceChildren();}};
};
