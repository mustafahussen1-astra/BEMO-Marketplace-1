(() => {
  'use strict';
  let addresses = [], selected = null, draftId = null;
  const keys = ['recipient', 'phone', 'country', 'region', 'city', 'address', 'note'];

  const words = {
    buyer: ['مركز المشتري / عناوين الشحن', 'Buyer Center / Delivery Addresses'],
    title: ['عناوين التوصيل', 'Delivery Addresses'],
    newAddress: ['إضافة عنوان جديد', 'Add New Address'],
    editTitle: ['بيانات العنوان التفصيلي', 'Address Details'],
    label: ['اسم العنوان / التسمية', 'Address Label'],
    recipient: ['اسم المستلم الكامل', 'Recipient Full Name'],
    phone: ['رقم الهاتف للتواصل والتسليم', 'Phone Number'],
    country: ['الدولة', 'Country'],
    region: ['المحافظة / المنطقة', 'Region / State'],
    city: ['المدينة / الحي', 'City / District'],
    address: ['العنوان التفصيلي', 'Full Detailed Address'],
    note: ['ملاحظة التوصيل لمندوب الشحن', 'Delivery Note'],
    save: ['حفظ وتثبيت العنوان', 'Save Address'],
    cancel: ['إلغاء', 'Cancel'],
    backCart: ['العودة لسلة التسوق', 'Back to Shopping Cart'],
    edit: ['تعديل', 'Edit'],
    remove: ['حذف', 'Delete'],
    confirm: ['هل أنت متأكد من حذف هذا العنوان؟', 'Delete this saved address?'],
    empty: ['لم تقم بحفظ أي عناوين بعد. أضف عنوانك الأول لتسريع إتمام الطلبات بنقرة واحدة.', 'No saved addresses yet. Add your first address for one-click checkout.']
  };

  const escapeHtml = str => String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Default sample showcase addresses for demonstration
  const DEMO_ADDRESSES = [
    {
      id: 'demo-addr-1',
      version: 1,
      label: 'المنزل الرئيسي',
      delivery: {
        recipient: 'أحمد عبد الله حسين',
        phone: '+964 770 123 4567',
        country: 'العراق (Iraq)',
        region: 'بغداد',
        city: 'المنصور',
        address: 'شارع الأميرات، مجمع الفردوس، عمارة 12، شقة 4، قرب صيدلية البيلسان',
        note: 'يرجى الاتصال قبل الوصول بـ 15 دقيقة والتسليم عند الباب'
      }
    },
    {
      id: 'demo-addr-2',
      version: 1,
      label: 'مكتب العمل والشركة',
      delivery: {
        recipient: 'أحمد عبد الله حسين',
        phone: '+964 780 987 6543',
        country: 'العراق (Iraq)',
        region: 'بغداد',
        city: 'الكرادة',
        address: 'ساحة الواثق، برج التجارة الدولي، الطابق 6، مكتب BEMO للحلول الرقمية',
        note: 'التسليم من الأحد إلى الخميس من 9 صباحاً حتى 4 مساءً'
      }
    }
  ];

  function getLocalAddresses() {
    try {
      const stored = localStorage.getItem('bemo-user-addresses');
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return DEMO_ADDRESSES;
  }

  function saveLocalAddresses(list) {
    try {
      localStorage.setItem('bemo-user-addresses', JSON.stringify(list));
      // Also sync active address to user profile for instant cart checkout fill
      if (list && list.length > 0) {
        const primary = list[0];
        const profile = {
          name: primary.delivery.recipient,
          phone: primary.delivery.phone,
          city: primary.delivery.city,
          country: primary.delivery.country,
          address: primary.delivery.address
        };
        localStorage.setItem('bemo_user_profile', JSON.stringify(profile));
      }
    } catch (_) {}
  }

  const w = window.BemoWorkspace.create(words, {
    onReady: () => w.run(load),
    onClear: () => {
      // If cleared or unauthenticated, load local showcase addresses
      addresses = getLocalAddresses();
      selected = null;
      draftId = null;
      $('addressForm').reset();
      $('addressEditor').hidden = true;
      $('newAddress').hidden = false;
      render();
    },
    onLanguage: () => {
      render();
      $('checkoutLink').href = w.url('market.html', { view: 'cart' });
    }
  });

  const $ = w.$, n = w.node;

  async function load(req) {
    try {
      const remote = await req('bemo_list_addresses');
      if (remote && remote.length) {
        addresses = remote;
        saveLocalAddresses(remote);
      } else {
        addresses = getLocalAddresses();
      }
    } catch (_) {
      addresses = getLocalAddresses();
    }
    $('newAddress').hidden = false;
    render();
  }

  function edit(a) {
    selected = a;
    draftId = a?.id || crypto.randomUUID();
    $('label').value = a?.label || '';
    for (const k of keys) {
      if ($(k)) $(k).value = a?.delivery?.[k] || '';
    }
    // Set default country from BemoRegion if available
    if (!a && window.BemoRegion) {
      const reg = window.BemoRegion.getRegion();
      $('country').value = reg.nameAr + ' (' + reg.nameEn + ')';
    }
    $('addressEditor').hidden = false;
    $('addressEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('label').focus();
  }

  function render() {
    const listEl = $('addressList');
    if (!listEl) return;
    listEl.replaceChildren();

    if (!addresses || !addresses.length) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'workspace-empty';
      emptyCard.style.gridColumn = '1 / -1';
      emptyCard.style.padding = '40px 20px';
      emptyCard.style.textAlign = 'center';
      emptyCard.style.border = '2px dashed #CBD5E1';
      emptyCard.style.borderRadius = '12px';
      emptyCard.style.background = '#F8FAFC';
      emptyCard.innerHTML = `
        <div style="font-size:42px;margin-bottom:12px;">📍</div>
        <strong style="display:block;font-size:15px;color:#0F172A;margin-bottom:6px;">${w.t('empty')}</strong>
        <p style="color:#64748B;font-size:13px;max-width:400px;margin:0 auto 16px;">أضف عنواناً رئيسياً لتوصيل الطلبات حتى يتم ملء بيانات الشحن في السلة تلقائياً.</p>
        <button type="button" class="primary-button" id="emptyAddBtn" style="background:#FF5000;padding:8px 18px;border-radius:6px;font-weight:700;">
          ➕ إضافة عنوانك الآن
        </button>
      `;
      emptyCard.querySelector('#emptyAddBtn').onclick = () => edit(null);
      listEl.append(emptyCard);
      return;
    }

    addresses.forEach((a, index) => {
      const isDefault = index === 0;
      const card = document.createElement('article');
      card.className = `address-card-modern ${isDefault ? 'is-default' : ''}`;

      card.innerHTML = `
        <div>
          <div class="address-header-row">
            <span class="address-label-pill">
              <span>📍</span> <span>${escapeHtml(a.label || 'عنوان الشحن')}</span>
            </span>
            ${isDefault ? `<span class="address-badge-default">${w.lang() === 'ar' ? 'العنوان الافتراضي ✓' : 'Default Address ✓'}</span>` : ''}
          </div>

          <div class="address-info-line">
            <span style="font-size:16px;">👤</span>
            <div>
              <strong style="color:#0F172A;">${escapeHtml(a.delivery?.recipient || '—')}</strong>
            </div>
          </div>

          <div class="address-info-line">
            <span style="font-size:16px;">📞</span>
            <span dir="ltr" style="font-weight:700;color:#0F172A;">${escapeHtml(a.delivery?.phone || '—')}</span>
          </div>

          <div class="address-info-line">
            <span style="font-size:16px;">🗺️</span>
            <span>${escapeHtml([a.delivery?.city, a.delivery?.region, a.delivery?.country].filter(Boolean).join(' · '))}</span>
          </div>

          <div class="address-info-line" style="margin-top:10px;background:#F8FAFC;padding:10px;border-radius:8px;border:1px solid #E2E8F0;">
            <span style="font-size:16px;">🏠</span>
            <div style="font-size:12px;line-height:1.5;">
              <div style="color:#1E293B;font-weight:500;">${escapeHtml(a.delivery?.address || '—')}</div>
              ${a.delivery?.note ? `<div style="color:#64748B;font-size:11px;margin-top:4px;"><strong>ملاحظة المندوب:</strong> ${escapeHtml(a.delivery.note)}</div>` : ''}
            </div>
          </div>
        </div>

        <div class="address-action-row">
          <button type="button" class="btn-edit-addr" data-action="edit">
            <span>✏️</span> <span>${w.t('edit')}</span>
          </button>
          <button type="button" class="btn-del-addr" data-action="delete">
            <span>🗑️</span> <span>${w.t('remove')}</span>
          </button>
        </div>
      `;

      card.querySelector('[data-action="edit"]').onclick = () => edit(a);

      card.querySelector('[data-action="delete"]').onclick = () => {
        if (card.querySelector('.address-confirm')) return;
        const prompt = document.createElement('div');
        prompt.className = 'address-confirm';
        prompt.style.background = '#FFF1E8';
        prompt.style.border = '1px solid #FED7AA';
        prompt.style.padding = '12px';
        prompt.style.borderRadius = '8px';
        prompt.style.marginTop = '12px';
        prompt.innerHTML = `
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#9A3412;">${w.t('confirm')}</p>
          <div style="display:flex;gap:8px;">
            <button type="button" class="primary-button" id="confirmDelYes" style="background:#DC2626;padding:4px 12px;font-size:12px;border-radius:4px;">
              ${w.t('remove')}
            </button>
            <button type="button" class="secondary-button" id="confirmDelNo" style="padding:4px 12px;font-size:12px;border-radius:4px;">
              ${w.t('cancel')}
            </button>
          </div>
        `;

        prompt.querySelector('#confirmDelYes').onclick = () => {
          if (w.ready()) {
            w.run(async req => {
              await req('bemo_delete_address', { address_id: a.id, expected_version: a.version });
              if (selected?.id === a.id) {
                selected = null;
                $('addressForm').reset();
                $('addressEditor').hidden = true;
              }
              await load(req);
            }, 'saving');
          } else {
            addresses = addresses.filter(item => item.id !== a.id);
            saveLocalAddresses(addresses);
            render();
          }
        };

        prompt.querySelector('#confirmDelNo').onclick = () => prompt.remove();
        card.append(prompt);
      };

      listEl.append(card);
    });
  }

  // Event Listeners
  $('newAddress')?.addEventListener('click', () => {
    edit(null);
  });

  $('cancel')?.addEventListener('click', () => {
    $('addressEditor').hidden = true;
    $('addressForm').reset();
    selected = null;
    draftId = null;
  });

  $('addressForm')?.addEventListener('submit', e => {
    e.preventDefault();
    if (!draftId) draftId = crypto.randomUUID();

    const delivery = {};
    for (const k of keys) {
      if ($(k)) delivery[k] = $(k).value.trim();
    }

    const newObj = {
      id: draftId,
      label: $('label').value.trim(),
      delivery,
      version: (selected?.version || 0) + 1
    };

    if (w.ready()) {
      const args = {
        address_id: draftId,
        label: newObj.label,
        delivery,
        expected_version: selected?.version || 0
      };
      w.run(async req => {
        await req('bemo_save_address', args);
        $('addressForm').reset();
        $('addressEditor').hidden = true;
        selected = null;
        draftId = null;
        await load(req);
      }, 'saving');
    } else {
      // Local fallback
      const existingIdx = addresses.findIndex(item => item.id === draftId);
      if (existingIdx >= 0) {
        addresses[existingIdx] = newObj;
      } else {
        addresses.unshift(newObj);
      }
      saveLocalAddresses(addresses);
      $('addressForm').reset();
      $('addressEditor').hidden = true;
      selected = null;
      draftId = null;
      render();
    }
  });

  $('demoAddressesBtn')?.addEventListener('click', () => {
    $('gate').hidden = true;
    $('workspace').hidden = false;
    $('newAddress').hidden = false;
    addresses = getLocalAddresses();
    render();
  });

  // Initial load
  addresses = getLocalAddresses();
  render();
  w.start();
})();
