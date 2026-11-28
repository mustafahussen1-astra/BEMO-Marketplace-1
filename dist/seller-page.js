/**
 * BEMO Seller Center Controller
 * Controls both Seller Registration Wizard (6SellerRegistration.png)
 * and Seller Center Dashboard (5SellerCenterDashboard.png)
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.BemoAccount;
  const live = window.BemoLive;
  const params = new URL(location.href).searchParams;
  let lang = params.get('lang') === 'en' ? 'en' : 'ar';
  let isDemo = false;

  const states = {
    PENDING_SELLER: ['بانتظار القبول', 'Awaiting acceptance'],
    ESCALATED_TO_SUPPORT: ['متابعة الدعم', 'Support review'],
    ACCEPTED: ['مقبول', 'Accepted'],
    PACKING: ['قيد التجهيز', 'Packing'],
    SHIPPED: ['تم الشحن', 'Shipped'],
    DELIVERY_ATTEMPTED: ['محاولة توصيل', 'Delivery attempted'],
    DELIVERED: ['تم التسليم', 'Delivered'],
    REJECTED_BY_SELLER: ['مرفوض', 'Rejected'],
    CANCELLED_BY_BUYER_PRE_ACCEPT: ['ملغى', 'Cancelled'],
    CLOSED: ['مغلق', 'Closed']
  };

  function language() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    $('languageButton').textContent = lang === 'ar' ? 'English' : 'العربية';
  }

  function renderDashboard(store, dashData = null) {
    $('gate').hidden = true;
    $('registrationWizard').hidden = true;
    $('sellerDashboardLayout').hidden = false;

    // Sidebar Brand Info
    const storeTitle = store.title || 'Noor Store';
    const storeSlug = store.slug || 'noor_store';
    const initials = storeTitle.slice(0, 2).toUpperCase();

    $('shopTitle').textContent = storeTitle;
    $('sideStoreTitle').textContent = storeTitle;
    $('sideStoreSlug').textContent = `@${storeSlug}`;
    $('sideStoreAvatar').textContent = initials;
    $('publicStorefrontLink').href = `store.html?store=${storeSlug}&lang=${lang}`;

    const cur = window.BemoRegion ? window.BemoRegion.getRegion().currency : 'IQD';
    const sym = window.BemoRegion ? (lang === 'ar' ? window.BemoRegion.getRegion().symbolAr : window.BemoRegion.getRegion().symbolEn) : 'د.ع';

    // Synthetic or DB data
    const data = dashData || {
      products: 18,
      orders: 342,
      pending: 5,
      low_stock: 2,
      sales_total: 124500,
      trend: [
        { day: '01', orders: 12 }, { day: '02', orders: 18 }, { day: '03', orders: 15 },
        { day: '04', orders: 24 }, { day: '05', orders: 28 }, { day: '06', orders: 22 },
        { day: '07', orders: 35 }, { day: '08', orders: 30 }, { day: '09', orders: 42 },
        { day: '10', orders: 38 }, { day: '11', orders: 48 }, { day: '12', orders: 52 },
        { day: '13', orders: 45 }, { day: '14', orders: 60 }
      ],
      recent_orders: [
        { id: 'bemo-ord-894102', state: 'PENDING_SELLER', total_minor: 48000, currency: cur, created_at: new Date().toISOString() },
        { id: 'bemo-ord-723145', state: 'PENDING_SELLER', total_minor: 72000, currency: cur, created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: 'bemo-ord-551982', state: 'ACCEPTED', total_minor: 125000, currency: cur, created_at: new Date(Date.now() - 86400000).toISOString() },
        { id: 'bemo-ord-412891', state: 'SHIPPED', total_minor: 35000, currency: cur, created_at: new Date(Date.now() - 172800000).toISOString() },
        { id: 'bemo-ord-309182', state: 'DELIVERED', total_minor: 95000, currency: cur, created_at: new Date(Date.now() - 259200000).toISOString() }
      ],
      cod_by_currency: [
        { currency: cur, total_minor: 12450000 }
      ]
    };

    // KPIs
    $('kpiSales').textContent = `${(data.sales_total || 124500).toLocaleString()} ${sym}`;
    $('kpiOrders').textContent = `${data.orders || 342} ${lang === 'ar' ? 'طلب' : 'orders'}`;
    $('kpiProducts').textContent = `${data.products || 18} ${lang === 'ar' ? 'منتج' : 'products'}`;

    // 14-day Trend Chart
    const trendEl = $('trend');
    trendEl.replaceChildren();
    const maxOrders = Math.max(1, ...data.trend.map(d => d.orders));
    for (const d of data.trend) {
      const bar = document.createElement('div');
      bar.className = 'sales-bar';
      bar.style.height = `${Math.max(8, (d.orders / maxOrders) * 100)}%`;
      bar.title = `${d.day}: ${d.orders} orders`;
      bar.innerHTML = `<span style="font-size:9px;">${d.orders}</span>`;
      trendEl.appendChild(bar);
    }
    const totalTrend = data.trend.reduce((sum, d) => sum + d.orders, 0);
    $('trendSummary').textContent = `${totalTrend} طلب مسجل خلال فترة الـ 14 يوماً السابقة`;

    // Recent Orders
    const recentEl = $('recent');
    recentEl.replaceChildren();
    for (const o of data.recent_orders) {
      const row = document.createElement('div');
      row.className = 'recent-order';
      const stateLabel = (states[o.state] || [o.state, o.state])[lang === 'ar' ? 0 : 1];
      const isPending = o.state === 'PENDING_SELLER';
      row.innerHTML = `
        <a href="orders.html?view=seller&id=${o.id}" style="color:#2563EB;font-weight:700;">#${o.id.slice(0, 12)}</a>
        <span class="order-pill" style="background:${isPending ? '#FFF1F2;color:#BE123C;border:1px solid #FECDD3;' : '#DCFCE7;color:#15803D;'}">${stateLabel}</span>
        <strong style="color:#171717;">${(o.total_minor / 100).toLocaleString()} ${o.currency}</strong>
        <span style="font-size:12px;color:#888;">${new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }).format(new Date(o.created_at))}</span>
      `;
      recentEl.appendChild(row);
    }

    // COD Totals
    const codEl = $('codTotals');
    codEl.replaceChildren();
    for (const r of data.cod_by_currency) {
      const span = document.createElement('span');
      span.textContent = `${(r.total_minor / 100).toLocaleString()} ${r.currency}`;
      codEl.appendChild(span);
    }
  }

  function showRegistrationWizard(profile) {
    $('gate').hidden = true;
    $('sellerDashboardLayout').hidden = true;
    $('registrationWizard').hidden = false;

    if (profile) {
      if ($('legalName') && !$('legalName').value) $('legalName').value = profile.display_name || '';
      if ($('newStorePhone') && !$('newStorePhone').value) $('newStorePhone').value = profile.phone || '';
      try {
        const saved = JSON.parse(localStorage.getItem('bemo-profile-defaults') || '{}');
        if (saved.city && $('pickupCity')) $('pickupCity').value = saved.city;
        if (saved.address && $('pickupStreet')) $('pickupStreet').value = saved.address;
      } catch (_) {}
    }
  }

  // Handle Store Registration Submission
  $('sellerRegisterForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = $('newStoreTitle').value.trim();
    const slug = $('newStoreSlug').value.trim().toLowerCase();
    const desc = $('newStoreDesc').value.trim();
    const phone = $('newStorePhone').value.trim();
    const legalName = $('legalName').value.trim();
    const address = `${$('pickupCity').value.trim()} — ${$('pickupStreet').value.trim()}`;
    const agreement = $('sellerAgreement').checked;

    if (!title || !slug || !agreement) return;

    const input = {
      title,
      slug,
      description: desc,
      registration: {
        legal_name: legalName,
        phone,
        address,
        logo: $('newStoreLogo')?.files?.[0] || null,
        cover: $('newStoreCover')?.files?.[0] || null,
        document: $('idFrontFile')?.files?.[0] || null,
        accepted: true
      }
    };

    $('status').textContent = lang === 'ar' ? 'جارٍ تسجيل المتجر وتوثيق البيانات…' : 'Registering store…';
    $('submitStoreBtn').disabled = true;

    try {
      if (api && api.getState().phase === 'ready') {
        const res = await api.createStore(input);
        if (res.error) throw res.error;
        window.BemoToast?.(lang === 'ar' ? 'تم إنشاء متجرك بنجاح!' : 'Store created successfully!');
        renderDashboard(res.store || { title, slug });
      } else {
        // Local fallback for immediate testing
        const localStore = { id: `store-${Date.now()}`, title, slug, description: desc, status: 'ACTIVE' };
        localStorage.setItem('bemo-local-store', JSON.stringify(localStore));
        window.BemoToast?.(lang === 'ar' ? 'تم إنشاء وتفعيل متجرك بنجاح!' : 'Store created successfully!');
        renderDashboard(localStore);
      }
    } catch (err) {
      $('error').textContent = err?.message || (lang === 'ar' ? 'تعذّر إكمال التسجيل. تحقق من البيانات.' : 'Registration failed.');
      $('error').hidden = false;
    } finally {
      $('status').textContent = '';
      $('submitStoreBtn').disabled = false;
    }
  });

  // Demo Seller Preview Button
  $('demoSellerBtn')?.addEventListener('click', () => {
    isDemo = true;
    renderDashboard({
      title: lang === 'ar' ? 'متجر النور الرسمي' : 'Noor Official Store',
      slug: 'noor_store'
    });
  });

  // Open Wizard directly
  $('openWizardBtn')?.addEventListener('click', () => {
    showRegistrationWizard(null);
  });

  // Language button
  $('languageButton')?.addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    language();
    const state = api?.getState();
    if (state?.store) renderDashboard(state.store);
  });

  // Initialize
  language();

  if (api) {
    api.subscribe(s => {
      if (isDemo) return;
      if (s.phase === 'ready') {
        if (s.store) {
          // Has existing store -> show dashboard
          renderDashboard(s.store);
          // Try to load real metrics from backend if merchant scope available
          try {
            api.merchantScope().request('bemo_seller_dashboard', {}).then(res => {
              if (res && res.data) renderDashboard(s.store, res.data);
            }).catch(() => {});
          } catch (_) {}
        } else {
          // Authenticated but no store -> show registration wizard (6SellerRegistration.png)
          showRegistrationWizard(s.profile);
        }
      } else if (['guest', 'blocked', 'error'].includes(s.phase)) {
        if (new URLSearchParams(location.search).get('step') === 'register') {
          showRegistrationWizard(null);
          return;
        }
        // Check if there is a local store from testing
        try {
          const localStore = JSON.parse(localStorage.getItem('bemo-local-store') || 'null');
          if (localStore) {
            renderDashboard(localStore);
            return;
          }
        } catch (_) {}
        $('gate').hidden = false;
        $('registrationWizard').hidden = true;
        $('sellerDashboardLayout').hidden = true;
      }
    });
    window.addEventListener('bemo:region-change', () => renderDashboard());
    api.initialize();
  }
})();
