/* Enhanced BEMO Top-ups and Manual Bank Transfer Flow */
window.BemoTopups = function(w) {
  const panel = document.createElement('section');
  panel.className = 'account-card topup-card';
  w.$('workspace').prepend(panel);
  let mine = null, queue = null;
  const text = (ar, en) => w.lang() === 'ar' ? ar : en;
  const node = (tag, value, cls) => {
    const el = document.createElement(tag);
    if (value) el.textContent = value;
    if (cls) el.className = cls;
    return el;
  };

  function input(form, labelText, name, required = true) {
    const field = node('label', labelText, 'balance-field');
    const control = node('input');
    control.name = name;
    control.required = required;
    field.append(control);
    form.append(field);
    return control;
  }

  function render() {
    panel.replaceChildren();
    if (mine) {
      const heading = node('div', undefined, 'section-heading');
      heading.append(node('h2', text('شحن الرصيد بحوالة بنكية يدوية', 'Manual Bank Transfer Top-Up')));
      panel.append(heading);

      // Store username reference banner
      const refBanner = node('div', undefined, 'dialog-note');
      refBanner.style.background = 'var(--bemo-primary-soft)';
      refBanner.style.border = '1px solid var(--bemo-primary)';
      refBanner.style.borderRadius = '8px';
      refBanner.style.padding = '12px 16px';
      refBanner.style.marginBottom = '16px';
      refBanner.innerHTML = `
        <strong style="color:var(--bemo-primary);display:block;margin-bottom:4px;">
          ⚠️ ${text('تنبيه هام للتحويل:', 'Important transfer note:')}
        </strong>
        <span>${text('يجب كتابة معرّف متجرك حصراً في خانة الملاحظات/وصف الحوالة: ', 'You must include your store username in the transfer reference: ')}</span>
        <code style="background:var(--bemo-surface);padding:3px 8px;border-radius:4px;font-weight:700;color:var(--bemo-text);border:1px solid var(--bemo-border);">@${mine.slug}</code>
        <button type="button" id="copySlugBtn" class="btn btn-outline" style="min-height:28px;padding:2px 8px;font-size:11px;margin-inline-start:8px;">
          ${text('نسخ المعرّف', 'Copy')}
        </button>
      `;
      panel.append(refBanner);
      refBanner.querySelector('#copySlugBtn').onclick = () => {
        navigator.clipboard.writeText(mine.slug);
        window.BemoToast?.(text('تم نسخ معرّف المتجر', 'Store username copied'));
      };

      // Form
      const form = node('form', undefined, 'account-form');
      const senderName = input(form, text('اسم صاحب الحساب المحوِّل (رباعي أو اسم الشركة)', 'Sender / Account Holder Name'), 'sender_name', true);
      senderName.placeholder = text('مثال: أحمد عبد الله حسين', 'e.g. John Doe LLC');

      const amount = input(form, text('مبلغ الحوالة بدقة', 'Exact Transfer Amount'), 'amount', true);
      amount.inputMode = 'decimal';
      amount.placeholder = text('مثال: 50000', 'e.g. 50000');

      const currencyRow = node('div', undefined, 'balance-field');
      currencyRow.append(node('span', text('عملة الحوالة', 'Transfer currency')));
      const currency = node('select');
      currency.setAttribute('aria-label', text('عملة الحوالة', 'Transfer currency'));
      for (const c of BemoLive.currencies) currency.add(new Option(c, c));
      currencyRow.append(currency);
      form.append(currencyRow);

      const bankRow = node('div', undefined, 'balance-field');
      bankRow.append(node('span', text('الحساب البنكي / المحفظة المستلمة', 'Receiving Account')));
      const bank = node('select');
      const instructions = node('p', undefined, 'field-help');
      for (const b of mine.banks) bank.add(new Option(b.bank + ' · ' + b.currency, b.id));
      if (mine.banks.length) {
        bankRow.append(bank, instructions);
        currency.disabled = true;
        const updateBankInfo = () => {
          const b = mine.banks.find(v => v.id === bank.value);
          if (b) {
            currency.value = b.currency;
            instructions.innerHTML = `<strong>${text('المستفيد: ', 'Beneficiary: ')}</strong>${b.beneficiary} | <strong>${text('رقم الحساب: ', 'Account: ')}</strong>${b.account_number} <br><small>${b.instructions || ''}</small>`;
          }
        };
        updateBankInfo();
        bank.onchange = updateBankInfo;
      }
      form.append(bankRow);

      const ref = input(form, text('رقم الإشعار أو مرجع الحوالة البنكية', 'Bank Transfer Reference / Transaction ID'), 'reference', true);
      ref.minLength = 3;
      ref.maxLength = 80;
      ref.placeholder = text('مثال: TRX-8912301', 'e.g. TRX-8912301');

      const note = input(form, text('ملاحظات إضافية (اختياري)', 'Additional Notes (optional)'), 'note', false);
      note.maxLength = 500;

      const proofField = node('div', undefined, 'balance-field');
      proofField.append(node('span', text('صورة أو ملف إشعار التحويل (وصل الحوالة الإلزامي)', 'Transfer Receipt / Slip (Required)')));
      const proof = node('input');
      proof.type = 'file';
      proof.required = true;
      proof.accept = 'image/jpeg,image/png,application/pdf';
      proofField.append(proof);
      form.append(proofField);

      const submit = node('button', text('إرسال طلب الشحن للمراجعة والاعتماد', 'Submit Top-up Request for Review'), 'btn btn-primary');
      submit.type = 'submit';
      submit.style.width = '100%';
      submit.style.marginTop = '12px';
      form.append(submit);

      form.onsubmit = e => {
        e.preventDefault();
        w.run(async req => {
          let receipt_path = null;
          if (proof.files[0]) {
            receipt_path = await BemoAccount.transferProof(proof.files[0]);
          }
          await req('bemo_topups', {
            operation: 'SUBMIT',
            input: {
              amount_minor: BemoLive.priceMinor(amount.value, currency.value),
              currency: currency.value,
              bank_id: bank.value || null,
              reference: ref.value.trim(),
              note: [senderName.value.trim(), note.value.trim()].filter(Boolean).join(' | '),
              receipt_path
            }
          });
          window.BemoToast?.(text('تم إرسال طلب الشحن بنجاح وهو قيد مراجعة الإدارة', 'Top-up request submitted for review'));
          await load(req, Boolean(queue), true);
        }, 'saving');
      };

      panel.append(form);

      // Past requests table
      const historyTitle = node('h3', text('سجل طلبات الشحن الخاصة بك', 'Your Top-Up History'));
      historyTitle.style.marginTop = '24px';
      panel.append(historyTitle);

      if (!mine.rows || !mine.rows.length) {
        panel.append(node('p', text('لا توجد طلبات شحن سابقة', 'No past top-up requests'), 'live-empty'));
      } else {
        const table = node('div', undefined, 'recent-orders');
        for (const r of mine.rows) {
          table.append(renderTopupRow(r));
        }
        panel.append(table);
      }
    }

    if (queue) {
      const adminHeading = node('div', undefined, 'section-heading');
      adminHeading.append(node('h2', text('إدارة طلبات الشحن المعلقة (لوحة الإدارة)', 'Pending Top-Ups Queue (Admin)')));
      panel.append(adminHeading);

      if (!queue.rows.length) {
        panel.append(node('p', text('لا توجد طلبات شحن معلقة حالياً ✅', 'No pending top-up requests'), 'live-empty'));
      }

      for (const r of queue.rows) {
        const itemBox = node('div', undefined, 'order-list');
        const card = node('article', undefined, 'account-card');
        card.style.border = '1px solid var(--bemo-border)';
        card.style.marginBottom = '12px';
        card.append(renderTopupRow(r));

        if (r.receipt_path) {
          const viewReceiptBtn = node('button', text('🔍 معاينة وصل التحويل المرفوع', 'View Transfer Receipt'), 'btn btn-outline');
          viewReceiptBtn.style.margin = '8px 0';
          viewReceiptBtn.onclick = () => w.run(async () => {
            const url = await BemoAccount.transferProof(r.receipt_path);
            window.open(url, '_blank');
          });
          card.append(viewReceiptBtn);
        }

        const actionForm = node('form', undefined, 'account-form');
        actionForm.style.marginTop = '10px';
        const reasonInput = input(actionForm, text('سبب القرار أو ملاحظة الاعتماد/الرفض (20 حرف على الأقل)', 'Decision / Rejection Reason (min 20 chars)'), 'reason', true);
        reasonInput.minLength = 20;
        reasonInput.maxLength = 1000;
        reasonInput.placeholder = text('اكتب توضيح التدقيق لمطابقة الحوالة...', 'Provide audit note verifying the transfer...');

        const btnGroup = node('div', undefined, 'form-actions');
        const approveBtn = node('button', text('✅ اعتماد الحوالة وإضافة الرصيد', 'Approve & Credit Balance'), 'btn btn-success');
        approveBtn.value = 'APPROVE';
        const rejectBtn = node('button', text('❌ رفض الطلب', 'Reject'), 'btn btn-danger');
        rejectBtn.value = 'REJECT';

        btnGroup.append(approveBtn, rejectBtn);
        actionForm.append(btnGroup);

        actionForm.onsubmit = e => {
          e.preventDefault();
          const operation = e.submitter?.value;
          if (!operation) return;
          w.run(async req => {
            await req('bemo_topups', {
              operation,
              input: { id: r.id, reason: reasonInput.value.trim() }
            });
            window.BemoToast?.(text('تم تحديث حالة الحوالة بنجاح', 'Transfer updated successfully'));
            await load(req, true, Boolean(mine));
          }, 'saving');
        };

        card.append(actionForm);
        itemBox.append(card);
        panel.append(itemBox);
      }
    }
  }

  function renderTopupRow(r) {
    const states = {
      PENDING: { label: text('قيد المراجعة ⏳', 'Pending ⏳'), cls: 'order-state' },
      APPROVED: { label: text('معتمد ومضاف للرصيد ✅', 'Approved ✅'), cls: 'order-state' },
      REJECTED: { label: text('مرفوض ❌', 'Rejected ❌'), cls: 'order-state' }
    };
    const stateKey = r.state || r.status || 'PENDING';
    const s = states[stateKey] || { label: stateKey, cls: 'order-state' };
    const rowEl = node('div', undefined, 'strip-item-card');
    rowEl.style.display = 'block';
    rowEl.style.textAlign = 'start';
    rowEl.style.width = '100%';
    rowEl.style.marginBottom = '6px';
    rowEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>@${r.slug} — <span style="color:var(--bemo-primary);font-size:15px;">${BemoLive.money(r.amount_minor, r.currency, w.lang())}</span></strong>
        <span class="${s.cls}">${s.label}</span>
      </div>
      <p style="margin:4px 0;font-size:12px;color:var(--bemo-muted);">
        ${text('المرجع: ', 'Ref: ')} <code>${r.reference}</code> | ${text('التاريخ: ', 'Date: ')} ${new Intl.DateTimeFormat(w.lang(), {dateStyle:'medium', timeStyle:'short'}).format(new Date(r.created_at))}
      </p>
      ${r.note ? `<p style="margin:2px 0;font-size:12px;"><strong>${text('المعلومات: ', 'Details: ')}</strong>${r.note}</p>` : ''}
      ${r.decision_note ? `<p style="margin:2px 0;font-size:12px;color:var(--bemo-text);background:var(--bemo-surface-secondary);padding:4px 8px;border-radius:4px;"><strong>${text('قرار الإدارة: ', 'Admin note: ')}</strong>${r.decision_note}</p>` : ''}
    `;
    return rowEl;
  }

  function renderDemo(slug = 'noor_store') {
    mine = {
      slug,
      banks: [
        {
          id: 'bank-1',
          bank: text('مصرف الرافدين / محفظة زين كاش', 'Rafidain Bank / ZainCash'),
          currency: 'IQD',
          beneficiary: 'منصة BEMO للتجارة الإلكترونية',
          account_number: 'IQ98BEMO000192837465',
          instructions: text('يرجى كتابة معرّف المتجر في خانة ملاحظات الحوالة', 'Please write your store username in transfer notes')
        }
      ],
      rows: [
        {
          id: 'top-101',
          slug,
          amount_minor: 10000000,
          currency: 'IQD',
          status: 'APPROVED',
          reference: 'TRX-9981204',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          decision_note: text('تم فحص الوصل ومطابقة الحساب وإيداع الرصيد بنجاح.', 'Receipt verified and balance deposited.')
        }
      ]
    };
    render();
  }

  async function load(req, staff, merchant) {
    const nextMine = merchant ? await req('bemo_topups', { operation: 'MINE' }) : null;
    const nextQueue = staff ? await req('bemo_topups', { operation: 'QUEUE' }) : null;
    mine = nextMine;
    queue = nextQueue;
    render();
  }

  return { load, render, renderDemo, clear() { mine = null; queue = null; panel.replaceChildren(); } };
};
