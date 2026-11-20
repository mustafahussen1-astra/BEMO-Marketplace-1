/**
 * BEMO Commercial Buyer Center, Multi-Vendor Cart & Checkout Controller
 * Matches BEMOBuyerCenterCartCheckoutOrders.png
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const live = window.BemoLive;
  const api = window.BemoAccount;
  const params = new URL(location.href).searchParams;

  let lang = params.get('lang') === 'en' ? 'en' : 'ar';
  let appliedDiscount = 0;
  let promoCode = '';

  const words = {
    skip: ['انتقل إلى المحتوى', 'Skip to content'],
    flashPromo: ['تخفيضات كبرى حتى 70% + دفع عند الاستلام لجميع الطلبات', 'Mega Sale up to 70% off + COD for all orders'],
    sellerCenter: ['المتجر', 'Store'],
    help: ['المساعدة', 'Help'],
    search: ['بحث', 'Search'],
    orders: ['طلباتي', 'My Orders'],
    account: ['حسابي', 'Account'],
    kicker: ['مركز المشتري BEMO', 'BEMO BUYER CENTER'],
    cartView: ['سلة التسوق وإتمام الطلب', 'Shopping Bag & Checkout'],
    stepCart: ['سلة المنتجات', 'Bag'],
    stepAddress: ['بيانات التوصيل', 'Shipping'],
    stepConfirm: ['تأكيد COD', 'COD Confirm'],
    cart: ['المنتجات في سلتك', 'Items in your bag'],
    stockNotice: ['ℹ️ الدفع عند الاستلام مستقل لكل متجر. إضافة المنتج للسلة لا تحجز المخزون إلا بعد قبول التاجر لطلبك.', 'ℹ️ COD is paid per seller on arrival. Adding to bag does not reserve stock until seller accepts.'],
    deliveryTitle: ['عنوان التوصيل والتواصل', 'Delivery & Contact Details'],
    manageAddresses: ['إدارة العناوين ↗', 'Manage Addresses ↗'],
    savedAddressLabel: ['اختر من عناوينك المحفوظة:', 'Choose from saved addresses:'],
    recipient: ['اسم المستلم الكامل *', 'Full recipient name *'],
    phone: ['رقم الهاتف (للتواصل والتوصيل) *', 'Contact phone number *'],
    country: ['الدولة *', 'Country *'],
    region: ['المحافظة / المنطقة *', 'Region / Governorate *'],
    city: ['المدينة / الحي *', 'City / District *'],
    address: ['العنوان التفصيلي (الشارع، رقم المبنى، أقرب معلم مميز) *', 'Detailed address (Street, building, landmark) *'],
    note: ['ملاحظة توصيل للمندوب (اختيارية)', 'Delivery note (optional)'],
    privacy: ['حماية خصوصية المشتري: لن يرى التاجر اسمك أو رقم هاتفك أو عنوانك التفصيلي حتى يقبل طلبه ويؤكد توفر المخزون. المبلغ يُدفع نقدًا للتاجر أو مندوبه عند الاستلام.', 'Buyer Privacy: The seller cannot view your name, phone, or exact address until they accept the order. Pay cash on delivery; BEMO does not hold your money.'],
    paymentTitle: ['طريقة الدفع', 'Payment Method'],
    summary: ['ملخص الطلب', 'Order Summary'],
    subtotal: ['إجمالي المنتجات:', 'Products subtotal:'],
    platformFee: ['عمولة منصة BEMO:', 'BEMO platform fee:'],
    grandTotal: ['الإجمالي عند الاستلام:', 'Total payable on delivery:'],
    confirm: ['أوافق على تفاصيل التوصيل والشروط والدفع عند الاستلام لكل متجر.', 'I agree to delivery details, terms, and COD payment per store.'],
    place: ['إتمام الطلب — الدفع عند الاستلام ➔', 'Place COD order ➔'],
    trackOrders: ['متابعة في قائمة طلباتي ➔', 'Track in My Orders ➔'],
    keepShopping: ['متابعة التسوق في BEMO', 'Continue Shopping'],
    successTitle: ['تم إنشاء وإرسال طلبك بنجاح!', 'Your order has been placed successfully!'],
    successSub: ['أُرسل إشعار فوري إلى المتاجر لمراجعة توفر المخزون وبدء تجهيز الشحنات.', 'Instant notification sent to sellers to confirm inventory and prepare delivery.'],
    emptyCartTitle: ['سلتك فارغة حالياً', 'Your bag is empty'],
    emptyCartCopy: ['تصفح تشكيلتنا المميزة من المنتجات والعروض الحصرية وابدأ التسوق الآن!', 'Explore our featured products and great deals to start shopping!'],
    startShopping: ['ابدأ التسوق الآن ➔', 'Start shopping now ➔'],
    remove: ['حذف', 'Remove'],
    inStock: ['متوفر بالمخزون', 'In stock'],
    promoValid: ['تم تطبيق خصم 10% بنجاح!', '10% discount applied successfully!'],
    promoInvalid: ['كود الخصم غير صحيح أو منتهي', 'Invalid or expired promo code'],
    requiredFields: ['يرجى ملء جميع الحقول الإلزامية لعنوان التوصيل', 'Please fill in all required delivery fields'],
    consentRequired: ['يرجى الموافقة على شروط الطلب والدفع عند الاستلام', 'Please confirm order and COD terms']
  };

  const t = k => words[k]?.[lang === 'ar' ? 0 : 1] || k;

  function formatMoney(amount, currency = 'USD') {
    if (window.BemoRegion && typeof amount === 'number') {
      return window.BemoRegion.formatMoney(amount, lang !== 'en');
    }
    if (typeof amount !== 'number') return `$${amount}`;
    if (currency === 'USD') return `$${amount.toFixed(2)}`;
    if (currency === 'EGP') return `${Math.round(amount)} EGP`;
    if (currency === 'SAR') return `${amount.toFixed(2)} ر.س`;
    if (currency === 'IQD') return `${Math.round(amount).toLocaleString()} د.ع`;
    return `${amount.toFixed(2)} ${currency}`;
  }

  function language() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-t]').forEach(n => {
      n.textContent = t(n.dataset.t);
    });
    $('languageButton').textContent = lang === 'ar' ? 'English' : 'العربية';
    const url = new URL(location.href);
    url.searchParams.set('lang', lang);
    history.replaceState(null, '', url);
    renderCart();
  }

  // Load Saved Profile / Defaults
  function loadSavedAddress() {
    try {
      const saved = JSON.parse(localStorage.getItem('bemo-profile-defaults') || '{}');
      if (saved.recipient && !$('recipient').value) $('recipient').value = saved.recipient;
      if (saved.phone && !$('phone').value) $('phone').value = saved.phone;
      if (saved.country && !$('country').value) $('country').value = saved.country;
      if (saved.region && !$('region').value) $('region').value = saved.region;
      if (saved.city && !$('city').value) $('city').value = saved.city;
      if (saved.address && !$('address').value) $('address').value = saved.address;
    } catch (_) {}
  }

  function saveCurrentAddress() {
    try {
      const data = {
        recipient: $('recipient').value.trim(),
        phone: $('phone').value.trim(),
        country: $('country').value.trim(),
        region: $('region').value.trim(),
        city: $('city').value.trim(),
        address: $('address').value.trim()
      };
      localStorage.setItem('bemo-profile-defaults', JSON.stringify(data));
    } catch (_) {}
  }

  // Auto-save address inputs on blur
  ['recipient', 'phone', 'country', 'region', 'city', 'address'].forEach(id => {
    $(id)?.addEventListener('blur', saveCurrentAddress);
  });

  // Resolve item details against catalog
  function resolveItem(cartItem) {
    const catalog = window.BEMO_CATALOG || [];
    // Try to find product by id or variant prefix
    let matchedProd = null;
    let matchedVariant = null;

    for (const p of catalog) {
      if (p.id === cartItem.variant_id || (p.variants && p.variants.some(v => v.id === cartItem.variant_id))) {
        matchedProd = p;
        matchedVariant = p.variants?.find(v => v.id === cartItem.variant_id) || p.variants?.[0];
        break;
      }
    }

    const title = cartItem.title || matchedProd?.ar || matchedProd?.name || 'منتج BEMO';
    const store_title = cartItem.store_title || matchedProd?.store_title || matchedProd?.store || 'Noor Fashion';
    const store_slug = cartItem.store_slug || matchedProd?.store_slug || 'noor-fashion';
    const image = cartItem.image || matchedProd?.image || (matchedProd?.images && matchedProd.images[0]) || 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400&auto=format&fit=crop&q=80';
    const price = cartItem.price_minor ? (cartItem.price_minor / 100) : (matchedVariant ? (matchedVariant.price_minor / 100) : (matchedProd?.price || 45));
    const currency = cartItem.currency || matchedProd?.currency || 'USD';
    const variant_label = cartItem.variant_label || matchedVariant?.label || (lang === 'ar' ? 'اللون / المقاس القياسي' : 'Standard option');
    const delivery_fee = matchedProd?.delivery_fee || 45; // default reasonable COD delivery fee

    return {
      variant_id: cartItem.variant_id,
      quantity: cartItem.quantity || 1,
      title,
      store_title,
      store_slug,
      image,
      price,
      currency,
      variant_label,
      delivery_fee,
      line_total: price * (cartItem.quantity || 1)
    };
  }

  function renderCart() {
    const rawCart = live.cart();
    const container = $('cartGroupedContainer');
    const headerCount = $('cartHeaderCount');
    const placeBtn = $('placeOrderBtn');

    if (!rawCart.length) {
      headerCount.textContent = lang === 'ar' ? '0 منتجات' : '0 items';
      container.innerHTML = `
        <div style="text-align:center;padding:48px 20px;background:#FAFAFA;border-radius:12px;border:1px dashed #DDD;">
          <div style="font-size:48px;margin-bottom:12px;">🛍️</div>
          <h3 style="font-size:18px;font-weight:800;margin:0 0 8px;color:#171717;">${t('emptyCartTitle')}</h3>
          <p style="color:#737373;font-size:13px;max-width:400px;margin:0 auto 20px;">${t('emptyCartCopy')}</p>
          <a href="index.html" class="btn-place-order-orange" style="display:inline-block;width:auto;padding:10px 24px;text-decoration:none;">
            ${t('startShopping')}
          </a>
        </div>
      `;
      $('summaryItemsTotal').textContent = formatMoney(0);
      $('summaryDeliveryStores').innerHTML = '';
      $('summaryGrandTotal').textContent = formatMoney(0);
      placeBtn.disabled = true;
      return;
    }

    placeBtn.disabled = false;
    const items = rawCart.map(resolveItem);
    headerCount.textContent = lang === 'ar' ? `${items.length} منتجات` : `${items.length} items`;

    // Group items by store_title
    const groups = {};
    for (const item of items) {
      const storeKey = item.store_title;
      if (!groups[storeKey]) {
        groups[storeKey] = {
          store_title: item.store_title,
          store_slug: item.store_slug,
          delivery_fee: item.delivery_fee,
          currency: item.currency,
          items: []
        };
      }
      groups[storeKey].items.push(item);
    }

    // Render Store Groups
    container.innerHTML = Object.values(groups).map(group => {
      const storeInitials = group.store_title.slice(0, 2).toUpperCase();
      const itemsHtml = group.items.map(item => `
        <div class="cart-item-row" data-variant-id="${item.variant_id}">
          <img src="${item.image}" alt="${item.title}" class="cart-item-thumb" loading="lazy">
          <div class="cart-item-details">
            <h3 class="cart-item-title">
              <a href="product.html?id=${item.variant_id.split('-v')[0]}&lang=${lang}">${item.title}</a>
            </h3>
            <span class="cart-item-variant">${item.variant_label}</span>
            <p class="cart-stock-status">✓ ${t('inStock')}</p>
          </div>

          <!-- Quantity Stepper -->
          <div class="cart-item-stepper-wrap">
            <button type="button" class="cart-step-btn" data-action="minus" data-id="${item.variant_id}">−</button>
            <input type="text" class="cart-step-input" value="${item.quantity}" readonly>
            <button type="button" class="cart-step-btn" data-action="plus" data-id="${item.variant_id}">+</button>
          </div>

          <!-- Price & Action -->
          <div class="cart-item-pricing">
            <span class="cart-line-price">${formatMoney(item.line_total, item.currency)}</span>
            <span class="cart-unit-price">${formatMoney(item.price, item.currency)} / قطعه</span>
          </div>

          <div class="cart-item-actions">
            <button type="button" class="cart-action-icon-btn" data-action="delete" data-id="${item.variant_id}" title="${t('remove')}">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
            </button>
          </div>
        </div>
      `).join('');

      return `
        <div class="store-group-box">
          <div class="store-group-header">
            <div class="store-brand-info">
              <span class="store-avatar-circle">${storeInitials}</span>
              <a href="store.html?store=${group.store_slug}&lang=${lang}" class="store-name-link">${group.store_title}</a>
              <span class="verified-tag-green">✔ ${lang === 'ar' ? 'موثق' : 'Verified'}</span>
              <span class="store-slug-dim">@${group.store_slug}</span>
            </div>
            <div class="store-delivery-meta">
              <span class="delivery-fee-badge">🚚 ${formatMoney(group.delivery_fee, group.currency)} · ${lang === 'ar' ? '2-4 أيام' : '2-4 days'}</span>
              <a href="store.html?store=${group.store_slug}&lang=${lang}" class="visit-store-anchor">${lang === 'ar' ? 'زيارة المتجر ➔' : 'Visit store ➔'}</a>
            </div>
          </div>
          <div class="store-items-list">
            ${itemsHtml}
          </div>
        </div>
      `;
    }).join('');

    // Update Summary Sidebar
    const subtotal = items.reduce((acc, it) => acc + it.line_total, 0);
    const totalDelivery = Object.values(groups).reduce((acc, g) => acc + g.delivery_fee, 0);
    const activeCurrency = items[0]?.currency || 'USD';

    $('summaryItemsTotal').textContent = formatMoney(subtotal, activeCurrency);

    // Delivery Breakdown
    $('summaryDeliveryStores').innerHTML = Object.values(groups).map(g => `
      <div class="summary-delivery-row">
        <span>${lang === 'ar' ? 'توصيل ' + g.store_title : g.store_title + ' Delivery'}:</span>
        <strong>${formatMoney(g.delivery_fee, g.currency)}</strong>
      </div>
    `).join('');

    // Promo Discount
    const discountAmount = appliedDiscount > 0 ? subtotal * appliedDiscount : 0;
    if (discountAmount > 0) {
      $('discountRow').hidden = false;
      $('discountLabel').textContent = `${lang === 'ar' ? 'خصم كود ' : 'Discount '}${promoCode}:`;
      $('discountValue').textContent = `-${formatMoney(discountAmount, activeCurrency)}`;
    } else {
      $('discountRow').hidden = true;
    }

    const grandTotal = Math.max(0, (subtotal + totalDelivery) - discountAmount);
    $('summaryGrandTotal').textContent = formatMoney(grandTotal, activeCurrency);
  }

  // Cart Stepper & Delete Click Delegation
  $('cartGroupedContainer')?.addEventListener('click', event => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const rawCart = live.cart();
    const item = rawCart.find(x => x.variant_id === id);

    if (action === 'delete') {
      live.set(id, 0);
      renderCart();
    } else if (action === 'plus' && item) {
      live.set(id, item.quantity + 1, item.title);
      renderCart();
    } else if (action === 'minus' && item) {
      if (item.quantity > 1) {
        live.set(id, item.quantity - 1, item.title);
      } else {
        live.set(id, 0);
      }
      renderCart();
    }
  });

  // Promo Code Voucher Application
  $('applyPromoBtn')?.addEventListener('click', () => {
    const input = $('promoInput');
    const val = input.value.trim().toUpperCase();
    const feedback = $('promoFeedback');

    if (['BEMO10', 'SAVE10', 'WELCOME'].includes(val)) {
      appliedDiscount = 0.10;
      promoCode = val;
      feedback.className = 'promo-feedback-text success';
      feedback.textContent = t('promoValid');
      feedback.hidden = false;
    } else if (val) {
      appliedDiscount = 0;
      promoCode = '';
      feedback.className = 'promo-feedback-text error';
      feedback.textContent = t('promoInvalid');
      feedback.hidden = false;
    } else {
      appliedDiscount = 0;
      promoCode = '';
      feedback.hidden = true;
    }
    renderCart();
  });

  // Place COD Order
  $('placeOrderBtn')?.addEventListener('click', async () => {
    const errorEl = $('error');
    errorEl.hidden = true;

    // Validate Address fields
    const recipient = $('recipient').value.trim();
    const phone = $('phone').value.trim();
    const country = $('country').value.trim();
    const region = $('region').value.trim();
    const city = $('city').value.trim();
    const address = $('address').value.trim();
    const note = $('note').value.trim();

    if (!recipient || !phone || !country || !region || !city || !address) {
      errorEl.textContent = t('requiredFields');
      errorEl.hidden = false;
      $('deliverySection').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!$('confirmQuote').checked) {
      errorEl.textContent = t('consentRequired');
      errorEl.hidden = false;
      return;
    }

    saveCurrentAddress();

    const rawCart = live.cart();
    if (!rawCart.length) {
      renderCart();
      return;
    }

    const items = rawCart.map(resolveItem);
    const orderId = `BEMO-ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const activeCurrency = items[0]?.currency || 'USD';
    const subtotal = items.reduce((acc, it) => acc + it.line_total, 0);
    const discountAmount = appliedDiscount > 0 ? subtotal * appliedDiscount : 0;
    const finalTotal = $('summaryGrandTotal').textContent;

    // Create realistic local tracked order
    const localOrder = {
      id: orderId,
      created_at: new Date().toISOString(),
      accepted_at: null,
      state: 'PENDING_SELLER',
      currency: activeCurrency,
      items: items.map(it => ({
        variant_id: it.variant_id,
        title: it.title,
        variant_label: it.variant_label,
        quantity: it.quantity,
        unit_price_minor: Math.round(it.price * 100),
        currency: it.currency,
        store_title: it.store_title,
        image: it.image
      })),
      delivery: {
        recipient,
        phone,
        country,
        region,
        city,
        address,
        note
      },
      total_minor: Math.round(subtotal * 100),
      events: [
        { action: 'ORDER_CREATED', state: 'PENDING_SELLER', created_at: new Date().toISOString() }
      ]
    };

    // Save to local storage orders
    try {
      const prevOrders = JSON.parse(localStorage.getItem('bemo-orders-local') || '[]');
      prevOrders.unshift(localOrder);
      localStorage.setItem('bemo-orders-local', JSON.stringify(prevOrders));
    } catch (_) {}

    // Clear bag
    live.clear();

    // Show 5-Stage Stepper Success View
    $('buyerCenterLayout').hidden = true;
    $('successSection').hidden = false;
    $('orderReference').textContent = `#${orderId}`;
    $('deliveryEta').textContent = lang === 'ar' ? 'خلال 2 إلى 4 أيام عمل' : 'Within 2–4 business days';
    $('step1').classList.remove('active');
    $('step2').classList.remove('active');
    $('step3').classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Language switcher
  $('languageButton')?.addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    language();
  });

  // Global Cart Event listener
  window.addEventListener('bemo:cart', renderCart);
  window.addEventListener('bemo:region-change', renderCart);

  // Initialize
  loadSavedAddress();
  language();

  if (api) {
    api.subscribe(s => {
      if (s.phase === 'ready' && s.profile) {
        if (!$('recipient').value && s.profile.display_name) $('recipient').value = s.profile.display_name;
        if (!$('phone').value && s.profile.phone) $('phone').value = s.profile.phone;
        loadSavedAddress();
      }
    });
    api.initialize();
  }
})();
