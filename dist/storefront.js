/* Approved storefront shell connected to the real public catalog. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const products = window.BEMO_CATALOG;
  const commerce = window.BemoCommerce;
  let state = commerce.getState();
  let lang = state.lang;
  let category = 'all';
  let savedOnly = new URLSearchParams(location.search).get('saved') === '1';
  const copy = {
    review: ['نسخة تطوير خاصة · منتجات يضيفها التجار', 'Private development · Seller-published products'],
    destination: ['متاجر متعددة، سلة واحدة · الدفع عند الاستلام لكل متجر', 'Many stores, one bag · Cash on delivery to each store'],
    help: ['كيف يعمل BEMO؟', 'How BEMO works'],
    search: ['بحث', 'Search'],
    placeholder: ['ابحث عن منتج، متجر أو اكتشاف جديد', 'Search products, stores or your next good find'],
    account: ['الحساب', 'Account'], saved: ['المفضلة', 'Saved'], orders: ['الطلبات', 'Orders'], cart: ['السلة', 'Cart'],
    allCategories: ['كل التصنيفات', 'All categories'], deals: ['الجديد', 'New arrivals'], merchant: ['المتجر', 'Store'],
    campaignSample: ['تسوق الآن', 'SHOP NOW'], layoutSample: ['اكتشف المجموعة', 'EXPLORE THE COLLECTION'],
    hero: ['اكتشافات كثيرة.<br>مكان واحد يجمعها.', 'So much to discover.<br>One place to find it.'],
    heroCopy: ['تسوق منتجات متنوعة من متاجر مختلفة في مكان واحد.', 'Shop products from multiple stores in one place.'],
    explore: ['استكشف المنتجات', 'Explore products'], illustrative: ['صورة توضيحية', 'Illustrative photo'],
    techTitle: ['تقنية ترافق يومك', 'Tech for every day'], fashionTitle: ['تفاصيل على ذوقك', 'Everyday, your way'],
    seeCollection: ['استكشف المجموعة ←', 'Explore collection →'], home: ['المنزل والمعيشة', 'Home & living'],
    fashion: ['الأزياء', 'Fashion'], electronics: ['الإلكترونيات', 'Electronics'], beauty: ['الجمال', 'Beauty'], sports: ['الرياضة والأنشطة', 'Sports & outdoors'], other:['أخرى','Other'],
    all: ['الكل', 'All'], moreCategories: ['كل المنتجات', 'All products'], sampleItems: ['اكتشف التصنيف', 'Explore category'],
    dealsEyebrow: ['الجديد من المتاجر', 'NEW FROM THE STORES'], dealsTitle: ['اكتشافات جديدة', 'Fresh finds'],
    viewOffers: ['كل المنتجات ←', 'All products →'], priceNote: ['الأسعار بعملة كل متجر · رسوم التوصيل تظهر قبل إنشاء الطلب', 'Prices use each store’s currency · Review delivery fees before ordering'],
    storesEyebrow: ['تعرّف إلى مصادر الاكتشاف', 'DISCOVER THE STORES BEHIND THE FINDS'],
    storesTitle: ['متاجر مختلفة. اهتمامات كثيرة.', 'Different stores. More to explore.'], viewStores: ['استكشف المتاجر ←', 'Explore stores →'],
    sampleStore: ['متجر مسجّل', 'Registered store'], storeCount: ['منتجات معروضة هنا', 'products shown here'], visitStore: ['عرض المتجر ←', 'View store →'],
    noStores:['لا توجد متاجر متاحة حالياً.','No stores are available yet.'], storesError:['تعذّر تحميل المتاجر. افتح دليل المتاجر لإعادة المحاولة.','Stores could not load. Open the store directory to try again.'], storesLoading:['جارٍ تحميل المتاجر…','Loading stores…'],
    discoverEyebrow: ['تصفّح حسب التصنيف', 'BROWSE BY CATEGORY'],
    discoverTitle: ['تصفح المنتجات', 'Browse products'], sort: ['ترتيب حسب', 'Sort by'], featured: ['الترتيب الافتراضي', 'Default order'],
    discountHeading:['الخصومات','Discounts'],discountEmpty:['ستظهر الخصومات عند إضافتها من المتاجر.','Discounts appear when sellers add them.'],brandsHeading:['الماركات','Brands'],brandsEmpty:['ستظهر الماركات عندما تصبح متاحة.','Brands will appear when available.'],verifiedHeading:['المتاجر الموثوقة','Verified stores'],verifiedEmpty:['ستظهر المتاجر بعد اعتماد توثيقها.','Stores appear once verified.'],
    bags:['حقائب','Bags'],watches:['ساعات','Watches'],perfume:['عطور','Perfume'],shoes:['أحذية','Shoes'],phones:['هواتف','Phones'],toys:['ألعاب','Toys'],
    low: ['العملة ثم السعر: الأقل', 'Currency, then price: low'], high: ['العملة ثم السعر: الأعلى', 'Currency, then price: high'], results: ['منتجات معروضة', 'products shown'], noCategory:['لا توجد منتجات معروضة في هذا التصنيف حالياً.','No products from this category are shown here yet.'],
    advancedSearch: ['استكشف البحث والفلاتر', 'Explore search and filters'],
    reviewTitle: ['سلة واحدة. طلب مستقل لكل متجر.', 'One bag. Independent store orders.'],
    reviewCopy: ['راجع قيمة المنتجات والتوصيل لكل متجر قبل إنشاء الطلب. يقبل كل تاجر طلبه بشكل مستقل، والدفع له أو لمندوبه عند الاستلام. إضافة المنتج للسلة لا تحجز مخزونه.', 'Review each store’s products and delivery fee before ordering. Sellers accept independently, and you pay each seller or courier on delivery. Adding to your bag does not reserve stock.'],
    footerTagline: ['اكتشافات تناسب يومك، من متاجر متعددة.', 'Everyday finds, from independent stores.'],
    discoverFooter: ['اكتشف BEMO', 'Discover BEMO'], categories: ['التصنيفات', 'Categories'], stores: ['المتاجر', 'Stores'],
    yourBemo: ['تجربتك على BEMO', 'Your BEMO'], aboutPreview: ['كيف يعمل BEMO', 'How BEMO works'],
    policiesPending: ['صور الأقسام توضيحية. المنتجات ينشرها التجار. سياسات الإطلاق التجاري قيد الاستكمال.', 'Category images are illustrative. Products are listed by sellers. Commercial launch policies are still being finalized.'],
    copyright: ['© 2026 BEMO · عالم من الاكتشافات الجميلة', '© 2026 BEMO · A world of good finds'],
    noOrders: ['الدفع عند الاستلام · رسوم المنصة صفر', 'Cash on delivery · Zero platform fees'],
    sampleLabel: ['من متجر مستقل', 'From an independent store'],
    emptyCatalog: ['لا توجد منتجات منشورة بعد. ستكون هنا اكتشافات التجار القادمة.', 'No products have been published yet. Seller listings will appear here.'],
    loading: ['جارٍ تحميل المنتجات…', 'Loading products…'], loadError: ['تعذّر تحميل المنتجات. افتح صفحة المنتجات لإعادة المحاولة.', 'Products could not load. Open the product page to try again.'],
    save: ['حفظ المنتج', 'Save product'], unsave: ['إزالة من المفضلة', 'Remove from saved'],
    savedTitle: ['منتجاتك المفضلة', 'Your saved finds'], emptySaved: ['لم تحفظ منتجات بعد. استخدم رمز القلب على أي بطاقة.', 'No saved products yet. Use the heart on any product card.'],
    browseAll: ['استكشف كل المنتجات', 'Explore all products'], add: ['أضف إلى السلة', 'Add to bag'], added:['أضيف المنتج إلى السلة','Added to your cart'], stockError:['الكمية المطلوبة غير متوفرة حالياً','The requested quantity is unavailable'], homeNav: ['الرئيسية', 'Home']
  };
  const t = key => copy[key]?.[lang === 'ar' ? 0 : 1] || key;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const name = product => lang === 'ar' ? product.ar : product.name;
  const paths = {
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    heart:'<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
    bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    package:'<path d="m3 7 9-5 9 5v11l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v11M7.5 4.5l9 5v5"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    home:'<path d="m3 10 9-8 9 8v11h-7v-7h-4v7H3V10Z"/>',
    deals:'<path d="m13 3 8 8-10 10-8-8V3h10Z"/><circle cx="7.5" cy="7.5" r="1"/>'
  };
  const icon = key => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[key] || paths.bag}</svg>`;
  const categories = ['home','fashion','electronics','beauty','sports','other'];
  const categoryProducts = {home:1,fashion:4,electronics:2,beauty:7,sports:8};

  function searchUrl(filters = {}) {
    const values = {...filters};
    return `${values.store&&!values.q&&!values.category?'store':'market'}.html?${new URLSearchParams({lang,...values})}`;
  }

  function card(product) {
    const saved = state.saved.includes(product.id);
    const hasDiscount = product.oldPrice && product.oldPrice > product.price;
    const discountPercent = hasDiscount ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
    return `<article class="product-card">
      <div class="product-photo">
        <button type="button" class="product-open" data-home-product="${product.id}" aria-label="${escape(name(product))}">
          ${product.image ? `<img src="${escape(product.image)}" alt="${escape(name(product))}" loading="lazy" width="320" height="320">` : ''}
        </button>
        ${hasDiscount ? `<span class="product-badge discount">-${discountPercent}%</span>` : ''}
        <button type="button" class="product-save" data-home-save="${product.id}" aria-pressed="${saved}" aria-label="${t(saved ? 'unsave' : 'save')}: ${escape(name(product))}">
          ${icon('heart')}
        </button>
      </div>
      <div class="product-info">
        <div class="product-meta-row">
          <a class="product-store" href="${escape(searchUrl({store:product.store_slug}))}">🏪 ${escape(product.store)}</a>
          <span class="product-rating">★ 4.8</span>
        </div>
        <button type="button" class="product-name" data-home-product="${product.id}">${escape(name(product))}</button>
        <div class="product-price-row">
          <p class="product-price">
            <span>${window.BemoLive.money(product.priceMinor,product.currency,lang)}</span>
            ${hasDiscount ? `<del class="old-price">${window.BemoLive.money(Math.round(product.oldPrice * 100), product.currency, lang)}</del>` : ''}
          </p>
        </div>
        <div class="product-buy">
          <button type="button" class="product-add-btn" data-home-add="${product.id}">
            <span>${t('add')}</span>
            <span class="plus-icon">+</span>
          </button>
        </div>
      </div>
    </article>`;
  }

  function updateCartCount() {
    const count = state.cart.reduce((sum, line) => sum + line.qty, 0);
    document.querySelectorAll('[data-home-action="cart"]').forEach(button => {
      button.setAttribute('aria-label', `${t('cart')}: ${count}`);
      const badge = button.querySelector('.cart-count');
      if (badge) badge.textContent = count;
    });
  }

  let discoveryEntries = [];
  let stripStatus = 'loading';
  function renderStrips() {
    const config = [
      { kind: 'brand', linkId: 'brandsBrowse', containerId: 'brandsHorizontalItems' },
      { kind: 'verified', linkId: 'verifiedBrowse', containerId: 'verifiedHorizontalItems' },
      { kind: 'offer', linkId: 'discountBrowse', containerId: 'discountHorizontalItems' }
    ];

    for (const item of config) {
      const container = document.getElementById(item.containerId);
      if (!container) continue;
      const cards = discoveryEntries.filter(row => row.kind === item.kind).map(row => {
        const link = document.createElement('a');
        link.className = 'strip-item-card';
        link.href = item.kind === 'offer' ? 'product.html?' + new URLSearchParams({id:row.product_id,lang}) : searchUrl({store:row.slug});
        if (item.kind === 'offer') {
          link.innerHTML = `
            <div style="font-size:24px;margin-bottom:4px;">🎁</div>
            <strong>${escape(row.title)}</strong>
            <p style="margin:2px 0 0;color:var(--bemo-sale);font-weight:700;font-size:12px;">
              ${window.BemoLive.money(row.price_minor,row.currency,lang)}
              <del style="color:var(--bemo-muted);font-size:10px;margin-inline-start:4px;">${window.BemoLive.money(row.former_price,row.currency,lang)}</del>
            </p>
          `;
        } else {
          link.innerHTML = `
            <div style="font-size:24px;margin-bottom:4px;">${item.kind === 'brand' ? '🏷️' : '🛡️'}</div>
            <strong>${escape(row.title)}</strong>
            <small>${item.kind === 'brand' ? t('brandsHeading') : t('verifiedHeading')}</small>
          `;
        }
        return link;
      });

      if (cards.length) {
        container.replaceChildren(...cards);
      } else {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'strip-empty-text';
        emptyMsg.textContent = t(stripStatus === 'ready' ? (item.kind === 'brand' ? 'brandsEmpty' : item.kind === 'verified' ? 'verifiedEmpty' : 'discountEmpty') : stripStatus);
        container.replaceChildren(emptyMsg);
      }
    }
  }
  function renderDiscovery() {
    let rows = products.filter(product => (category === 'all' || product.category === category) && (!savedOnly || state.saved.includes(product.id)));
    if ($('#homeSort').value === 'low') rows.sort((a,b) => a.currency.localeCompare(b.currency)||a.price - b.price);
    if ($('#homeSort').value === 'high') rows.sort((a,b) => a.currency.localeCompare(b.currency)||b.price - a.price);
    $('#discoveryGrid').innerHTML = rows.length ? rows.map(card).join('') : `<div class="empty-saved"><p>${t(window.BEMO_HOME_STATUS==='loading'?'loading':window.BEMO_HOME_STATUS==='error'?'loadError':savedOnly?'emptySaved':category!=='all'?'noCategory':'emptyCatalog')}</p><a class="button primary" href="${searchUrl(category!=='all'?{category}:{})}">${t('browseAll')}</a></div>`;
    $('#productCount').textContent = `${rows.length} ${t('results')}`;
    $('#discoveryFilters').innerHTML = ['all',...categories].map(value => `<button type="button" data-home-filter="${value}" class="${category === value ? 'active' : ''}" aria-pressed="${category === value}">${t(value)}</button>`).join('');
    document.querySelector('[data-t="discoverTitle"]').textContent = t(savedOnly ? 'savedTitle' : 'discoverTitle');
  }

  function render() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = lang === 'ar' ? 'BEMO — عالم من الاكتشافات الجميلة' : 'BEMO — A world of good finds';
    document.querySelectorAll('[data-t]').forEach(element => {
      if (element.dataset.t === 'hero') element.innerHTML = t('hero');
      else element.textContent = t(element.dataset.t);
    });
    document.querySelectorAll('[data-icon]').forEach(element => {element.innerHTML = icon(element.dataset.icon);});
    document.querySelectorAll('[data-icon-label]').forEach(element => {
      element.innerHTML = icon(element.dataset.iconLabel) + `<span>${t(element.dataset.t)}</span>` + (element.dataset.homeAction === 'cart' ? '<span class="cart-count" aria-hidden="true">0</span>' : '');
      element.setAttribute('aria-label', t(element.dataset.t));
    });
    $('#homeQuery').placeholder = t('placeholder');
    $('#homeSort').setAttribute('aria-label', t('sort'));
    for (const id of ['language','mobileLanguage']) {
      const button = $('#' + id);
      button.textContent = lang === 'ar' ? 'English' : 'العربية';
      button.setAttribute('aria-label', lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    }
    $('#searchLang').value = lang;
    const allCats = window.BEMO_CATEGORIES || [];
    $('#topCategories').innerHTML = (allCats.length ? allCats.slice(0, 8) : categories.map(c=>({slug:c,name_ar:t(c),name_en:t(c)}))).map(c => `<a href="${searchUrl({category:c.slug})}">${lang === 'ar' ? (c.name_ar||t(c.slug)) : (c.name_en||t(c.slug))}</a>`).join('');
    $('#categoryFlyout').innerHTML = (allCats.length ? allCats : categories.map(c=>({slug:c,name_ar:t(c),name_en:t(c)}))).map(c => `<a href="${searchUrl({category:c.slug})}">${lang === 'ar' ? (c.name_ar||t(c.slug)) : (c.name_en||t(c.slug))}</a>`).join('');
    document.querySelectorAll('[data-category]').forEach(element => {element.href = searchUrl({category:element.dataset.category});});
    $('#fastCategories').setAttribute('aria-label', t('categories'));
    $('#fastCategories').innerHTML = (allCats.length ? allCats.slice(0, 12) : categories.map(c=>({slug:c,name_ar:t(c),name_en:t(c)}))).map((c, i) => `<a class="fast-category" href="${searchUrl({category:c.slug})}"><span class="fast-category-img">${categoryProducts[c.slug]?`<img src="${window.BEMO_ILLUSTRATIONS[categoryProducts[c.slug]]}" alt="" loading="lazy" width="62" height="62">`:icon('grid')}</span><span><strong>${lang === 'ar' ? (c.name_ar||t(c.slug)) : (c.name_en||t(c.slug))}</strong><small>${t('sampleItems')}</small></span></a>`).join('');
    $('#techImage').src = window.BEMO_ILLUSTRATIONS[2];
    $('#fashionImage').src = window.BEMO_ILLUSTRATIONS[4];
    $('#marketShortcuts').innerHTML = ['bags','watches','perfume','shoes','phones','toys'].map(key => `<a href="${searchUrl({q:t(key)})}">${t(key)} <span aria-hidden="true">↗</span></a>`).join('');
    $('#marketShortcuts').setAttribute('aria-label',t('categories'));
    $('#discountBrowse').href=searchUrl(); $('#brandsBrowse').href=searchUrl(); $('#verifiedBrowse').href='stores.html?lang='+lang;
    renderStrips();
    $('#dealsGrid').innerHTML = products.length ? products.slice(0,6).map(card).join('') : `<div class="empty-saved" role="status"><p>${t(window.BEMO_HOME_STATUS==='loading'?'loading':window.BEMO_HOME_STATUS==='error'?'loadError':'emptyCatalog')}</p><a class="button primary" href="${searchUrl()}">${t('browseAll')}</a></div>`;
    $('#storesGrid').innerHTML = window.BEMO_STORES.length ? window.BEMO_STORES.map(store => {
      const rows = products.filter(product => product.store_slug === store.slug);
      return `<article class="store-card"><div class="store-top"><div class="store-initial" aria-hidden="true">${escape(store.title.charAt(0))}</div><div><h3>${escape(store.title)}</h3><small>@${escape(store.slug)}</small></div></div><div class="store-products">${rows.filter(p=>p.image).slice(0,3).map(product => `<img src="${escape(product.image)}" alt="${escape(name(product))}" loading="lazy" width="160" height="160">`).join('')}</div><div class="store-footer"><span>${t('sampleStore')}</span><a href="${escape(searchUrl({store:store.slug}))}">${t('visitStore')}</a></div></article>`;
    }).join('') : `<div class="empty-saved" role="status"><p>${t(window.BEMO_STORES_STATUS==='loading'?'storesLoading':window.BEMO_STORES_STATUS==='error'?'storesError':'noStores')}</p><a href="stores.html?lang=${lang}">${t('viewStores')}</a></div>`;
    for (const id of ['allDeals','offersLink']) $('#' + id).href = searchUrl();
    $('#allStores').href = 'stores.html?lang=' + lang;
    for (const id of ['heroLink','browseMore']) $('#' + id).href = searchUrl();
    $('#mobileNav').innerHTML = `<a href="#" class="active">${icon('home')}<span>${t('homeNav')}</span></a><a href="#fastCategories">${icon('grid')}<span>${t('categories')}</span></a><a href="#deals">${icon('deals')}<span>${t('deals')}</span></a><button type="button" data-home-action="cart">${icon('bag')}<span>${t('cart')}</span><span class="cart-count" aria-hidden="true">0</span></button><button type="button" data-home-action="account">${icon('user')}<span>${t('account')}</span></button>`;
    $('#mobileNav').setAttribute('aria-label', lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation');
    renderDiscovery();
    updateCartCount();
  }

  function syncState(event) {
    const previousLang = lang;
    const previousSaved = state.saved.join(',');
    state = event.detail;
    lang = state.lang;
    if (previousLang !== lang) return render();
    updateCartCount();
    document.querySelectorAll('[data-home-save]').forEach(button => {
      const product = products.find(item => item.id === button.dataset.homeSave);
      const saved = state.saved.includes(product.id);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${t(saved ? 'unsave' : 'save')}: ${name(product)}`);
    });
    if (savedOnly && previousSaved !== state.saved.join(',')) {
      const focused = document.activeElement?.closest('#discoveryGrid');
      renderDiscovery();
      if (focused) {
        const heading = document.querySelector('[data-t="discoverTitle"]');
        heading.tabIndex = -1;
        heading.focus({preventScroll:true});
      }
    }
  }

  function showSaved() {
    savedOnly = true;
    category = 'all';
    const url = new URL(location.href);
    url.searchParams.set('saved', '1');
    history.replaceState(null, '', url);
    renderDiscovery();
    $('#discover').scrollIntoView({behavior:'smooth'});
  }

  function browse(value = 'all') {
    savedOnly = false;
    category = categories.includes(value) ? value : 'all';
    const url = new URL(location.href);
    url.searchParams.delete('saved');
    history.replaceState(null, '', url);
    renderDiscovery();
    $('#discover').scrollIntoView({behavior:'smooth'});
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#modal')) return;
    const button = event.target.closest('button');
    if (button?.dataset.homeAction) commerce.open(button.dataset.homeAction);
    if (button?.dataset.homeProduct) commerce.detail(button.dataset.homeProduct);
    if (button?.dataset.homeAdd) commerce.add(button.dataset.homeAdd);
    if (button?.dataset.homeSave) commerce.toggleSaved(button.dataset.homeSave);
    if (button?.dataset.homeFilter) {
      browse(button.dataset.homeFilter);
      document.querySelector(`#discoveryFilters [data-home-filter="${category}"]`)?.focus({preventScroll:true});
    }
    if (!event.target.closest('#allCategories')) $('#allCategories').open = false;
  });
  for (const id of ['language','mobileLanguage']) $('#' + id).addEventListener('click', () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
    commerce.setLanguage(next);
  });
  $('#homeSort').addEventListener('change', renderDiscovery);
  window.addEventListener('bemo:state', syncState);
  window.addEventListener('bemo:catalog',render);
  window.addEventListener('bemo:added',()=>{ $('#toast').textContent=t('added'); $('#toast').classList.add('show'); setTimeout(()=>$('#toast').classList.remove('show'),2500); });
  window.addEventListener('bemo:stock-error',()=>{ $('#toast').textContent=t('stockError'); $('#toast').classList.add('show'); setTimeout(()=>$('#toast').classList.remove('show'),2500); });
  window.addEventListener('bemo:saved', showSaved);
  window.addEventListener('bemo:browse', event => browse(event.detail?.category));
  render();
  window.BemoLive.discoveryFeed().then(rows => {
    discoveryEntries = rows;
    stripStatus = 'ready';
  }).catch(() => { stripStatus = 'loadError'; }).finally(renderStrips);
  if (savedOnly) $('#discover').scrollIntoView();
})();
