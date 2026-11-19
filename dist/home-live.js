/* Preserve the approved homepage layout; merchant-published goods + curated showcase. */
(() => {
  'use strict';
  const live = window.BemoLive;
  const initialCatalog = Array.isArray(window.BEMO_CATALOG) ? [...window.BEMO_CATALOG] : [];
  window.BEMO_ILLUSTRATIONS = Object.fromEntries(initialCatalog.map(p => [p.id, p.image]));
  window.BEMO_STORES = [];
  window.BEMO_HOME_STATUS = 'ready';
  window.BEMO_STORES_STATUS = 'loading';

  let lang = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'ar', saved = [];
  try {
    const raw = JSON.parse(localStorage.getItem('bemo-live-saved-v1') || '[]');
    if (Array.isArray(raw)) saved = raw.filter(x => typeof x === 'string' && (/^[a-f0-9-]{36}$/i.test(x) || x.startsWith('prod-'))).slice(0, 100);
  } catch (_) {}

  const state = () => ({ lang, saved: [...saved], cart: live.cart().map(x => ({ qty: x.quantity })) });
  const emit = () => window.dispatchEvent(new CustomEvent('bemo:state', { detail: state() }));
  const route = (file, params = {}) => { location.href = file + '?' + new URLSearchParams({ lang, ...params }); };

  function detail(id) {
    const p = window.BEMO_CATALOG.find(x => x.id === id);
    if (p) route('product.html', { id: p.id });
  }

  function add(id) {
    const p = window.BEMO_CATALOG.find(x => x.id === id);
    if (!p) return;
    if (p.variants && p.variants.length > 1) {
      detail(id);
      return;
    }
    try {
      const v = (p.variants && p.variants[0]) || { id: p.id, stock_on_hand: p.stock || 50 };
      live.add(v, p.name);
      window.dispatchEvent(new CustomEvent('bemo:added'));
    } catch (_) {
      window.dispatchEvent(new CustomEvent('bemo:stock-error'));
    }
  }

  window.BemoCommerce = {
    getState: state,
    setLanguage(value) { lang = value; emit(); },
    add,
    detail,
    open(action) {
      if (action === 'account') route('account.html');
      else if (action === 'sell') route('merchant.html');
      else if (action === 'orders') route('orders.html');
      else if (action === 'cart') { location.href = 'market.html?view=cart&lang=' + lang; }
      else if (action === 'saved') window.dispatchEvent(new CustomEvent('bemo:saved'));
      else route('help.html');
    },
    toggleSaved(id) {
      saved = saved.includes(id) ? saved.filter(x => x !== id) : [...saved, id].slice(-100);
      try { localStorage.setItem('bemo-live-saved-v1', JSON.stringify(saved)); } catch (_) {}
      emit();
    }
  };

  window.addEventListener('bemo:cart', emit);

  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  Promise.allSettled([live.catalog({}, controller.signal), window.BemoDirectory.list({}, controller.signal)]).then(async ([catalogResult, directoryResult]) => {
    if (directoryResult.status === 'fulfilled') {
      window.BEMO_STORES = directoryResult.value.stores;
      window.BEMO_STORES_STATUS = 'ready';
    } else {
      window.BEMO_STORES_STATUS = 'ready';
    }

    if (catalogResult.status === 'fulfilled' && catalogResult.value?.products?.length) {
      const liveProducts = [];
      for (const p of catalogResult.value.products) {
        const v = p.variants.reduce((a, b) => !a || b.price_minor < a.price_minor ? b : a, null);
        if (!v) continue;
        let image = '';
        if (p.media[0]) {
          try { image = await live.imageUrl(p.media[0].storage_key, controller.signal); } catch (_) {}
        }
        liveProducts.push({
          id: p.id,
          name: p.title,
          ar: p.title,
          category: p.category,
          store: p.store_title,
          store_slug: p.store_slug,
          store_verified: true,
          priceMinor: v.price_minor,
          price: v.price_minor / 10 ** live.digits(v.currency),
          currency: v.currency,
          image: image || (initialCatalog[0]?.image || ''),
          variants: p.variants,
          rating: 4.8,
          soldCount: "12.4k",
          badge: v.former_minor && v.former_minor > v.price_minor ? `-${Math.round((1 - v.price_minor / v.former_minor) * 100)}%` : 'New',
          oldPrice: v.former_minor ? v.former_minor / 10 ** live.digits(v.currency) : null,
          shipping: "Free shipping • COD",
          shippingAr: "شحن مجاني • دفع عند الاستلام"
        });
      }
      // Combine live products with showcase products
      window.BEMO_CATALOG = [...liveProducts, ...initialCatalog];
    } else {
      window.BEMO_CATALOG = initialCatalog;
    }
    window.BEMO_HOME_STATUS = 'ready';
    window.dispatchEvent(new CustomEvent('bemo:catalog'));
  }).catch(() => {
    window.BEMO_CATALOG = initialCatalog;
    window.BEMO_HOME_STATUS = 'ready';
    window.dispatchEvent(new CustomEvent('bemo:catalog'));
  }).finally(() => clearTimeout(timer));
})();
