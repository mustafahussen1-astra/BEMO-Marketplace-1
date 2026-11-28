(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const isCallback = document.body.dataset.accountView === 'callback';
  const words = {
    logo:['شعار المتجر (اختياري)','Store logo (optional)'],cover:['غلاف المتجر (اختياري)','Store cover (optional)'],
    privateIdentity:['بيانات البائع الخاصة','Private seller information'],legalName:['الاسم القانوني','Legal name'],
    sellerPhone:['رقم الهاتف مع رمز الدولة','Phone including country code'],sellerAddress:['العنوان الشخصي','Personal address'],
    identityFile:['مستند الهوية (PDF أو صورة، حتى 5 ميغابايت)','Identity document (PDF, JPG or PNG, up to 5 MB)'],
    identityNotice:['تُحفظ الهوية والعنوان وبيانات الاتصال في سجل خاص.','Your identity document, address and contact information are stored privately.'],
    sellerAgreement:['أوافق على حفظ بياناتي الخاصة للتحقق من هوية البائع ونشر اسم المتجر ومعرّفه ووصفه.','I agree to storage of my private information for seller identification and publication of my store name, username and description.'],
    addProduct:['إضافة منتج','Add product'],
    manageProducts:['إدارة المنتجات والمخزون','Manage products and stock'],
    directory:['استعرض دليل المتاجر','Browse the store directory'],
    skip:['انتقل إلى المحتوى','Skip to content'], development:['نسخة تطوير — المنتجات والطلبات للتجربة؛ البيع الفعلي غير متاح بعد.','Development preview · Sample products and orders. Real selling is not available yet.'],
    browse:['استكشف المنتجات','Explore products'], yourSpace:['مساحتك في BEMO','YOUR SPACE AT BEMO'], welcome:['أهلاً بك.\nكل بداية جميلة، هنا.','Hello, you.\nGood things start here.'], welcomeCopy:['حساب واحد لملفك الشخصي ومتجرك. ابدأ بحساب Gmail الخاص بك.','One account for your profile and your store. Start with your Gmail account.'],
    benefitOne:['دخول مباشر باستخدام Google','Continue with Google'], benefitOneCopy:['استخدم حساب Gmail الذي تختاره.','Use the Gmail account you choose.'], benefitTwo:['متجر واحد باسمك','One store, your own name'], benefitTwoCopy:['اختر اسمه ومعرّفه ووصفه بعد إكمال حسابك.','Choose its name, identifier and description once your account is ready.'], benefitThree:['بداية بلا رسوم منصة','Start with zero platform fees'], benefitThreeCopy:['رسوم BEMO في الإصدار الأول صفر.','BEMO platform fees are zero in V1.'], backToMarket:['العودة إلى السوق التجريبي','Back to the demo marketplace'],
    checking:['جارٍ التحقق من حسابك','Checking your account'], checkingCopy:['لحظات، ونجهّز مساحتك.','Just a moment while we get your space ready.'], retry:['إعادة المحاولة','Try again'], signOut:['تسجيل الخروج','Sign out'], startHere:['لنبدأ','LET’S BEGIN'], signInTitle:['حسابك، بطريقتك.','Your account. Your space.'], signInCopy:['تابع باستخدام Google للوصول إلى حسابك وإنشاء متجرك.','Continue with Google to access your account and create your store.'], google:['المتابعة باستخدام Google','Continue with Google'], checkAgain:['تحقق مجدداً','Check again'], browseWithoutAccount:['يمكنك استكشاف المجموعة التجريبية دون تسجيل الدخول.','You can explore the sample collection without signing in.'],
    providerReady:['استخدم حساب Gmail الخاص بك.','Use your Gmail account.'], providerDisabled:['تسجيل الدخول باستخدام Google غير متاح حالياً. يمكنك متابعة استكشاف السوق التجريبي.','Google sign-in is not available yet. You can keep exploring the demo marketplace.'], providerOffline:['تعذّر التحقق من إمكانية الدخول. تحقق من اتصالك وأعد المحاولة.','We could not check sign-in availability. Check your connection and try again.'], providerChecking:['نتحقق من إمكانية تسجيل الدخول…','Checking sign-in availability…'], redirecting:['جارٍ الانتقال إلى Google…','Taking you to Google…'],
    oneMoreStep:['خطوة واحدة','ONE MORE STEP'], completeProfile:['أكمل ملفك الشخصي','Make yourself at home'], profileIntro:['اختر الاسم الذي تريد استخدامه واللغة التي تفضّلها.','Choose the name you would like to use and your preferred language.'], email:['البريد','Email'], displayName:['الاسم','Name'], namePlaceholder:['الاسم الذي تود استخدامه','The name you would like to use'], preferredLanguage:['لغة الحساب','Account language'], finishProfile:['حفظ ومتابعة','Save and continue'], differentAccount:['الخروج لاستخدام حساب آخر','Sign out to use another account'], myAccount:['حسابي','MY ACCOUNT'], profileTitle:['ملفك الشخصي','Your profile'], saveChanges:['حفظ التغييرات','Save changes'],
    sellerSpace:['مساحة البائع','SELLER SPACE'], yourStore:['متجرك في BEMO','Your BEMO store'], storeIntro:['ابدأ بمتجر واحد لحسابك، دون انتظار موافقة مسبقة.','Start one store for your account, without waiting for preapproval.'], storeName:['اسم المتجر','Store name'], storeNamePlaceholder:['اسم يعكس متجرك','A name that feels like your store'], storeIdentifier:['معرّف المتجر','Store identifier'], slugHelp:['من 3 إلى 48 حرفاً إنجليزياً صغيراً أو رقماً، مع فواصل -. اختر معرّفاً فريداً.','Use 3–48 lowercase English letters or numbers, separated by hyphens. Choose a unique identifier.'], storeDescription:['وصف المتجر (اختياري)','Store description (optional)'], descriptionPlaceholder:['عرّف الزوار بمتجرك وما تنوي تقديمه.','Tell visitors about your store and what you plan to offer.'], storePublicNote:['سيظهر اسم المتجر ووصفه ومعرّفه في دليل المتاجر. لا تتوفر ميزة تعديلها أو إغلاق المتجر في هذه المرحلة.','Your store name, description and identifier will appear in the store directory. Editing these details and closing a store are not available at this stage.'], oneStoreNote:['لكل حساب متجر واحد؛ يمكنك إدارة المنتجات والمخزون؛ تابع الطلبات من مساحة الطلبات.','Each account has one store. Manage your products and stock; track orders from the orders workspace.'], createStore:['إنشاء متجري','Create my store'], storeSavedNote:['حُفظ متجرك في حسابك. يمكنك إدارة المنتجات والمخزون؛ تابع الطلبات من مساحة الطلبات.','Your store is saved to your account. Manage your products and stock; track orders from the orders workspace.'],
    realDataNote:['حسابك ومتجرك ومنتجاتك وطلباتك مرتبطة بالخدمة.','Your account, store, products and orders are connected to the service.'], footerLine:['عالم من الاكتشافات الجميلة.','A world of good finds.'], callbackTitle:['نُكمل تسجيل دخولك','Finishing your sign-in'], callbackCopy:['لحظات، ونعيدك إلى حسابك.','Just a moment. We will take you to your account.'], callbackFailed:['لم يكتمل تسجيل الدخول','Sign-in was not completed'], callbackFailedCopy:['يمكنك العودة إلى الحساب والمحاولة من جديد.','You can return to your account and try again.'], returnToAccount:['العودة إلى الحساب','Back to your account'], profileSaved:['تم حفظ بيانات حسابك.','Your profile is saved.'], storeCreated:['تم إنشاء متجرك وحفظه في حسابك.','Your store has been created and saved to your account.'], signedIn:['تم تسجيل الدخول بنجاح! مرحباً بك في BEMO.','Signed in successfully! Welcome to BEMO.'], signedOut:['تم تسجيل الخروج.','You are signed out.'], ACTIVE:['نشط','Active'], CLOSED:['مغلق','Closed'], SUSPENDED:['موقوف','Suspended'], storeStatusUnknown:['غير متاح','Unavailable']
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
    $('profileForm')?.reset(); $('onboardingForm')?.reset(); $('storeForm')?.reset();
    if ($('profileEmail')) $('profileEmail').textContent = '';
    if ($('onboardingEmail')) $('onboardingEmail').textContent = '';
    if ($('savedStoreName')) $('savedStoreName').textContent = '';
    if ($('savedStoreSlug')) $('savedStoreSlug').textContent = '';
    if ($('savedStoreDescription')) $('savedStoreDescription').textContent = '';
    if ($('accountAvatar')) $('accountAvatar').textContent = '';
    if ($('storeInitial')) $('storeInitial').textContent = '';
    if ($('savedStoreStatus')) $('savedStoreStatus').textContent = '';
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
    if ($('pageLoading')) {
      $('pageLoading').hidden = !loading;
      const loadingH2 = $('pageLoading').querySelector('h2');
      if (loadingH2) loadingH2.textContent = phase === 'redirecting' ? text('redirecting') : text('checking');
    }
    if ($('signInPanel')) $('signInPanel').hidden = !['guest', 'blocked', 'error'].includes(phase);
    if ($('onboardingPanel')) $('onboardingPanel').hidden = phase !== 'onboarding';
    if ($('profilePanel')) $('profilePanel').hidden = phase !== 'ready';
    if ($('storePanel')) $('storePanel').hidden = phase !== 'ready';
    if ($('pageMessage')) {
      $('pageMessage').hidden = !successKey;
      $('pageMessage').textContent = successKey ? text(successKey) : '';
    }
    if ($('pageError')) {
      $('pageError').hidden = !next.error;
      if ($('pageErrorText')) $('pageErrorText').textContent = next.error ? errorText(next.error.code) : '';
      if ($('appealRecoveryBox')) {
        const showAppeal = phase === 'blocked' || next.error?.code === 'ACCOUNT_UNAVAILABLE';
        $('appealRecoveryBox').hidden = !showAppeal;
        if (showAppeal && $('appealRecoveryInfo')) {
          const untilText = next.error?.until ? (' (ينتهي تلقائياً في: ' + new Date(next.error.until).toLocaleString(lang) + ')') : '';
          $('appealRecoveryInfo').textContent = (next.error?.reason || 'جميع طلباتك وأرصدتك محفوظة ولن تُحذف.') + untilText;
        }
      }
    }
    if ($('retryButton')) $('retryButton').hidden = !next.error?.retryable;
    if ($('recoverySignOut')) $('recoverySignOut').hidden = !['blocked','error'].includes(phase) || next.error?.code === 'SIGNOUT_FAILED';
    if ($('googleButton')) $('googleButton').disabled = busy || ['disabled','misconfigured'].includes(next.provider) || phase !== 'guest';
    if ($('providerMessage')) $('providerMessage').textContent = next.provider === 'offline' ? text('providerOffline') : '';
    if ($('providerRetry')) {
      $('providerRetry').hidden = next.provider === 'ready';
      $('providerRetry').disabled = busy;
    }
    if ($('retryButton')) $('retryButton').disabled = busy;
    if ($('recoverySignOut')) $('recoverySignOut').disabled = busy;
    for (const form of [$('onboardingForm'), $('profileForm'), $('storeForm')].filter(Boolean)) {
      form.setAttribute('aria-busy', String(busy));
      form.querySelectorAll('input,select,textarea,button').forEach(input => { input.disabled = busy; });
    }
    if ($('onboardingSignOut')) $('onboardingSignOut').disabled = busy;
    if (phase === 'onboarding') {
      if ($('onboardingEmail')) $('onboardingEmail').textContent = next.identity?.email || '';
      if ($('onboardingName') && !$('onboardingName').value && $('onboardingLocale')) $('onboardingLocale').value = lang;
    }
    if (phase === 'ready' && next.profile) {
      const profile = next.profile;
      const handle = profile.username || next.identity?.username || (profile.email ? profile.email.split('@')[0] : 'bemo_user');
      if ($('profileEmail')) $('profileEmail').textContent = profile.email || '';
      if ($('profileTitle')) $('profileTitle').textContent = profile.display_name || handle;
      if ($('heroProfileHandle')) $('heroProfileHandle').textContent = '@' + handle;
      if ($('heroStoreBadge')) $('heroStoreBadge').hidden = !next.store;
      let savedAvatar = '';
      try { savedAvatar = localStorage.getItem('bemo-profile-avatar-v1') || ''; } catch (_) {}
      if ($('accountAvatar')) {
        if (savedAvatar && /^data:image\/(png|jpeg|webp);base64,/.test(savedAvatar)) {
          $('accountAvatar').innerHTML = '';
          const img = document.createElement('img');
          img.src = savedAvatar;
          img.alt = profile.display_name || 'Avatar';
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
          $('accountAvatar').appendChild(img);
        } else {
          $('accountAvatar').textContent = Array.from(profile.display_name || handle || 'B')[0];
        }
      }
      if ($('completenessBar') && $('completenessPct') && $('completenessChips')) {
        let savedProf = {};
        try { savedProf = JSON.parse(localStorage.getItem('bemo-profile-defaults') || '{}'); } catch (_) {}
        const checks = [
          ['@اليوزر', !!handle],
          ['الصورة الشخصية', !!savedAvatar],
          ['رقم الهاتف', !!(profile.phone || savedProf.phone)],
          ['العنوان', !!savedProf.address],
          ['متجرك', !!next.store]
        ];
        const pct = Math.round((checks.filter(c => c[1]).length / checks.length) * 100);
        $('completenessPct').textContent = pct + '%';
        $('completenessBar').style.width = pct + '%';
        $('completenessChips').replaceChildren();
        for (const [label, done] of checks) {
          const span = document.createElement('span');
          span.className = 'comp-chip' + (done ? ' done' : '');
          span.textContent = (done ? '✓ ' : '+ ') + label;
          $('completenessChips').appendChild(span);
        }
      }
      if (profileSeededFor !== profile.id) {
        if ($('profileName')) $('profileName').value = profile.display_name || '';
        if ($('profileUsername')) $('profileUsername').value = profile.username || next.identity?.username || '';
        if ($('profileLocale')) $('profileLocale').value = profile.locale === 'en' ? 'en' : 'ar';
        try {
          const savedProf = JSON.parse(localStorage.getItem('bemo-profile-defaults') || '{}');
          if ($('profilePhone')) $('profilePhone').value = profile.phone || savedProf.phone || '';
          if ($('profileCity')) $('profileCity').value = savedProf.city || '';
          if ($('profileCountry') && savedProf.country) $('profileCountry').value = savedProf.country;
          if ($('profileAddress')) $('profileAddress').value = savedProf.address || '';
          const prefs = JSON.parse(localStorage.getItem('bemo-notif-prefs-v1') || '{"orders":true,"security":true,"promos":false}');
          if ($('prefOrders')) $('prefOrders').checked = prefs.orders !== false;
          if ($('prefSecurity')) $('prefSecurity').checked = prefs.security !== false;
          if ($('prefPromos')) $('prefPromos').checked = !!prefs.promos;
        } catch (_) {}
        if ($('sessionsList') && typeof api.listSessions === 'function') {
          const sess = api.listSessions();
          $('sessionsList').textContent = sess.length ? sess.map(s => `🟢 ${s.device} (${s.email})`).join(' · ') : 'لا توجد جلسات أخرى';
        }
        profileSeededFor = profile.id;
      }
      if ($('newStoreArea')) $('newStoreArea').hidden = !!next.store;
      if ($('existingStoreArea')) $('existingStoreArea').hidden = !next.store;
      if (next.store) {
        if ($('savedStoreName')) $('savedStoreName').textContent = next.store.title || '';
        if ($('savedStoreSlug')) $('savedStoreSlug').textContent = '@' + (next.store.slug || '').replace(/^@/, '');
        if ($('savedStoreDescription')) {
          $('savedStoreDescription').textContent = next.store.description || '';
          $('savedStoreDescription').hidden = !next.store.description;
        }
        if ($('storeInitial')) $('storeInitial').textContent = Array.from(next.store.title || 'B')[0];
        if ($('savedStoreStatus')) $('savedStoreStatus').textContent = text(['ACTIVE','CLOSED','SUSPENDED'].includes(next.store.status) ? next.store.status : 'storeStatusUnknown');
        if ($('visitPublicStoreBtn')) $('visitPublicStoreBtn').href = 'store.html?store=' + encodeURIComponent(next.store.slug || '');
      }
      if (!busy && location.hash === '#store' && !storeTargetShown && $('storePanel')) {
        storeTargetShown = true;
        $('storePanel').scrollIntoView({block:'start',behavior:'auto'});
        if ($('storeTitle')) $('storeTitle').focus({preventScroll:true});
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
      const confirmed = !success || (success === 'signedOut' ? result?.phase === 'guest' : success === 'signedIn' ? (result?.phase === 'ready' && !!currentOwner) : result?.phase === 'ready' && currentOwner === startingOwner && (!verified || verified(result)));
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
  function switchLoginTab(mode) {
    const isGmail = mode !== 'user';
    if ($('gmailAuthBox')) $('gmailAuthBox').hidden = !isGmail;
    if ($('userAuthBox')) $('userAuthBox').hidden = isGmail;
    if ($('tabGmailBtn')) {
      $('tabGmailBtn').setAttribute('aria-selected', String(isGmail));
      $('tabGmailBtn').style.background = isGmail ? '#FF5000' : 'transparent';
      $('tabGmailBtn').style.color = isGmail ? '#fff' : 'var(--bemo-text)';
    }
    if ($('tabUserBtn')) {
      $('tabUserBtn').setAttribute('aria-selected', String(!isGmail));
      $('tabUserBtn').style.background = !isGmail ? '#FF5000' : 'transparent';
      $('tabUserBtn').style.color = !isGmail ? '#fff' : 'var(--bemo-text)';
    }
  }
  $('tabGmailBtn')?.addEventListener('click', () => switchLoginTab('gmail'));
  $('tabUserBtn')?.addEventListener('click', () => switchLoginTab('user'));
  $('gmailLoginForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const email = $('gmailEmail')?.value.trim();
    runAction(() => api.signInWithGmail({ email }), 'signedIn', $('signInTitle'));
  });
  $('usernameAuthForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const username = $('authUsername')?.value.trim();
    const password = $('authPassword')?.value;
    runAction(() => api.signInWithUsername({ username, password }), 'signedIn', $('signInTitle'));
  });
  $('avatarUploadInput')?.addEventListener('change', event => {
    const file = event.target?.files?.[0];
    if (!file || file.size > 2097152) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(reader.result)) {
        try { localStorage.setItem('bemo-profile-avatar-v1', reader.result); } catch (_) {}
        render(api.getState());
        if ($('pageMessage')) { $('pageMessage').textContent = lang === 'ar' ? 'تم تحديث صورة الملف الشخصي.' : 'Profile photo updated.'; $('pageMessage').hidden = false; }
      }
    };
    reader.readAsDataURL(file);
  });
  $('passwordForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const pw = $('newPasswordInput')?.value;
    if (!pw || pw.length < 6) return;
    const res = await api.changePassword?.(pw);
    if (res?.ok) {
      $('newPasswordInput').value = '';
      if ($('pageMessage')) { $('pageMessage').textContent = lang === 'ar' ? 'تم حفظ كلمة المرور بنجاح.' : 'Password saved.'; $('pageMessage').hidden = false; }
    }
  });
  $('notifPrefsForm')?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      localStorage.setItem('bemo-notif-prefs-v1', JSON.stringify({
        orders: !!$('prefOrders')?.checked,
        security: !!$('prefSecurity')?.checked,
        promos: !!$('prefPromos')?.checked
      }));
      if ($('pageMessage')) { $('pageMessage').textContent = lang === 'ar' ? 'تم حفظ تفضيلات الإشعارات.' : 'Notification preferences saved.'; $('pageMessage').hidden = false; }
    } catch (_) {}
  });
  $('signOutAllBtn')?.addEventListener('click', () => runAction(() => api.signOutAll ? api.signOutAll() : api.signOut(), 'signedOut'));
  $('exportDataBtn')?.addEventListener('click', async () => {
    const dump = await api.exportMyData?.();
    if (!dump) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'BEMO-personal-data.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('deleteAccountBtn')?.addEventListener('click', async () => {
    const ok = window.confirm(lang === 'ar' ? 'هل تريد إرسال طلب حذف الحساب نهائياً للإدارة؟ سيتم حفظ الطلب وتأكيد الخروج.' : 'Submit an account deletion request to admins and sign out?');
    if (!ok) return;
    await window.BemoSupport?.submitTicket?.({
      type: 'ACCOUNT_DELETE',
      subject: 'طلب حذف حساب مستخدم',
      message: 'طلب المستخدم حذف حسابه وبياناته الشخصية من المنصة وفق سياسة الخصوصية.'
    });
    runAction(() => api.signOut(), 'signedOut');
  });
  $('expandStoreWizardBtn')?.addEventListener('click', () => {
    const f = $('storeForm');
    if (f) {
      f.hidden = !f.hidden;
      if (!f.hidden) $('storeName')?.focus();
    }
  });
  bindClick('providerRetry', () => api.refresh());
  bindClick('retryButton', () => state?.error?.code === 'SIGNOUT_FAILED' ? api.signOut() : api.refresh());
  for (const id of ['signOutButton','onboardingSignOut','recoverySignOut']) bindClick(id, () => api.signOut(), 'signedOut');
  for (const formId of ['onboardingForm','profileForm']) {
    $(formId).addEventListener('submit', event => {
      event.preventDefault(); const form=event.currentTarget;
      const name = form.elements.display_name;
      const uVal = form.elements.username?.value?.trim().toLowerCase().replace(/^@/,'') || '';
      const resolvedName = name.value.trim() || uVal;
      if (formId === 'onboardingForm') name.setCustomValidity(name.value.trim() ? '' : errorText('PROFILE_INVALID'));
      else name.setCustomValidity(resolvedName ? '' : errorText('PROFILE_INVALID'));
      if (!form.reportValidity()) return;
      const input = {display_name:resolvedName,locale:form.elements.locale.value};
      if (form.elements.username) input.username = uVal;
      if (form.elements.phone) input.phone = form.elements.phone.value.trim();
      try {
        const phone = form.elements.phone?.value?.trim() || '';
        const city = form.elements.city?.value?.trim() || '';
        const country = form.elements.country?.value?.trim() || 'العراق (Iraq)';
        const address = form.elements.address?.value?.trim() || '';
        const recipient = resolvedName;
        const cur = JSON.parse(localStorage.getItem('bemo-profile-defaults') || '{}');
        localStorage.setItem('bemo-profile-defaults', JSON.stringify({...cur, recipient, phone, country, city, address}));
        // Sync default address
        try {
          const addrs = JSON.parse(localStorage.getItem('bemo-user-addresses') || '[]');
          if (address && phone) {
            const newAddr = {
              id: 'addr-profile-default',
              version: 1,
              label: 'العنوان الأساسي للطلب',
              delivery: { recipient, phone, country, region: city, city, address, note: '' }
            };
            const filtered = addrs.filter(a => a.id !== 'addr-profile-default');
            filtered.unshift(newAddr);
            localStorage.setItem('bemo-user-addresses', JSON.stringify(filtered));
          }
        } catch (_) {}
      } catch (_) {}
      runAction(() => api.saveProfile(input), 'profileSaved', formId === 'onboardingForm' ? $('profileTitle') : form.querySelector('[type=submit]'), result => result.profile?.display_name === input.display_name && result.profile?.locale === input.locale);
    });
  }
  $('storeForm')?.addEventListener('submit', event => {
    event.preventDefault(); const form=event.currentTarget;
    const title=form.elements.title;
    title.setCustomValidity(title.value.trim().length >= 2 ? '' : errorText('STORE_INVALID'));
    if (!form.reportValidity()) return;
    const input = {title:title.value.trim(),slug:form.elements.slug.value.trim().toLowerCase(),description:form.elements.description.value};
      input.registration={logo:form.elements.logoFile.files[0],cover:form.elements.coverFile.files[0],legal_name:form.elements.legalName.value.trim(),phone:form.elements.sellerPhone.value.trim(),
        address:form.elements.sellerAddress.value.trim(),document:form.elements.identityFile.files[0],accepted:form.elements.sellerAgreement.checked};
    if (!window.confirm(lang === 'ar' ? 'معرّف متجرك الدائم هو @'+input.slug+' ولا يمكن تغييره بعد التسجيل. تأكيد إنشاء المتجر؟' : 'Your permanent store username is @'+input.slug+'. It cannot change after registration. Create store?')) return;
      runAction(() => api.createStore(input), 'storeCreated', $('storeTitle'), result => result.store?.title === input.title && result.store?.slug === input.slug && result.store?.description === input.description);
  });
  document.querySelectorAll('.account-form input').forEach(input => input.addEventListener('input', () => input.setCustomValidity('')));
  api.initialize().catch(() => render({phase:'error',provider:'offline',error:{code:'NETWORK_ERROR',retryable:true}}));
})();
