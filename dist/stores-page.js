(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const words = {
    skip:['انتقل إلى المحتوى','Skip to content'], development:['متاجر مسجّلة في BEMO · المنتجات والبيع الفعلي قيد الإعداد.','Registered BEMO stores · Products and real selling are being prepared.'],
    account:['حسابي ومتجري','My account & store'], kicker:['أصحاب متاجر. بدايات جديدة.','STORE OWNERS. NEW BEGINNINGS.'], title:['اكتشف متاجر BEMO','Discover BEMO stores'], intro:['تعرّف على المتاجر المسجّلة وأسمائها وأوصافها، وابحث عن متجر بالاسم أو المعرّف.','Meet registered stores, read their introductions, and search by name or store identifier.'], create:['افتح متجرك','Open your store'], label:['ابحث عن متجر','Find a store'], placeholder:['اسم المتجر أو معرّفه','Store name or identifier'], search:['بحث','Search'], order:['الأحدث انضماماً أولاً','Most recently joined first'], clear:['عرض جميع المتاجر','Show all stores'], loading:['جارٍ تحميل المتاجر…','Loading stores…'], error:['تعذّر تحميل المتاجر. تحقق من اتصالك وأعد المحاولة.','We could not load stores. Check your connection and try again.'], retry:['إعادة المحاولة','Try again'], emptyTitle:['لا توجد متاجر هنا بعد','No stores here yet'], empty:['كن من أوائل أصحاب المتاجر في BEMO.','Be one of the first store owners on BEMO.'], noMatch:['لم نجد متجراً يطابق بحثك. جرّب اسماً آخر أو اعرض جميع المتاجر.','No stores match your search. Try another name or show all stores.'], previous:['السابق','Previous'], next:['التالي','Next'], page:['الصفحة','Page'], shown:['المتاجر المعروضة','Stores shown'], noDescription:['لم يضف صاحب المتجر وصفاً بعد.','The owner has not added an introduction yet.'], noteTitle:['عن هذا الدليل','About this directory'], note:['تظهر هنا بيانات المتاجر المسجّلة فعلياً. وجود المتجر في الدليل لا يعني حصوله على توثيق أو اعتماد من BEMO. عرض المنتجات والطلبات الحقيقية لم يُفعّل بعد.','This directory shows real registered stores. Being listed does not mean a store is verified or endorsed by BEMO. Real product listings and orders are not available yet.'], demo:['استكشف المنتجات التجريبية','Explore sample products'], footer:['عالم من الاكتشافات الجميلة.','A world of good finds.'], queryInvalid:['اكتب حتى 120 حرفاً للبحث.','Use up to 120 characters to search.']
  };
  let lang = 'ar', current = {search:'',page:1}, data = null, pending, sequence = 0;
  const text = key => words[key][lang === 'ar' ? 0 : 1];
  function readUrl() {
    const params = new URL(location.href).searchParams;
    lang = params.get('lang') === 'en' ? 'en' : 'ar';
    try { current = window.BemoDirectory.query({search:params.get('q') || '',page:params.get('page') || 1}); }
    catch (_) { current = {search:'',page:1}; }
    $('storeQuery').value = current.search;
  }
  function writeUrl(replace = false) {
    const params = new URLSearchParams({lang});
    if (current.search) params.set('q',current.search);
    if (current.page > 1) params.set('page',String(current.page));
    history[replace ? 'replaceState' : 'pushState'](null,'',location.pathname + '?' + params);
  }
  function language() {
    document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = text('title') + ' — BEMO';
    document.querySelectorAll('[data-t]').forEach(node => { node.textContent = text(node.dataset.t); });
    document.querySelectorAll('[data-route]').forEach(node => { node.href = node.dataset.route + '?lang=' + lang; });
    document.querySelector('[data-store-route]').href = 'account.html?lang=' + lang + '#store';
    $('storeQuery').placeholder = text('placeholder');
    $('languageButton').textContent = lang === 'ar' ? 'English' : 'العربية';
    $('languageButton').setAttribute('aria-label',lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    $('directoryPagination').setAttribute('aria-label',lang === 'ar' ? 'صفحات المتاجر' : 'Store pages');
    document.querySelector('.header-row nav').setAttribute('aria-label',lang === 'ar' ? 'التنقل' : 'Navigation');
  }
  function render() {
    $('directoryResults').replaceChildren();
    $('directoryEmpty').hidden = data.stores.length !== 0;
    $('emptyCopy').textContent = current.search ? text('noMatch') : text('empty');
    for (const store of data.stores) {
      const card = document.createElement('article'); card.className = 'directory-store';
      const mark = document.createElement('span'); mark.className = 'store-mark'; mark.setAttribute('aria-hidden','true'); mark.textContent = [...store.title][0];
      const title = document.createElement('h2'); title.textContent = store.title;
      const slug = document.createElement('span'); slug.className = 'store-slug'; slug.textContent = store.slug;
      const description = document.createElement('p'); description.className = 'store-description' + (store.description ? '' : ' no-description'); description.textContent = store.description || text('noDescription');
      card.append(mark,title,slug,description); $('directoryResults').append(card);
    }
    $('directoryStatus').textContent = data.stores.length ? text('shown') + ': ' + data.stores.length : '';
    $('directoryPagination').hidden = current.page === 1 && !data.hasNext;
    $('previousPage').disabled = current.page === 1; $('nextPage').disabled = !data.hasNext;
    $('pageNumber').textContent = text('page') + ' ' + current.page;
  }
  async function load() {
    const ticket = ++sequence;
    if (pending) pending.abort();
    const controller = new AbortController(); pending = controller;
    const timeout = setTimeout(() => controller.abort(),12000);
    data = null;
    $('directoryResults').replaceChildren(); $('directoryResults').setAttribute('aria-busy','true');
    $('directoryError').hidden = true; $('directoryEmpty').hidden = true; $('directoryPagination').hidden = true;
    $('directoryStatus').textContent = text('loading'); $('clearSearch').hidden = !current.search;
    try {
      const result = await window.BemoDirectory.list(current,controller.signal);
      if (ticket !== sequence) return;
      data = result; render();
    } catch (_) {
      if (ticket !== sequence) return;
      $('directoryStatus').textContent = ''; $('directoryError').hidden = false;
    } finally {
      clearTimeout(timeout);
      if (ticket === sequence) { pending = null; $('directoryResults').setAttribute('aria-busy','false'); }
    }
  }
  function navigate(next) { current = next; writeUrl(); load(); }
  $('directorySearch').addEventListener('submit',event => {
    event.preventDefault();
    try { const next = window.BemoDirectory.query({search:$('storeQuery').value,page:1}); $('storeQuery').setCustomValidity(''); navigate(next); }
    catch (_) { $('storeQuery').setCustomValidity(text('queryInvalid')); $('storeQuery').reportValidity(); }
  });
  $('storeQuery').addEventListener('input',() => $('storeQuery').setCustomValidity(''));
  $('clearSearch').addEventListener('click',() => { $('storeQuery').value = ''; $('storeQuery').setCustomValidity(''); navigate({search:'',page:1}); });
  $('directoryRetry').addEventListener('click',load);
  $('previousPage').addEventListener('click',() => { if (current.page > 1) navigate({...current,page:current.page - 1}); });
  $('nextPage').addEventListener('click',() => { if (data?.hasNext) navigate({...current,page:current.page + 1}); });
  $('languageButton').addEventListener('click',() => { lang = lang === 'ar' ? 'en' : 'ar'; language(); writeUrl(true); if (data) render(); else if (pending) $('directoryStatus').textContent = text('loading'); });
  window.addEventListener('popstate',() => { readUrl(); language(); load(); });
  readUrl(); language(); load();
})();
