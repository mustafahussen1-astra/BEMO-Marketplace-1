/* Enhanced Product Detail Controller matching 4ProductDetail.png */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const live = window.BemoLive;
  const params = new URL(location.href).searchParams;
  let id = params.get('id') || 'prod-15';
  let lang = params.get('lang') === 'en' ? 'en' : 'ar';
  let product = null;
  let selectedVariant = null;

  const copy = {
    flashPromo: ['تخفيضات كبرى حتى 70% + شحن مجاني للطلبات فوق 29$', 'Mega Sale up to 70% off + Free shipping over $29'],
    sellOnBemo: ['البيع على BEMO', 'Sell on BEMO'],
    help: ['المساعدة', 'Help'],
    location: ['الرياض', 'Riyadh'],
    search: ['بحث', 'Search'],
    account: ['الحساب', 'Account'],
    saved: ['المفضلة', 'Saved'],
    orders: ['الطلبات', 'Orders'],
    cart: ['السلة', 'Cart'],
    home: ['الرئيسية', 'Home'],
    shop: ['تصفح المنتجات', 'Shop'],
    title: ['تفاصيل المنتج', 'Product Details'],
    unavailable: ['المنتج غير متاح حالياً', 'Product unavailable'],
    unavailableCopy: ['قد يكون الرابط غير صحيح أو توقف المتجر عن نشر هذا المنتج.', 'The link may be invalid or the item was unlisted.'],
    error: ['تعذّر تحميل المنتج', 'Failed to load product'],
    retry: ['إعادة المحاولة', 'Retry'],
    loading: ['جارٍ تحميل المنتج…', 'Loading product…'],
    codBadge: ['✓ متوفر دفع عند الاستلام', '✓ Cash on delivery available'],
    colorLabel: ['اللون:', 'Color:'],
    bundleLabel: ['الحزمة / الخيار:', 'Bundle / Option:'],
    freeExpressTitle: ['شحن سريع 2-4 أيام', 'Free express 2-4 days'],
    returnsPerk: ['استرجاع مجاني خلال 15 يوماً', '15-day free returns'],
    addToCart: ['أضف إلى السلة', 'Add to cart'],
    buyNowCod: ['شراء الآن (دفع عند الاستلام) ➔', 'Buy now (COD) ➔'],
    productDescription: ['تفاصيل المنتج ومواصفاته', 'Product Description & Specs'],
    chatWithSeller: ['محادثة', 'Chat'],
    visitStore: ['زيارة المتجر ➔', 'Visit store ➔'],
    deliveryEst: ['تقدير التوصيل', 'Delivery Estimate'],
    quantity: ['الكمية:', 'Quantity:'],
    buyerProtectionTitle: ['🛡️ حماية المشتري في BEMO', '🛡️ BEMO Buyer Protection'],
    protect1: ['استرداد كامل في حال عدم استلام المنتج', 'Full refund if not received'],
    protect2: ['ضمان مطابقة الوصف والأصالة 100%', 'Authenticity guaranteed'],
    protect3: ['دفع آمن عند الاستلام لكل متجر مستقل', 'Secure COD payment'],
    fbtTitle: ['منتجات تُشترى معاً عادةً', 'Frequently Bought Together'],
    boughtCount: ['2,000+ تم شراؤه هذا الشهر', '2k+ bought this month'],
    added: ['أضيف المنتج إلى السلة بنجاح!', 'Added to your cart!'],
    stockError: ['الكمية المطلوبة غير متوفرة', 'Quantity exceeds stock']
  };

  const t = k => copy[k]?.[lang === 'ar' ? 0 : 1] || k;
  const escape = v => String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
    $('languageButton').textContent = lang === 'ar' ? 'EN ▾' : 'عربي ▾';
    const cartLink = $('cartLink');
    if (cartLink) cartLink.href = 'market.html?view=cart&lang=' + lang;
    const url = new URL(location.href);
    url.searchParams.set('lang', lang);
    history.replaceState(null, '', url);
    if (product) render();
  }

  function selectVariant(v) {
    selectedVariant = v;
    const isDiscounted = v.former_minor && v.former_minor > v.price_minor;
    const priceVal = v.price_minor / 100;
    const oldPriceVal = v.former_minor ? v.former_minor / 100 : null;

    $('price').textContent = formatMoney(priceVal, v.currency || product.currency);
    if (oldPriceVal) {
      $('oldPrice').textContent = formatMoney(oldPriceVal, v.currency || product.currency);
      $('oldPrice').hidden = false;
      const discountPercent = Math.round((1 - priceVal / oldPriceVal) * 100);
      $('badgeDiscount').textContent = `-${discountPercent}%`;
    } else {
      $('oldPrice').hidden = true;
    }

    $('stock').textContent = lang === 'ar' ? `متوفر: ${v.stock_on_hand} قطعة` : `In stock: ${v.stock_on_hand}`;
    $('quantity').max = String(Math.min(100, v.stock_on_hand || 1));

    document.querySelectorAll('.bundle-chip-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.variantId === v.id);
    });
  }

  function renderGallery() {
    const thumbsContainer = $('thumbnails');
    if (!thumbsContainer) return;
    thumbsContainer.innerHTML = '';

    const mediaList = product.media && product.media.length ? product.media : [
      { url: product.image, alt_text: product.title }
    ];

    $('heroImage').src = mediaList[0].url || mediaList[0].storage_key || product.image;
    $('heroImage').alt = product.title;

    mediaList.forEach((m, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pdp-thumb-btn ${idx === 0 ? 'active' : ''}`;
      btn.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      btn.innerHTML = `<img src="${escape(m.url || m.storage_key || product.image)}" alt="" loading="lazy">`;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pdp-thumb-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('heroImage').src = m.url || m.storage_key || product.image;
      });
      thumbsContainer.appendChild(btn);
    });
  }

  function renderBundles() {
    const bundleContainer = $('bundleChips');
    if (!bundleContainer) return;
    bundleContainer.innerHTML = '';

    const variants = product.variants || [
      { id: 'v-default', label: 'Standard', price_minor: Math.round((product.price || 24.9) * 100), currency: product.currency || 'USD', stock_on_hand: 500 }
    ];

    variants.forEach((v, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `bundle-chip-btn ${idx === 0 ? 'active' : ''}`;
      btn.dataset.variantId = v.id;
      btn.textContent = v.label || (lang === 'ar' ? `خيار ${idx + 1}` : `Option ${idx + 1}`);
      btn.addEventListener('click', () => selectVariant(v));
      bundleContainer.appendChild(btn);
    });

    selectVariant(variants[0]);
  }

  function renderFbt() {
    const fbtContainer = $('fbtGrid');
    if (!fbtContainer) return;
    const catalog = (window.BEMO_CATALOG || []).filter(p => p.id !== product.id).slice(0, 7);

    fbtContainer.innerHTML = catalog.map(item => `
      <article class="bemo-product-card">
        <div class="card-image-box">
          <a href="product.html?id=${item.id}&lang=${lang}" class="card-image-link">
            <img src="${escape(item.image)}" alt="${escape(item.name)}" loading="lazy">
          </a>
          ${item.badge ? `<span class="floating-badge badge-discount">${escape(item.badge)}</span>` : ''}
        </div>
        <div class="card-info-box">
          <a href="product.html?id=${item.id}&lang=${lang}" class="card-title-btn">
            ${escape(lang === 'ar' ? (item.ar || item.name) : item.name)}
          </a>
          <div class="card-price-row">
            <span class="card-current-price">${formatMoney(item.price, item.currency)}</span>
            ${item.oldPrice ? `<del class="card-old-price">${formatMoney(item.oldPrice, item.currency)}</del>` : ''}
          </div>
          <div class="card-social-row">
            <span class="card-stars">★ ${item.rating || 4.8}</span>
            <span class="card-sold-count">${item.soldCount || '12.4k'}</span>
          </div>
          <a href="product.html?id=${item.id}&lang=${lang}" class="btn-card-add-cart">
            <span>+ ${t('addToCart')}</span>
          </a>
        </div>
      </article>
    `).join('');
  }

  function render() {
    const titleText = lang === 'ar' ? (product.ar || product.name || product.title) : (product.name || product.title);
    $('productTitle').textContent = titleText;
    $('breadcrumbTitle').textContent = titleText;
    $('description').textContent = lang === 'ar' ? (product.descriptionAr || product.description) : product.description;
    document.title = `${titleText} — BEMO`;

    $('storeTitle').textContent = product.store_title || product.store || 'TechSouq';
    $('storeAvatar').textContent = (product.store_title || product.store || 'TechSouq').slice(0, 2).toUpperCase();
    $('storeLink').href = `store.html?store=${product.store_slug || 'techsouq'}&lang=${lang}`;

    renderGallery();
    renderBundles();
  }

  function addToCart(checkout = false) {
    if (!selectedVariant) return;
    const qty = Number($('quantity').value) || 1;
    try {
      live.add(
        { ...selectedVariant, stock_on_hand: selectedVariant.stock_on_hand || 100 },
        product.name || product.title,
        {
          image: product.image || (product.images && product.images[0]) || '',
          store_title: product.store_title || product.store || 'BEMO Official Store',
          store_slug: product.store_slug || 'official-store',
          variant_label: selectedVariant.label || ''
        }
      );
      if (checkout) {
        location.href = `market.html?view=cart&lang=${lang}`;
      } else {
        $('cartStatus').innerHTML = `
          <div style="display:inline-flex;align-items:center;gap:8px;background:#ECFDF5;color:#065F46;padding:6px 12px;border-radius:20px;font-size:13px;border:1px solid #A7F3D0;">
            <span>✓ ${t('added')}</span>
            <a href="market.html?view=cart&lang=${lang}" style="color:#059669;font-weight:700;text-decoration:underline;">${lang === 'ar' ? 'الانتقال للسلة ➔' : 'View Cart ➔'}</a>
          </div>
        `;
        setTimeout(() => { $('cartStatus').textContent = ''; }, 4500);
      }
    } catch (_) {
      $('cartStatus').textContent = t('stockError');
    }
  }

  // Stepper controls
  $('qtyMinus')?.addEventListener('click', () => {
    const input = $('quantity');
    const val = Number(input.value) || 1;
    if (val > 1) input.value = val - 1;
  });

  $('qtyPlus')?.addEventListener('click', () => {
    const input = $('quantity');
    const val = Number(input.value) || 1;
    const max = Number(input.max) || 100;
    if (val < max) input.value = val + 1;
  });

  // Color Swatches interaction
  document.querySelectorAll('.color-swatch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('selectedColorName').textContent = btn.title || 'Selected';
    });
  });

  $('add')?.addEventListener('click', () => addToCart(false));
  $('buy')?.addEventListener('click', () => addToCart(true));
  $('languageButton')?.addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    language();
  });

  // Initial load
  async function load() {
    $('status').textContent = t('loading');
    const catalogItem = (window.BEMO_CATALOG || []).find(p => p.id === id);

    if (catalogItem) {
      product = {
        id: catalogItem.id,
        name: catalogItem.name,
        ar: catalogItem.ar,
        title: catalogItem.name,
        description: catalogItem.description,
        descriptionAr: catalogItem.descriptionAr,
        store_title: catalogItem.store_title || catalogItem.store,
        store_slug: catalogItem.store_slug,
        category: catalogItem.category,
        currency: catalogItem.currency || 'USD',
        price: catalogItem.price,
        oldPrice: catalogItem.oldPrice,
        rating: catalogItem.rating || 4.8,
        reviewsCount: catalogItem.reviewsCount || 8214,
        soldCount: catalogItem.soldCount || '12.4k',
        badge: catalogItem.badge || '-58%',
        isBemoChoice: catalogItem.isBemoChoice,
        variants: catalogItem.variants || [
          { id: `${catalogItem.id}-v1`, label: 'Standard', price_minor: Math.round(catalogItem.price * 100), currency: catalogItem.currency || 'USD', stock_on_hand: catalogItem.stock || 500 }
        ],
        media: [
          { url: catalogItem.image, alt_text: catalogItem.name },
          { url: 'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?auto=format&fit=crop&w=600&q=85', alt_text: 'Angle 2' },
          { url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=85', alt_text: 'Angle 3' },
          { url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=85', alt_text: 'Angle 4' }
        ]
      };
      $('status').textContent = '';
      $('product').hidden = false;
      render();
      renderFbt();
      return;
    }

    try {
      const controller = new AbortController();
      const row = await live.product(id, controller.signal);
      if (row) {
        product = row;
        $('status').textContent = '';
        $('product').hidden = false;
        render();
        renderFbt();
      } else {
        $('status').textContent = '';
        $('unavailable').hidden = false;
      }
    } catch (_) {
      $('status').textContent = '';
      $('failure').hidden = false;
    }
  }

  window.addEventListener('bemo:region-change', () => {
    if (product) {
      render();
      renderFbt();
    }
  });

  language();
  load();
})();
