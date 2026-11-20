/**
 * BEMO Search Page Controller matching 3SearchFilters.png
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const live = window.BemoLive;
  const params = new URL(location.href).searchParams;

  let query = params.get('q') || '';
  let category = params.get('category') || '';
  let lang = params.get('lang') === 'en' ? 'en' : 'ar';
  let sort = params.get('sort') || 'relevance';
  let currentChip = 'all';

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

  function getCatalog() {
    return window.BEMO_CATALOG || [];
  }

  function updateCartBadge() {
    const cart = live?.cart() || [];
    const count = cart.reduce((acc, it) => acc + (it.quantity || 1), 0);
    const badge = $('headerCartCount');
    if (badge) badge.textContent = count;
  }

  function filterAndSortProducts() {
    let list = [...getCatalog()];

    // Search query filter
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.ar && p.ar.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.descriptionAr && p.descriptionAr.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.store_title && p.store_title.toLowerCase().includes(q))
      );
    }

    // Category filter
    const selectedCatRadio = document.querySelector('input[name="catFilter"]:checked');
    const activeCat = selectedCatRadio ? selectedCatRadio.value : category;
    if (activeCat) {
      list = list.filter(p => p.category === activeCat);
    }

    // Brand Checkboxes
    const checkedBrands = Array.from(document.querySelectorAll('input[name="brandCheck"]:checked')).map(el => el.value.toLowerCase());
    if (checkedBrands.length) {
      list = list.filter(p => checkedBrands.some(b => (p.brand || '').toLowerCase().includes(b) || (p.store_title || '').toLowerCase().includes(b)));
    }

    // Price range
    const minVal = parseFloat($('minPrice')?.value) || 0;
    const maxVal = parseFloat($('maxPrice')?.value) || Infinity;
    if (minVal > 0 || maxVal < Infinity) {
      list = list.filter(p => p.price >= minVal && p.price <= maxVal);
    }

    // Rating filter
    const selectedRating = document.querySelector('input[name="ratingFilter"]:checked');
    if (selectedRating) {
      const minStars = parseFloat(selectedRating.value);
      list = list.filter(p => (p.rating || 4.5) >= minStars);
    }

    // Quick Chips
    if (currentChip === 'rating-4') {
      list = list.filter(p => (p.rating || 4.5) >= 4.0);
    } else if (currentChip === 'deals') {
      list = list.filter(p => p.oldPrice && p.oldPrice > p.price);
    }

    // Verified only
    if ($('verifiedOnlyToggle')?.checked) {
      list = list.filter(p => p.verified !== false);
    }

    // Sorting
    const sortVal = $('sortSelect')?.value || sort;
    if (sortVal === 'price_asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sortVal === 'price_desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (sortVal === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return list;
  }

  function renderGrid() {
    const list = filterAndSortProducts();
    const container = $('searchResultsGrid');
    const countPill = $('resultCountPill');
    const visibleCount = $('visibleCount');
    const highlight = $('queryHighlight');

    if (highlight) highlight.textContent = query ? `«${query}»` : (lang === 'ar' ? 'جميع المنتجات' : 'All Products');
    if (countPill) countPill.textContent = lang === 'ar' ? `${list.length} منتج` : `${list.length} items`;
    if (visibleCount) visibleCount.textContent = `1–${list.length}`;

    if (!list.length) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:48px 20px;background:#FAFAFA;border-radius:12px;border:1px dashed #DDD;">
          <div style="font-size:40px;margin-bottom:8px;">🔍</div>
          <h3 style="font-size:16px;font-weight:700;margin:0 0 6px;">${lang === 'ar' ? 'لا توجد منتجات تطابق خيارات البحث' : 'No products match your search'}</h3>
          <p style="font-size:13px;color:#737373;margin:0 0 16px;">${lang === 'ar' ? 'جرّب تعديل كلمات البحث أو إلغاء بعض الفلاتر.' : 'Try adjusting your search terms or clearing some filters.'}</p>
          <button type="button" id="resetEmptyBtn" style="background:#FF5000;color:#FFF;border:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">
            ${lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
          </button>
        </div>
      `;
      $('resetEmptyBtn')?.addEventListener('click', resetAllFilters);
      return;
    }

    container.innerHTML = list.map(item => {
      const title = lang === 'ar' ? (item.ar || item.name) : item.name;
      const discountPercent = item.oldPrice ? Math.round((1 - item.price / item.oldPrice) * 100) : 0;
      return `
        <article class="bemo-product-card">
          <div class="card-thumb-wrap">
            <a href="product.html?id=${item.id}&lang=${lang}">
              <img src="${item.image}" alt="${title}" loading="lazy" class="card-product-img">
            </a>
            ${discountPercent > 0 ? `<span class="badge-discount-float">-${discountPercent}%</span>` : ''}
            <span class="badge-deal-pill">11.11</span>
            <button type="button" class="btn-heart-float" data-action="save" data-id="${item.id}" aria-label="أضف للمفضلة">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg>
            </button>
          </div>

          <div class="card-body">
            <span class="badge-cod-tag">✓ دفع عند الاستلام</span>
            <a href="store.html?store=${item.store_slug || 'official'}&lang=${lang}" class="card-store-name">
              ${item.store_title || item.store || 'Moda Store'}
              <span class="verified-check">✔</span>
            </a>
            <h3 class="card-title">
              <a href="product.html?id=${item.id}&lang=${lang}">${title}</a>
            </h3>

            <div class="card-price-row">
              <span class="card-current-price">${formatMoney(item.price, item.currency)}</span>
              ${item.oldPrice ? `<del class="card-old-price">${formatMoney(item.oldPrice, item.currency)}</del>` : ''}
            </div>

            <div class="card-social-row">
              <span class="card-stars">★ ${item.rating || 4.8}</span>
              <span class="card-sold-count">${item.soldCount || '1.2k'} بيعت</span>
            </div>

            <button type="button" class="btn-card-add-cart" data-action="add" data-id="${item.id}">
              <span>+ ${lang === 'ar' ? 'أضف للسلة' : 'Add to bag'}</span>
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function resetAllFilters() {
    query = '';
    category = '';
    currentChip = 'all';
    if ($('query')) $('query').value = '';
    if ($('minPrice')) $('minPrice').value = '';
    if ($('maxPrice')) $('maxPrice').value = '';
    document.querySelectorAll('input[name="brandCheck"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="ratingFilter"]').forEach(rb => rb.checked = false);
    const catAll = document.querySelector('input[name="catFilter"][value=""]');
    if (catAll) catAll.checked = true;
    document.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
    document.querySelector('.chip-filter[data-filter-chip="all"]')?.classList.add('active');
    renderGrid();
  }

  // Quick Chips interaction
  $('quickChips')?.addEventListener('click', event => {
    const chip = event.target.closest('.chip-filter');
    if (chip) {
      document.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentChip = chip.dataset.filterChip;
      renderGrid();
    }
  });

  $('clearAllFilters')?.addEventListener('click', resetAllFilters);
  $('sidebarResetBtn')?.addEventListener('click', resetAllFilters);

  // Search input and Category filters
  $('searchForm')?.addEventListener('submit', event => {
    event.preventDefault();
    query = $('query').value.trim();
    renderGrid();
  });

  document.querySelectorAll('input[name="catFilter"]').forEach(radio => {
    radio.addEventListener('change', () => {
      category = radio.value;
      renderGrid();
    });
  });

  document.querySelectorAll('input[name="brandCheck"]').forEach(cb => {
    cb.addEventListener('change', renderGrid);
  });

  $('applyPriceBtn')?.addEventListener('click', renderGrid);
  $('sortSelect')?.addEventListener('change', renderGrid);
  $('verifiedOnlyToggle')?.addEventListener('change', renderGrid);
  $('inStockToggle')?.addEventListener('change', renderGrid);
  $('codOnlyToggle')?.addEventListener('change', renderGrid);

  // Add to cart delegation
  $('searchResultsGrid')?.addEventListener('click', event => {
    const addBtn = event.target.closest('button[data-action="add"]');
    if (addBtn) {
      const prodId = addBtn.dataset.id;
      const catalog = getCatalog();
      const product = catalog.find(p => p.id === prodId);
      if (product) {
        const variant = product.variants?.[0] || { id: `${prodId}-v1`, label: 'Standard', price_minor: Math.round(product.price * 100), currency: product.currency || 'USD' };
        live?.add(variant, product.ar || product.name, {
          image: product.image,
          store_title: product.store_title || product.store,
          store_slug: product.store_slug || 'store',
          variant_label: variant.label
        });
        updateCartBadge();
        addBtn.innerHTML = `<span>✓ ${lang === 'ar' ? 'تمت الإضافة' : 'Added'}</span>`;
        setTimeout(() => {
          addBtn.innerHTML = `<span>+ ${lang === 'ar' ? 'أضف للسلة' : 'Add to bag'}</span>`;
        }, 2000);
      }
    }
  });

  // Language switch
  $('language')?.addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    $('language').textContent = lang === 'ar' ? 'English' : 'العربية';
    renderGrid();
  });

  // Initialize
  if ($('query')) $('query').value = query;
  if (category) {
    const targetCatRadio = document.querySelector(`input[name="catFilter"][value="${category}"]`);
    if (targetCatRadio) targetCatRadio.checked = true;
  }
  updateCartBadge();
  window.addEventListener('bemo:region-change', renderGrid);
  renderGrid();
})();
