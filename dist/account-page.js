(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const isCallback = document.body.dataset.accountView === 'callback';
  const words = {
    manageProducts:['إدارة المنتجات والمخزون','Manage products and stock'],
    directory:['استعرض دليل المتاجر','Browse the store directory'],
    skip:['انتقل إلى المحتوى','Skip to content'], development:['نسخة تطوير — المنتجات والطلبات للتجربة؛ البيع الفعلي غير متاح بعد.','Development preview · Sample products and orders. Real selling is not available yet.'],
    browse:['استكشف المنتجات','Explore products'], yourSpace:['مساحتك في BEMO','YOUR SPACE AT BEMO'], welcome:['أهلاً بك.\nكل بداية جميلة، هنا.','Hello, you.\nGood things start here.'], welcomeCopy:['حساب واحد لملفك الشخصي ومتجرك. ابدأ بحساب Gmail الخاص بك.','One account for your profile and your store. Start with your Gmail account.'],
    benefitOne:['دخول مباشر باستخدام Google','Continue with Google'], benefitOneCopy:['استخدم حساب Gmail الذي تختاره.','Use the Gmail account you choose.'], benefitTwo:['متجر واحد باسمك','One store, your own name'], benefitTwoCopy:['اختر اسمه ومعرّفه ووصفه بعد إكمال حسابك.','Choose its name, identifier and description once your account is ready.'], benefitThree:['بداية بلا رسوم منصة','Start with zero platform fees'], benefitThreeCopy:['رسوم BEMO في الإصدار الأول صفر.','BEMO platform fees are zero in V1.'], backToMarket:['العودة إلى السوق التجريبي','Back to the demo marketplace'],
    checking:['جارٍ التحقق من حسابك','Checking your account'], checkingCopy:['لحظات، ونجهّز مساحتك.','Just a moment while we get your space ready.'], retry:['إعادة المحاولة','Try again'], signOut:['تسجيل الخروج','Sign out'], startHere:['لنبدأ','LET’S BEGIN'], signInTitle:['حسابك، بطريقتك.','Your account. Your space.'], signInCopy:['تابع باستخدام Google للوصول إلى حسابك وإنشاء متجرك.','Continue with Google to access your account and create your store.'], google:['المتابعة باستخدام Google','Continue with Google'], checkAgain:['تحقق مجدداً','Check again'], browseWithoutAccount:['يمكنك استكشاف المجموعة التجريبية دون تسجيل الدخول.','You can explore the sample collection without signing in.'],
    providerReady:['استخدم حساب Gmail الخاص بك.','Use your Gmail account.'], providerDisabled:['تسجيل الدخول باستخدام Google غير متاح حالياً. يمكنك متابعة استكشاف السوق التجريبي.','Google sign-in is not available yet. You can keep exploring the demo marketplace.'], providerOffline:['تعذّر التحقق من إمكانية الدخول. تحقق من اتصالك وأعد المحاولة.','We could not check sign-in availability. Check your connection and try again.'], providerChecking:['نتحقق من إمكانية تسجيل الدخول…','Checking sign-in availability…'], redirecting:['جارٍ الانتقال إلى Google…','Taking you to Google…'],
    oneMoreStep:['خطوة واحدة','ONE MORE STEP'], completeProfile:['أكمل ملفك الشخصي','Make yourself at home'], profileIntro:['اختر الاسم الذي تريد استخدامه واللغة التي تفضّلها.','Choose the name you would like to use and your preferred language.'], email:['البريد','Email'], displayName:['الاسم','Name'], namePlaceholder:['الاسم الذي تود استخدامه','The name you would like to use'], preferredLanguage:['لغة الحساب','Account language'], finishProfile:['حفظ ومتابعة','Save and continue'], differentAccount:['الخروج لاستخدام حساب آخر','Sign out to use another account'], myAccount:['حسابي','MY ACCOUNT'], profileTitle:['ملفك الشخصي','Your profile'], saveChanges:['حفظ التغييرات','Save changes'],
    sellerSpace:['مساحة البائع','SELLER SPACE'], yourStore:['متجرك في BEMO','Your BEMO store'], storeIntro:['ابدأ بمتجر واحد لحسابك، دون انتظار موافقة مسبقة.','Start one store for your account, without waiting for preapproval.'], storeName:['اسم المتجر','Store name'], storeNamePlaceholder:['اسم يعكس متجرك','A name that feels like your store'], storeIdentifier:['معرّف المتجر','Store identifier'], slugHelp:['من 3 إلى 48 حرفاً إنجليزياً صغيراً أو رقماً، مع فواصل -. اختر معرّفاً فريداً.','Use 3–48 lowercase English letters or numbers, separated by hyphens. Choose a unique identifier.'], storeDescription:['وصف المتجر (اختياري)','Store description (optional)'], descriptionPlaceholder:['عرّف الزوار بمتجرك وما تنوي تقديمه.','Tell visitors about your store and what you plan to offer.'], storePublicNote:['سيظهر اسم المتجر ووصفه ومعرّفه في دليل المتاجر. لا تتوفر ميزة تعديلها أو إغلاق المتجر في هذه المرحلة.','Your store name, description and identifier will appear in the store directory. Editing these details and closing a store are not available at this stage.'], oneStoreNote:['لكل حساب متجر واحد؛ يمكنك إدارة المنتجات والمخزون؛ استقبال الطلبات قيد الإعداد.','Each account has one store. Manage your products and stock; order placement is being prepared.'], createStore:['إنشاء متجري','Create my store'], storeSavedNote:['حُفظ متجرك في حسابك. يمكنك إدارة المنتجات والمخزون؛ استقبال الطلبات قيد الإعداد.','Your store is saved to your account. Manage your products and stock; order placement is being prepared.'],
    realDataNote:['بيانات الحساب والمتجر هنا مستقلة عن المنتجات والطلبات التجريبية في السوق.','Your account and store details here are separate from the sample products and demo orders in the marketplace.'], footerLine:['عالم من الاكتشافات الجميلة.','A world of good finds.'], callbackTitle:['نُكمل تسجيل دخولك','Finishing your sign-in'], callbackCopy:['لحظات، ونعيدك إلى حسابك.','Just a moment. We will take you to your account.'], callbackFailed:['لم يكتمل تسجيل الدخول','Sign-in was not completed'], callbackFailedCopy:['يمكنك العودة إلى الحساب والمحاولة من جديد.','You can return to your account and try again.'], returnToAccount:['العودة إلى الحساب','Back to your account'], profileSaved:['تم حفظ بيانات حسابك.','Your profile is saved.'], storeCreated:['تم إنشاء متجرك وحفظه في حسابك.','Your store has been created and saved to your account.'], signedOut:['تم تسجيل الخروج.','You are signed out.'], ACTIVE:['نشط','Active'], CLOSED:['مغلق','Closed'], SUSPENDED:['موقوف','Suspended'], storeStatusUnknown:['غير متاح','Unavailable']
  };
  const errors = {
    CONFIG_INVALID:['الحساب غير متاح حالياً. حاول مرة أخرى لاحقاً.','Accounts are not available right now. Please try again later.'], SDK_UNAVAILABLE:['تعذّر تحميل صفحة الحساب بالكامل. أعد تحميل الصفحة.','The account page could not load completely. Reload the page.'], STORAGE_UNAVAILABLE:['يلزم السماح للموقع بحفظ جلسة الدخول في هذا المتصفح. تحقق من إعدادات الخصوصية ثم أعد المحاولة.','This site needs browser storage to keep your sign-in session. Check your privacy settings and try again.'],
    PROVIDER_DISABLED:['تسجيل الدخول باستخدام Google غير متاح حالياً.','Google sign-in is not available yet.'], PROVIDER_MISCONFIGURED:['تسجيل الدخول غير متاح حالياً. يمكنك استكشاف السوق والعودة لاحقاً.','Sign-in is not available right now. You can explore the marketplace and return later.'], NETWORK_ERROR:['تعذّر الاتصال. تحقق من الإنترنت وأعد المحاولة؛ لم نؤكد حفظ التغييرات.','We could not connect. Check your internet and try again; changes have not been confirmed as saved.'], AUTH_REQUIRED:['سجّل الدخول إلى حسابك للمتابعة.','Sign in to your account to continue.'], SESSION_CHANGED:['تغيّرت جلسة الدخول. تحقق من الحساب الحالي وأعد المحاولة.','Your sign-in session changed. Check the current account and try again.'],
    CALLBACK_MISSING:['رابط العودة لا يحتوي على معلومات دخول صالحة. ابدأ تسجيل الدخول من صفحة الحساب.','This return link has no valid sign-in information. Start again from the account page.'], CALLBACK_DENIED:['لم تُمنح الموافقة على تسجيل الدخول. يمكنك البدء من جديد عندما تكون مستعداً.','Sign-in was not approved. You can start again when you are ready.'], CALLBACK_INVALID:['انتهت صلاحية رابط الدخول أو تعذّر إكماله في هذا المتصفح. ابدأ من صفحة الحساب مجدداً.','This sign-in link expired or could not be completed in this browser. Start again from the account page.'], AUTH_EXPIRED:['انتهت جلسة الدخول. سجّل الخروج ثم ادخل مجدداً.','Your session expired. Sign out and sign in again.'], ACCOUNT_UNAVAILABLE:['هذا الحساب غير متاح حالياً. لا يمكن استخدامه لإنشاء متجر أو تعديل بياناته.','This account is not available right now. It cannot create a store or update its details.'], GOOGLE_REQUIRED:['استخدم تسجيل الدخول عبر Google للمتابعة.','Use Google sign-in to continue.'], GMAIL_REQUIRED:['يتطلب BEMO حساب Google بعنوان ينتهي بـ ‎@gmail.com. جرّب حساب Gmail آخر.','BEMO requires a Google account with an @gmail.com address. Try another Gmail account.'],
    PROFILE_INVALID:['أدخل اسماً من 1 إلى 80 حرفاً واختر لغة الحساب.','Enter a name of 1–80 characters and choose an account language.'], STORE_INVALID:['راجع اسم المتجر ومعرّفه ووصفه، ثم حاول مجدداً.','Check the store name, identifier and description, then try again.'], SLUG_RESERVED:['معرّف المتجر هذا محجوز. اختر معرّفاً آخر.','This store identifier is reserved. Choose another one.'], STORE_EXISTS:['لديك متجر بالفعل. أعد تحميل بيانات الحساب لعرضه.','You already have a store. Refresh your account to see it.'], SLUG_TAKEN:['معرّف المتجر مستخدم. اختر معرّفاً مختلفاً.','That store identifier is already in use. Choose a different one.'], TITLE_TAKEN:['اسم المتجر مستخدم. اختر اسماً آخر.','That store name is already in use. Choose another one.'], EMAIL_CONFLICT:['تعذّر إكمال الحساب بهذا البريد. سجّل الخروج وتحقق من حساب Google الذي تستخدمه.','We could not complete this account with that email. Sign out and check which Google account you are using.'],
    REQUEST_FAILED:['تعذّر إكمال العملية. أعد المحاولة؛ لم نؤكد حفظ التغييرات.','We could not complete the request. Try again; changes have not been confirmed as saved.'], SIGNOUT_FAILED:['أُخفيت بياناتك من هذه الصفحة، لكن تعذّر تأكيد تسجيل الخروج. تحقق من اتصالك واضغط إعادة المحاولة لإكمال الخروج.','Your details are hidden on this page, but sign-out could not be confirmed. Check your connection and choose Try again to finish signing out.'], RESPONSE_INVALID:['تعذّر التحقق من بيانات الحساب. أعد تحميلها للمحاولة مجدداً.','We could not verify the account details. Refresh them to try again.'], ORIGIN_NOT_ALLOWED:['ابدأ تسجيل الدخول من رابط BEMO المنشور.','Start sign-in from the published BEMO site.']
  };
  let lang = 'ar';
  try {
    const queryLanguage = new URL(location.href).searchParams.get('lang');
    const savedLanguage = localStorage.getItem('bemo-account-language');
    const demoLanguage = JSON.parse(localStorage.getItem('bemo-preview-v1') || '{}').lang;
    lang = [queryLanguage, savedLanguage, demoLanguage].find(value => value === 'ar' || value === 'en') || 'ar';
  } catch (_) { lang = new URL(location.href).searchParams.get('lang') === 'en' ? 'en' : 'ar'; }
  const text = key => (words[key] || ['', ''])[lang === 'ar' ? 0 : 1];
  const errorText = code => (errors[code] || errors.REQUEST_FAILED)[lang === 'ar' ? 0 : 1];
  let state = null, previousOwner = '', profileSeededFor = '', successKey = '', callbackFailure = '', actionRunning = false, storeTargetShown = false;
  const api = window.BemoAccount;

  function setLanguage(value) {
    lang = value;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = isCallback ? (lang === 'ar' ? 'إكمال تسجيل الدخول — BEMO' : 'Finishing sign-in — BEMO') : (lang === 'ar' ? 'حسابك — BEMO' : 'Your account — BEMO');
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = text(node.dataset.i18n); });
    document.querySelectorAll('[data-placeholder]').forEach(node => { node.placeholder = text(node.dataset.placeholder); });
    document.querySelectorAll('[data-route]').forEach(node => { node.href = node.dataset.route + '?lang=' + lang; });
    document.querySelectorAll('[data-nav-label]').forEach(node => { node.setAttribute('aria-label', lang === 'ar' ? 'التنقل' : 'Navigation'); });
    $('languageButton').textContent = lang === 'ar' ? 'English' : 'العربية';
    $('languageButton').lang = lang === 'ar' ? 'en' : 'ar';
    $('languageButton').setAttribute('aria-label', lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
    if (!isCallback && state) render(state);
    if (isCallback && callbackFailure) showCallbackError(callbackFailure, false);
  }
  $('languageButton').addEventListener('click', () => {
    setLanguage(lang === 'ar' ? 'en' : 'ar');
    try { localStorage.setItem('bemo-account-language', lang); } catch (_) {}
    if (!isCallback) {
      const destination = new URL(location.href);
      destination.searchParams.set('lang', lang);
      history.replaceState(null, '', destination.pathname + destination.search + destination.hash);
    }
  });
  setLanguage(lang);

  function showCallbackError(code, focus = true) {
    callbackFailure = code || 'CALLBACK_INVALID';
    $('callbackSpinner').hidden = true;
    $('callbackTitle').textContent = text('callbackFailed');
    $('callbackMessage').textContent = text('callbackFailedCopy');
    $('callbackError').textContent = errorText(callbackFailure);
    $('callbackError').hidden = false;
    $('callbackReturn').hidden = false;
    if (focus) $('callbackError').focus();
  }
  if (isCallback) {
    if (!api) { showCallbackError('SDK_UNAVAILABLE'); return; }
    api.completeCallback().then(result => {
      if (result?.phase === 'ready' || result?.phase === 'onboarding') location.replace('account.html?lang=' + lang);
      else showCallbackError(result?.error?.code || 'CALLBACK_INVALID');
    }).catch(() => showCallbackError('CALLBACK_INVALID'));
    return;
  }

  function clearPrivateForms() {
    $('profileForm').reset(); $('onboardingForm').reset(); $('storeForm').reset();
    $('profileEmail').textContent = ''; $('onboardingEmail').textContent = '';
    $('savedStoreName').textContent = ''; $('savedStoreSlug').textContent = ''; $('savedStoreDescription').textContent = '';
    $('accountAvatar').textContent = ''; $('storeInitial').textContent = ''; $('savedStoreStatus').textContent = '';
    profileSeededFor = ''; previousOwner = ''; successKey = ''; storeTargetShown = false;
  }
  function render(next) {
    state = next;
    const phase = next.phase || 'error', busy = !!next.busy || actionRunning;
    const owner = next.identity?.email || next.profile?.email || '';
    // Also clear hidden DOM values when the engine clears its verified identity.
    // A pending write retains that identity, so validation errors preserve drafts.
    if (previousOwner && owner !== previousOwner) clearPrivateForms();
    if (owner) previousOwner = owner;
    const loading = phase === 'idle' || phase === 'loading' || phase === 'redirecting';
    $('pageLoading').hidden = !loading;
    $('pageLoading').querySelector('h2').textContent = phase === 'redirecting' ? text('redirecting') : text('checking');
    $('signInPanel').hidden = !['guest', 'blocked', 'error'].includes(phase);
    $('onboardingPanel').hidden = phase !== 'onboarding';
    $('profilePanel').hidden = phase !== 'ready';
    $('storePanel').hidden = phase !== 'ready';
    $('pageMessage').hidden = !successKey;
    $('pageMessage').textContent = successKey ? text(successKey) : '';
    $('pageError').hidden = !next.error;
    $('pageErrorText').textContent = next.error ? errorText(next.error.code) : '';
    $('retryButton').hidden = !next.error?.retryable;
    $('recoverySignOut').hidden = !['blocked','error'].includes(phase) || next.error?.code === 'SIGNOUT_FAILED';
    $('googleButton').disabled = busy || next.provider !== 'ready' || phase !== 'guest';
    $('providerMessage').textContent = next.provider === 'ready' ? text('providerReady') : next.provider === 'offline' ? text('providerOffline') : ['disabled','misconfigured'].includes(next.provider) ? text('providerDisabled') : text('providerChecking');
    $('providerRetry').hidden = next.provider === 'ready';
    $('providerRetry').disabled = busy;
    $('retryButton').disabled = busy; $('recoverySignOut').disabled = busy;
    for (const form of [$('onboardingForm'), $('profileForm'), $('storeForm')]) {
      form.setAttribute('aria-busy', String(busy));
      form.querySelectorAll('input,select,textarea,button').forEach(input => { input.disabled = busy; });
    }
    $('onboardingSignOut').disabled = busy;
    if (phase === 'onboarding') {
      $('onboardingEmail').textContent = next.identity?.email || '';
      if (!$('onboardingName').value) $('onboardingLocale').value = lang;
    }
    if (phase === 'ready' && next.profile) {
      const profile = next.profile;
      $('profileEmail').textContent = profile.email || '';
      $('accountAvatar').textContent = Array.from(profile.display_name || 'B')[0];
      if (profileSeededFor !== profile.id) {
        $('profileName').value = profile.display_name || '';
        $('profileLocale').value = profile.locale === 'en' ? 'en' : 'ar';
        profileSeededFor = profile.id;
      }
      $('newStoreArea').hidden = !!next.store;
      $('existingStoreArea').hidden = !next.store;
      if (next.store) {
        $('savedStoreName').textContent = next.store.title || '';
        $('savedStoreSlug').textContent = next.store.slug || '';
        $('savedStoreDescription').textContent = next.store.description || '';
        $('savedStoreDescription').hidden = !next.store.description;
        $('storeInitial').textContent = Array.from(next.store.title || 'B')[0];
        $('savedStoreStatus').textContent = text(['ACTIVE','CLOSED','SUSPENDED'].includes(next.store.status) ? next.store.status : 'storeStatusUnknown');
      }
      if (!busy && location.hash === '#store' && !storeTargetShown) {
        storeTargetShown = true;
        $('storePanel').scrollIntoView({block:'start',behavior:'auto'});
        $('storeTitle').focus({preventScroll:true});
      }
    }
  }
  async function runAction(action, success = '', focusTarget = null, verified = null) {
    if (actionRunning || !api) return;
    const startingOwner = state?.identity?.email || state?.profile?.email || '';
    actionRunning = true; successKey = ''; if (state) render(state);
    try {
      const result = await action();
      actionRunning = false;
      if (result?.error) { render(result); $('pageError').focus(); return; }
      const currentOwner = result?.identity?.email || result?.profile?.email || '';
      const confirmed = !success || (success === 'signedOut' ? result?.phase === 'guest' : result?.phase === 'ready' && currentOwner === startingOwner && (!verified || verified(result)));
      if (!confirmed) {
        render({...api.getState(), error:{code:'SESSION_CHANGED',retryable:true}});
        $('pageError').focus();
        return;
      }
      if (success === 'profileSaved' && result?.phase === 'ready') profileSeededFor = '';
      if (success === 'signedOut' && result?.phase === 'guest') clearPrivateForms();
      successKey = success;
      render(result || api.getState());
      if (successKey) $('pageMessage').scrollIntoView({block:'nearest',behavior:'auto'});
      if (focusTarget && !focusTarget.closest('[hidden]')) focusTarget.focus();
    } catch (_) {
      actionRunning = false;
      render({...api.getState(), error:{code:'REQUEST_FAILED',retryable:true}});
      $('pageError').focus();
    }
  }
  const bindClick = (id, action, success = '') => $(id).addEventListener('click', () => runAction(action, success, $(id)));
  if (!api) {
    render({phase:'error',provider:'unknown',busy:false,error:{code:'SDK_UNAVAILABLE',retryable:false}});
    $('providerRetry').hidden = true; $('recoverySignOut').hidden = true;
    return;
  }
  api.subscribe(render);
  bindClick('googleButton', () => api.signIn());
  bindClick('providerRetry', () => api.refresh());
  bindClick('retryButton', () => state?.error?.code === 'SIGNOUT_FAILED' ? api.signOut() : api.refresh());
  for (const id of ['signOutButton','onboardingSignOut','recoverySignOut']) bindClick(id, () => api.signOut(), 'signedOut');
  for (const formId of ['onboardingForm','profileForm']) {
    $(formId).addEventListener('submit', event => {
      event.preventDefault(); const form=event.currentTarget;
      const name = form.elements.display_name;
      name.setCustomValidity(name.value.trim() ? '' : errorText('PROFILE_INVALID'));
      if (!form.reportValidity()) return;
      const input = {display_name:name.value.trim(),locale:form.elements.locale.value};
      runAction(() => api.saveProfile(input), 'profileSaved', formId === 'onboardingForm' ? $('profileTitle') : form.querySelector('[type=submit]'), result => result.profile?.display_name === input.display_name && result.profile?.locale === input.locale);
    });
  }
  $('storeForm').addEventListener('submit', event => {
    event.preventDefault(); const form=event.currentTarget;
    const title=form.elements.title;
    title.setCustomValidity(title.value.trim().length >= 2 ? '' : errorText('STORE_INVALID'));
    if (!form.reportValidity()) return;
    const input = {title:title.value.trim(),slug:form.elements.slug.value.trim().toLowerCase(),description:form.elements.description.value};
    runAction(() => api.createStore(input), 'storeCreated', $('storeTitle'), result => result.store?.title === input.title && result.store?.slug === input.slug && result.store?.description === input.description);
  });
  document.querySelectorAll('.account-form input').forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
  api.initialize().catch(() => render({phase:'error',provider:'offline',error:{code:'NETWORK_ERROR',retryable:true}}));
})();
