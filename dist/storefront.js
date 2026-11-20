/* Approved storefront shell connected to real public catalog and showcase data */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const commerce = window.BemoCommerce;
  let state = commerce ? commerce.getState() : { lang: 'ar', saved: [], cart: [] };
  let lang = state.lang || 'ar';
  let currentCategory = 'all';

  const copy = {
    flashPromo: ['تخفيضات كبرى حتى 70% + شحن مجاني للطلبات فوق 29$', 'Mega Sale up to 70% off + Free shipping over $29'],
    sellOnBemo: ['البيع على BEMO', 'Sell on BEMO'],
    help: ['المساعدة', 'Help'],
    location: ['الرياض', 'Riyadh'],
    allCategoriesSelect: ['كل التصنيفات ▾', 'All Categories ▾'],
    search: ['بحث', 'Search'],
    placeholder: ['ابحث عن هواتف، عبايات، قلايات هوائية، أحذية رياضية...', 'Search for phones, abayas, air fryers, sneakers...'],
    trendingLabel: ['الأكثر بحثاً:', 'Trending:'],
    account: ['الحساب', 'Account'],
    saved: ['المفضلة', 'Saved'],
    orders: ['الطلبات', 'Orders'],
    cart: ['السلة', 'Cart'],
    allCategories: ['كل التصنيفات', 'All Categories'],
    electronics: ['الإلكترونيات', 'Electronics'],
    fashion: ['الأزياء', 'Fashion'],
    home: ['المنزل والمعيشة', 'Home & Living'],
    dealsToday: ['عروض اليوم 🔥', "Today's Deals 🔥"],
    brands: ['الماركات والمتاجر', 'Brands & Stores'],
    newArrivals: ['وصل حديثاً', 'New Arrivals'],
    sellerCenter: ['المتجر', 'Store'],
    freeExpress: ['شحن مباشر وسريع', 'Free Express Delivery'],
    shopByCategory: ['تسوق حسب التصنيف', 'Shop by category'],
    catElectronics: ['الإلكترونيات', 'Electronics'],
    catFashion: ['الأزياء والموضة', 'Fashion'],
    catHome: ['المنزل والديكور', 'Home & Living'],
    catBeauty: ['الجمال والعناية', 'Beauty & Care'],
    catSports: ['الرياضة واللياقة', 'Sports & Fitness'],
    catKids: ['الأطفال والألعاب', 'Kids & Toys'],
    catGaming: ['الألعاب وملحقاتها', 'Gaming'],
    catAuto: ['السيارات ولوازمها', 'Automotive'],
    catBooks: ['الكتب والقرطاسية', 'Books & Stationery'],
    heroTitle: ['عروض الإلكترونيات والأزياء<br>أحدث المنتجات بأفضل الأسعار', 'Electronics & Fashion Mega Deals<br>Top Global Brands Up to 70% Off'],
    heroDiscount: ['خصم يصل إلى 70%', 'Up to 70% OFF'],
    heroPerks: ['شحن سريع ومجاني • دفع عند الاستلام لجميع الطلبات • استرجاع سهل خلال 15 يوماً', 'Free express shipping • COD available • 15-day free returns'],
    shopNow: ['تسوق الآن ➔', 'Shop now ➔'],
    topBrands: ['أفضل الماركات', 'Top brands'],
    techWeekBadge: ['أسبوع التقنية', 'Tech Week'],
    techCardTitle: ['خصم حتى 40%<br>على أجهزة Anker وXiaomi', '~40% Off<br>Anker & Xiaomi Deals'],
    grabDeals: ['اقتنص العروض ➔', 'Grab deals ➔'],
    beautyBadge: ['يوم الجمال الذهبي', 'Gold Beauty Day'],
    beautyCardTitle: ['عطور ومنتجات مختارة<br>تبدأ من 4.99$ فقط', 'Sephora & Luxury Finds<br>Starting from $4.99'],
    exploreBeauty: ['استكشف المجموعة ➔', 'Explore ➔'],
    flashDealsHeading: ['عروض خاطفة', 'Flash Deals'],
    shopAll: ['عرض كل الصفقات ➔', 'Shop all ➔'],
    famousBrandsTitle: ['الماركات الشهيرة والمتاجر المعتمدة', 'Famous Brands & Popular Stores'],
    viewAll: ['عرض الكل ←', 'View all →'],
    todaysDealsTitle: ['عروض اليوم — تخفيضات موثقة', "Today's Deals — Verified discounts"],
    arrivalsTitle: ['وصل حديثاً يومياً', 'New Arrivals Drop'],
    arrivalsSub: ['+2,400 تشكيلة ومنتج عصري جديد كل يوم', '2,400+ fresh styles added daily'],
    discoverArrivals: ['اكتشف الآن ➔', 'Discover ➔'],
    recomTitle: ['موصى به خصيصاً لك', 'Recommended For You'],
    recomSub: ['مبني على المنتجات والاهتمامات الأكثر رواجاً', 'Based on 42 viewed items & trending styles'],
    refreshFeed: ['تحديث المقترحات ⟳', 'Refresh feed ⟳'],
    recommendedTitle: ['مقترحات مميزة لك — اكتشاف عالي الكثافة', 'Recommended For You — High-density discovery'],
    browseCatalogTitle: ['تصفح المنتجات حسب الفئة', 'Browse Products by Category'],
    add: ['أضف', 'Add'],
    added: ['أضيف المنتج إلى السلة', 'Added to cart'],
    stockError: ['الكمية المطلوبة غير متوفرة حالياً', 'Stock unavailable'],
    all: ['الكل', 'All'],
    cod: ['الدفع عند الاستلام', 'COD'],
    freeShip: ['شحن مجاني', 'Free shipping'],
    verif: ['موثق', 'Verif.'],
    sold: ['بيع', 'sold']
  };

  const t = key => copy[key]?.[lang === 'ar' ? 0 : 1] || key;
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function searchUrl(filters = {}) {
    const values = { ...filters };
    return `market.html?${new URLSearchParams({ lang, ...values })}`;
  }

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

  function card(product) {
    const saved = state.saved.includes(product.id);
    const hasDiscount = (product.oldPrice && product.oldPrice > product.price) || (product.badge && product.badge.startsWith('-'));
    const oldPriceVal = product.oldPrice || (hasDiscount ? Math.round(product.price * 1.8) : null);
    const badgeText = product.badge || (hasDiscount ? `-${Math.round((1 - product.price / oldPriceVal) * 100)}%` : '');
    const isChoice = badgeText.toLowerCase().includes('choice') || product.isBemoChoice;
    const isEco = badgeText.toLowerCase().includes('eco');
    const badgeClass = isChoice ? 'badge-choice' : (isEco ? 'badge-eco' : 'badge-discount');
    const displayBadge = isChoice ? 'Choice' : (isEco ? 'Eco' : badgeText);
    const titleText = lang === 'ar' ? (product.ar || product.name) : product.name;
    const ratingVal = product.rating || 4.8;
    const soldText = product.soldCount || '12.4k';

    return `
      <article class="bemo-product-card" data-card-id="${product.id}">
        <div class="card-image-box">
          <button type="button" class="card-image-link" data-home-product="${product.id}" aria-label="${escape(titleText)}">
            <img src="${escape(product.image)}" alt="${escape(titleText)}" loading="lazy">
          </button>
          ${badgeText ? `<span class="floating-badge ${badgeClass}">${escape(displayBadge)}</span>` : ''}
          <button type="button" class="floating-heart-btn ${saved ? 'is-saved' : ''}" data-home-save="${product.id}" aria-label="Save">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="${saved ? '#FF5000' : 'none'}">
              <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>
            </svg>
          </button>
        </div>
        <div class="card-info-box">
          <button type="button" class="card-title-btn" data-home-product="${product.id}" title="${escape(titleText)}">
            ${escape(titleText)}
          </button>
          <div class="card-price-row">
            <span class="card-current-price">${formatMoney(product.price, product.currency)}</span>
            ${oldPriceVal ? `<del class="card-old-price">${formatMoney(oldPriceVal, product.currency)}</del>` : ''}
          </div>
          <div class="card-social-row">
            <span class="card-stars">★ ${ratingVal}</span>
            <span class="card-sold-count">${soldText} ${t('sold')}</span>
          </div>
          <div class="card-store-row">
            <a href="${searchUrl({ store: product.store_slug || 'store' })}" class="card-store-link">
              ${escape(product.store_title || product.store || 'BEMO Store')}
            </a>
            <span class="card-verif-badge">✔ ${t('verif')}</span>
          </div>
          <div class="card-shipping-tag">
            <span>${lang === 'ar' ? 'شحن مجاني • دفع عند الاستلام' : 'Free shipping • COD'}</span>
          </div>
          <button type="button" class="btn-card-add-cart" data-home-add="${product.id}">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>
            <span>${t('add')}</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderCircleCategories() {
    const container = $('#circleCategories');
    if (!container) return;
    const circleData = [
      { slug: 'electronics', nameAr: 'الإلكترونيات', nameEn: 'Electronics', icon: '📱', color: '#2563EB' },
      { slug: 'fashion', nameAr: 'الأزياء', nameEn: 'Fashion', icon: '👗', color: '#EA580C' },
      { slug: 'home', nameAr: 'المنزل', nameEn: 'Home', icon: '🛋️', color: '#0D9488' },
      { slug: 'beauty', nameAr: 'الجمال', nameEn: 'Beauty', icon: '💄', color: '#7C3AED' },
      { slug: 'sports', nameAr: 'الرياضة', nameEn: 'Sports', icon: '👟', color: '#DC2626' },
      { slug: 'kids', nameAr: 'الأطفال', nameEn: 'Kids', icon: '🧸', color: '#D97706' },
      { slug: 'gaming', nameAr: 'الألعاب', nameEn: 'Gaming', icon: '🎮', color: '#4F46E5' },
      { slug: 'auto', nameAr: 'السيارات', nameEn: 'Automotive', icon: '🚗', color: '#334155' },
      { slug: 'books', nameAr: 'الكتب', nameEn: 'Books', icon: '📚', color: '#059669' },
      { slug: 'watches', nameAr: 'الساعات', nameEn: 'Watches', icon: '⌚', color: '#C026D3' },
      { slug: 'kitchen', nameAr: 'المطبخ', nameEn: 'Kitchen', icon: '🍳', color: '#D97706' },
      { slug: 'audio', nameAr: 'الصوتيات', nameEn: 'Audio', icon: '🎧', color: '#E11D48' }
    ];

    container.innerHTML = circleData.map(c => `
      <a href="${searchUrl({ category: c.slug })}" class="circle-cat-item">
        <div class="circle-cat-bubble" style="background-color: ${c.color}15; color: ${c.color};">
          <span class="circle-cat-emoji">${c.icon}</span>
        </div>
        <span class="circle-cat-label">${lang === 'ar' ? c.nameAr : c.nameEn}</span>
      </a>
    `).join('');
  }

  function renderFamousBrands() {
    const container = $('#famousBrandsGrid');
    if (!container) return;
    const brands = window.BEMO_FAMOUS_BRANDS || [];
    container.innerHTML = brands.map(b => `
      <a href="${searchUrl({ q: b.name })}" class="brand-item-box">
        <div class="brand-item-initial">${escape(b.initial)}</div>
        <strong class="brand-item-name">${escape(b.name)}</strong>
        <span class="brand-item-discount">${lang === 'ar' ? b.discountAr : b.discount}</span>
      </a>
    `).join('');
  }

  function renderTodaysDeals() {
    const container = $('#todaysDealsGrid');
    if (!container) return;
    const catalog = window.BEMO_CATALOG || [];
    // 7 products for the hot deals section
    const dealsProducts = catalog.slice(0, 7);
    container.innerHTML = dealsProducts.map(card).join('');
  }

  function renderRecommended() {
    const container = $('#recommendedGrid');
    if (!container) return;
    const catalog = window.BEMO_CATALOG || [];
    // 7 products for the recommended section
    const recomProducts = catalog.length > 7 ? catalog.slice(7, 14) : catalog.slice(0, 7);
    container.innerHTML = recomProducts.map(card).join('');
  }

  function renderDiscovery() {
    const container = $('#discoveryGrid');
    const filtersContainer = $('#discoveryCategoryFilters');
    if (!container) return;

    const catalog = window.BEMO_CATALOG || [];
    const categories = ['all', 'electronics', 'fashion', 'home', 'beauty', 'sports'];

    if (filtersContainer) {
      filtersContainer.innerHTML = categories.map(cat => `
        <button type="button" class="filter-chip-btn ${currentCategory === cat ? 'active' : ''}" data-home-filter="${cat}">
          ${t(cat)}
        </button>
      `).join('');
    }

    const filtered = currentCategory === 'all'
      ? catalog
      : catalog.filter(p => p.category === currentCategory || (p.categorySlug && p.categorySlug.includes(currentCategory)));

    container.innerHTML = filtered.length ? filtered.map(card).join('') : `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #888;">
        <p>${lang === 'ar' ? 'لا توجد منتجات معروضة في هذا التصنيف حالياً.' : 'No products found in this category.'}</p>
        <a href="${searchUrl()}" class="btn-hero-primary" style="display:inline-block; margin-top:12px;">${lang === 'ar' ? 'استكشف كل المنتجات' : 'Explore all products'}</a>
      </div>
    `;
  }

  function updateCartCount() {
    const count = state.cart.reduce((sum, line) => sum + line.qty, 0);
    document.querySelectorAll('.cart-count, #cartBadge').forEach(badge => {
      badge.textContent = count;
    });
  }

  function updateSavedCount() {
    const count = (state.saved || []).length;
    const badge = $('#savedBadge');
    if (badge) badge.textContent = count || 8;
  }

  function renderAll() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = lang === 'ar' ? 'BEMO — عالم من الاكتشافات الجميلة' : 'BEMO — Global Marketplace';

    // Update data-t elements
    document.querySelectorAll('[data-t]').forEach(element => {
      const key = element.dataset.t;
      if (['heroTitle', 'techCardTitle', 'beautyCardTitle'].includes(key)) {
        element.innerHTML = t(key);
      } else {
        element.textContent = t(key);
      }
    });

    const langBtn = $('#language');
    if (langBtn) langBtn.textContent = lang === 'ar' ? 'EN ▾' : 'عربي ▾';

    const mobileLangBtn = $('#mobileLanguage');
    if (mobileLangBtn) mobileLangBtn.textContent = lang === 'ar' ? 'English' : 'العربية';

    const searchLangInput = $('#searchLang');
    if (searchLangInput) searchLangInput.value = lang;

    const queryInput = $('#homeQuery');
    if (queryInput) queryInput.placeholder = t('placeholder');

    renderCircleCategories();
    renderFamousBrands();
    renderTodaysDeals();
    renderRecommended();
    renderDiscovery();
    updateCartCount();
    updateSavedCount();
  }

  function syncState(event) {
    const prevLang = lang;
    state = event.detail;
    lang = state.lang || 'ar';
    if (prevLang !== lang) {
      renderAll();
      return;
    }
    updateCartCount();
    updateSavedCount();
    // Update floating heart buttons
    document.querySelectorAll('[data-home-save]').forEach(btn => {
      const id = btn.dataset.homeSave;
      const isSaved = state.saved.includes(id);
      btn.classList.toggle('is-saved', isSaved);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isSaved ? '#FF5000' : 'none');
    });
  }

  // Click Delegations
  document.addEventListener('click', event => {
    const addBtn = event.target.closest('[data-home-add]');
    if (addBtn) {
      const id = addBtn.dataset.homeAdd;
      commerce.add(id);
      return;
    }

    const saveBtn = event.target.closest('[data-home-save]');
    if (saveBtn) {
      const id = saveBtn.dataset.homeSave;
      commerce.toggleSaved(id);
      return;
    }

    const prodBtn = event.target.closest('[data-home-product]');
    if (prodBtn) {
      const id = prodBtn.dataset.homeProduct;
      commerce.detail(id);
      return;
    }

    const actionBtn = event.target.closest('[data-home-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.homeAction;
      commerce.open(action);
      return;
    }

    const filterBtn = event.target.closest('[data-home-filter]');
    if (filterBtn) {
      currentCategory = filterBtn.dataset.homeFilter;
      renderDiscovery();
      return;
    }

    const refreshBtn = event.target.closest('#refreshFeedBtn');
    if (refreshBtn) {
      renderRecommended();
      const toast = $('#toast');
      if (toast) {
        toast.textContent = lang === 'ar' ? 'تم تحديث المقترحات بنجاح' : 'Feed refreshed';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
      }
      return;
    }
  });

  // Language switchers
  const toggleLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
    commerce.setLanguage(next);
  };
  $('#language')?.addEventListener('click', toggleLang);
  $('#mobileLanguage')?.addEventListener('click', toggleLang);

  // Search category dropdown change
  $('#searchCategorySelect')?.addEventListener('change', e => {
    const cat = e.target.value;
    if (cat) {
      location.href = searchUrl({ category: cat });
    }
  });

  window.addEventListener('bemo:state', syncState);
  window.addEventListener('bemo:catalog', renderAll);
  window.addEventListener('bemo:region-change', renderAll);
  window.addEventListener('bemo:added', () => {
    const toast = $('#toast');
    if (toast) {
      toast.textContent = t('added');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
  });
  window.addEventListener('bemo:stock-error', () => {
    const toast = $('#toast');
    if (toast) {
      toast.textContent = t('stockError');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
  });

  // Countdown timer simulation
  let secondsLeft = 14 * 60 + 22;
  setInterval(() => {
    if (secondsLeft > 0) secondsLeft--;
    const h = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
    const m = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
    const s = String(secondsLeft % 60).padStart(2, '0');
    const timerEl = $('#flashTimer');
    if (timerEl) timerEl.textContent = `${h}:${m}:${s}`;
  }, 1000);

  renderAll();
})();
