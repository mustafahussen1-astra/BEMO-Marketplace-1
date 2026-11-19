(function () {
  'use strict';
  // Auth tokens stay inside the official SDK and operation-local closures.
  // Neither snapshots nor subscribers receive a session, token, or user metadata.
  const listeners = new Set();
  let state = { phase: 'idle', busy: false, provider: 'unknown', identity: null, profile: null, store: null, error: null };
  let client, config, epoch = 0, actorId = null, seenId = null;
  let initializeTask, callbackTask, actionTask, authTimer, callbackGuard = null, signingOut = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const snapshot = () => clone(state);
  function publish(patch) {
    state = Object.assign({}, state, patch);
    for (const listener of listeners) { try { listener(snapshot()); } catch (_) { /* A view cannot interrupt auth cleanup. */ } }
    return snapshot();
  }
  const cleared = { identity: null, profile: null, store: null };
  const stale = ticket => ticket !== epoch;
  const failure = (code, retryable = false) => ({ code, retryable });
  const superseded = () => Object.assign(snapshot(), { error: failure('SESSION_CHANGED') });
  const providerError = provider => failure(provider === 'disabled' ? 'PROVIDER_DISABLED' : provider === 'offline' ? 'NETWORK_ERROR' : 'PROVIDER_MISCONFIGURED', provider === 'offline');
  const blockedCodes = new Set(['AUTH_REQUIRED', 'AUTH_EXPIRED', 'SESSION_CHANGED', 'ACCOUNT_UNAVAILABLE', 'GOOGLE_REQUIRED', 'GMAIL_REQUIRED']);
  function safeError(error, fallback = 'REQUEST_FAILED') {
    const message = typeof error?.message === 'string' ? error.message : '';
    const business = {
      BEMO_AUTH_REQUIRED: 'AUTH_REQUIRED', BEMO_SESSION_INVALID: 'AUTH_EXPIRED',
      BEMO_PROFILE_UNAVAILABLE: 'ACCOUNT_UNAVAILABLE', BEMO_GOOGLE_REQUIRED: 'GOOGLE_REQUIRED',
      BEMO_VERIFIED_GMAIL_REQUIRED: 'GMAIL_REQUIRED', BEMO_PROFILE_INVALID: 'PROFILE_INVALID',
      BEMO_STORE_INVALID: 'STORE_INVALID', BEMO_SLUG_RESERVED: 'SLUG_RESERVED', BEMO_ONE_STORE_ONLY: 'STORE_EXISTS'
    };
    if (business[message]) return failure(business[message]);
    if (error?.code === '23505') {
      if (message.includes('stores_slug_key')) return failure('SLUG_TAKEN');
      if (message.includes('stores_title_normalized_key')) return failure('TITLE_TAKEN');
      if (message.includes('stores_owner_user_id_key')) return failure('STORE_EXISTS');
      if (message.includes('app_users_email_normalized_key')) return failure('EMAIL_CONFLICT');
      return failure('REQUEST_FAILED');
    }
    if (error?.status === 401 || ['bad_jwt', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error?.code)) return failure('AUTH_EXPIRED');
    if (error?.name === 'TypeError' || error?.name === 'AbortError' || error?.name === 'AuthRetryableFetchError' || error?.status === 0 || /fetch|network|timeout/i.test(message)) return failure('NETWORK_ERROR', true);
    return failure(fallback, true);
  }
  function stopWith(error, ticket) {
    if (stale(ticket)) return snapshot();
    actorId = null;
    return publish(Object.assign({}, cleared, { phase: blockedCodes.has(error.code) ? 'blocked' : 'error', busy: false, error }));
  }
  function start(phase = 'loading', clear = true) {
    const ticket = ++epoch;
    publish(Object.assign({}, clear ? cleared : {}, { phase, busy: true, error: null }));
    return ticket;
  }
  function ownText(value, maximum) { return typeof value === 'string' ? value.slice(0, maximum) : ''; }
  function profileData(value) {
    if (!value || typeof value.id !== 'string' || value.status !== 'ACTIVE' || !['ar', 'en'].includes(value.locale)) throw { code: 'RESPONSE_INVALID' };
    return { id: ownText(value.id, 64), email: ownText(value.email, 254), display_name: ownText(value.display_name, 80), locale: value.locale, status: 'ACTIVE', created_at: ownText(value.created_at, 40), updated_at: ownText(value.updated_at, 40) };
  }
  function storeData(value) {
    if (value === null) return null;
    if (!value || typeof value.id !== 'string' || !['ACTIVE', 'CLOSED', 'SUSPENDED'].includes(value.status)) throw { code: 'RESPONSE_INVALID' };
    return { id: ownText(value.id, 64), slug: ownText(value.slug, 48), title: ownText(value.title, 80), description: ownText(value.description, 2000), status: value.status, created_at: ownText(value.created_at, 40), updated_at: ownText(value.updated_at, 40) };
  }
  function bootstrap() {
    if (client) return true;
    try {
      const raw = window.BEMO_BACKEND;
      const endpoint = new URL(raw?.url);
      const origin = new URL(raw?.siteOrigin);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(raw?.publishableKey || '')) throw failure('CONFIG_INVALID');
      config = { url: endpoint.origin, publishableKey: raw.publishableKey, siteOrigin: origin.origin };
      if (typeof window.supabase?.createClient !== 'function') throw failure('SDK_UNAVAILABLE');
      try {
        const probe = 'bemo-auth-probe-' + Math.random().toString(36).slice(2);
        window.localStorage.setItem(probe, '1'); window.localStorage.removeItem(probe);
      } catch (_) { throw failure('STORAGE_UNAVAILABLE'); }
      client = window.supabase.createClient(config.url, config.publishableKey, { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'bemo-auth-v1' } });
      client.auth.onAuthStateChange((event, session) => {
        // Never await another Supabase auth method under its auth-event lock.
        if (event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_OUT') {
          ++epoch; actorId = null; seenId = null;
          clearTimeout(authTimer);
          publish(Object.assign({}, cleared, { phase: 'guest', busy: false, error: null }));
          return;
        }
        const nextId = typeof session?.user?.id === 'string' ? session.user.id : null;
        if (callbackGuard) {
          if (stale(callbackGuard.ticket)) return;
          // The SDK emits SIGNED_IN before its exchange promise resolves. Keep
          // this expected event from invalidating the callback, but remember
          // every identity so a competing sign-in cannot be accepted as ours.
          if (event === 'SIGNED_IN' && nextId && session?.access_token) {
            callbackGuard.sessions.add(nextId + ':' + session.access_token);
            seenId = nextId;
          } else if (nextId !== seenId) {
            ++epoch;
          }
          actorId = null;
          publish(Object.assign({}, cleared, { phase: 'loading', busy: true, error: null }));
          return;
        }
        const changed = nextId !== seenId;
        seenId = nextId;
        if (changed) {
          ++epoch; actorId = null;
          publish(Object.assign({}, cleared, { phase: 'loading', busy: true, error: null }));
        }
        if (signingOut || !nextId || (!changed && state.busy)) return;
        if (changed || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          clearTimeout(authTimer);
          authTimer = setTimeout(() => { refresh(); }, 0);
        }
      });
      return true;
    } catch (error) {
      actorId = null;
      const code = ['CONFIG_INVALID', 'SDK_UNAVAILABLE', 'STORAGE_UNAVAILABLE'].includes(error?.code) ? error.code : 'CONFIG_INVALID';
      publish(Object.assign({}, cleared, { phase: 'error', busy: false, error: failure(code) }));
      return false;
    }
  }
  async function providerReady(ticket) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      try { response = await fetch(config.url + '/auth/v1/settings', { headers: { apikey: config.publishableKey }, signal: controller.signal, cache: 'no-store' }); }
      finally { clearTimeout(timer); }
      if (!response.ok) throw new TypeError('Settings network failure');
      const settings = await response.json();
      const external = settings?.external;
      let provider = 'misconfigured';
      if (external && external.google === false) provider = 'disabled';
      else if (external && external.google === true && Object.entries(external).every(([name, enabled]) => name === 'google' || enabled === false) && settings.saml_enabled === false && settings.passkeys_enabled === false && settings.disable_signup !== true) provider = 'ready';
      if (!stale(ticket)) publish({ provider });
      return provider;
    } catch (_) {
      if (!stale(ticket)) publish({ provider: 'offline' });
      return 'offline';
    }
  }
  async function context(ticket, expectedActor) {
    const sessionResult = await client.auth.getSession();
    if (stale(ticket)) return null;
    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data?.session;
    if (!session?.access_token) return null;
    const token = session.access_token;
    const result = await client.auth.getUser(token);
    if (stale(ticket)) return null;
    if (result.error) throw result.error;
    const user = result.data?.user;
    if (!user?.id || (session.user?.id && session.user.id !== user.id) || (expectedActor && user.id !== expectedActor)) throw { code: 'SESSION_CHANGED' };
    // Use one verified token for the entire operation. A different tab signing
    // in cannot silently retarget a pending write to the new account.
    const api = window.supabase.createClient(config.url, config.publishableKey, { accessToken: async () => token });
    return { id: user.id, email: ownText(user.email, 254), api };
  }
  function errorFor(error, fallback) {
    if (['SESSION_CHANGED', 'RESPONSE_INVALID'].includes(error?.code)) return failure(error.code, error.code === 'RESPONSE_INVALID');
    return safeError(error, fallback);
  }
  async function hydrate(ticket, expectedActor) {
    try {
      const who = await context(ticket, expectedActor);
      if (stale(ticket)) return snapshot();
      if (!who) { actorId = null; seenId = null; return publish(Object.assign({}, cleared, { phase: 'guest', busy: false, error: null })); }
      if (state.provider !== 'ready') return stopWith(providerError(state.provider), ticket);
      const profile = await who.api.rpc('bemo_get_profile');
      if (stale(ticket)) return snapshot();
      if (profile.error?.message === 'BEMO_PROFILE_REQUIRED') {
        actorId = who.id; seenId = who.id;
        return publish(Object.assign({}, cleared, { phase: 'onboarding', busy: false, identity: { email: who.email }, error: null }));
      }
      if (profile.error) throw profile.error;
      const safeProfile = profileData(profile.data);
      const store = await who.api.rpc('bemo_get_my_store');
      if (stale(ticket)) return snapshot();
      if (store.error) throw store.error;
      actorId = who.id; seenId = who.id;
      return publish({ phase: 'ready', busy: false, identity: { email: who.email }, profile: safeProfile, store: storeData(store.data), error: null });
    } catch (error) { return stopWith(errorFor(error), ticket); }
  }
  async function refresh() {
    if (!bootstrap()) return snapshot();
    const ticket = start();
    await providerReady(ticket);
    if (stale(ticket)) return snapshot();
    return hydrate(ticket);
  }
  function initialize() {
    if (!initializeTask) initializeTask = refresh();
    return initializeTask;
  }
  function singleAction(work) {
    if (actionTask) return actionTask;
    const pending = Promise.resolve().then(work).catch(() => snapshot());
    actionTask = pending;
    pending.finally(() => { if (actionTask === pending) actionTask = null; });
    return pending;
  }
  function signIn() {
    return singleAction(async () => {
      if (!bootstrap()) return snapshot();
      if (signingOut) return superseded();
      const ticket = start();
      if (window.location.origin !== config.siteOrigin) return stopWith(failure('ORIGIN_NOT_ALLOWED'), ticket);
      const provider = await providerReady(ticket);
      if (stale(ticket)) return snapshot();
      if (provider !== 'ready') return stopWith(providerError(provider), ticket);
      try {
        const result = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: config.siteOrigin + '/auth-callback.html', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
        if (stale(ticket)) return snapshot();
        if (result.error) throw result.error;
        const destination = new URL(result.data?.url);
        if (destination.origin !== config.url || destination.username || destination.password || destination.hash || destination.pathname !== '/auth/v1/authorize' || destination.searchParams.get('provider') !== 'google' || destination.searchParams.get('redirect_to') !== config.siteOrigin + '/auth-callback.html') throw { code: 'RESPONSE_INVALID' };
        publish(Object.assign({}, cleared, { phase: 'redirecting', busy: true, error: null }));
        window.location.assign(destination.href);
        return snapshot();
      } catch (error) { return stopWith(errorFor(error), ticket); }
    });
  }
  function completeCallback() {
    if (callbackTask) return callbackTask;
    callbackTask = (async () => {
      // Scrub before any network call or SDK initialization, including failures.
      let code, flowId, denial, invalid = false;
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        code = params.get('code'); flowId = params.get('sb_flow_id');
        denial = params.get('error') || params.get('error_code');
        invalid = params.getAll('code').length > 1 || params.getAll('sb_flow_id').length > 1 || (code && code.length > 2048) || (flowId && flowId.length > 200);
        params.delete('code'); params.delete('sb_flow_id'); params.delete('error'); params.delete('error_code'); params.delete('error_description');
        // The callback carries no supported hash state, including implicit tokens.
        if (url.hash) invalid = true;
        url.hash = '';
        for (const key of [...params.keys()]) if (key !== 'lang') params.delete(key);
        if (params.has('lang') && !['ar', 'en'].includes(params.get('lang'))) params.delete('lang');
        window.history.replaceState(null, '', url.pathname + url.search);
      } catch (_) { invalid = true; }
      if (!bootstrap()) return snapshot();
      const ticket = start();
      if (window.location.origin !== config.siteOrigin) return stopWith(failure('ORIGIN_NOT_ALLOWED'), ticket);
      if (denial) return stopWith(failure('CALLBACK_DENIED'), ticket);
      if (invalid) return stopWith(failure('CALLBACK_INVALID'), ticket);
      if (!code) return stopWith(failure('CALLBACK_MISSING'), ticket);
      const guard = { ticket, sessions: new Set() };
      callbackGuard = guard;
      try {
        const result = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
        code = null; flowId = null;
        if (stale(ticket)) return superseded();
        if (result.error) return stopWith(safeError(result.error, 'CALLBACK_INVALID'), ticket);
        const session = result.data?.session;
        const signature = session?.user?.id + ':' + session?.access_token;
        if (!session?.user?.id || !session?.access_token || [...guard.sessions].some(item => item !== signature)) return stopWith(failure('SESSION_CHANGED'), ticket);
        callbackGuard = null;
        await providerReady(ticket);
        if (stale(ticket)) return superseded();
        return await hydrate(ticket, session.user.id);
      } catch (error) { return stale(ticket) ? superseded() : stopWith(safeError(error, 'CALLBACK_INVALID'), ticket); }
      finally { if (callbackGuard === guard) callbackGuard = null; }
    })();
    return callbackTask;
  }
  function saveProfile(input) {
    return singleAction(async () => {
      if (!bootstrap()) return snapshot();
      const initialPhase = state.phase, expected = actorId;
      if (!expected || !['onboarding', 'ready'].includes(initialPhase)) return publish({ error: failure('AUTH_REQUIRED') });
      const name = typeof input?.display_name === 'string' ? input.display_name.trim() : '';
      if (!name || name.length > 80 || !['ar', 'en'].includes(input?.locale)) return publish({ error: failure('PROFILE_INVALID') });
      const ticket = start(initialPhase, false);
      try {
        const who = await context(ticket, expected);
        if (stale(ticket)) return superseded();
        if (!who) return stopWith(failure('AUTH_REQUIRED'), ticket);
        const result = await who.api.rpc(initialPhase === 'onboarding' ? 'bemo_onboard' : 'bemo_update_profile', { display_name: name, locale: input.locale });
        if (stale(ticket)) return superseded();
        if (result.error) throw result.error;
        profileData(result.data);
        const resultState = await hydrate(ticket, expected);
        return stale(ticket) ? superseded() : resultState;
      } catch (error) {
        const safe = errorFor(error);
        if (stale(ticket)) return superseded();
        if (blockedCodes.has(safe.code) || safe.code === 'NETWORK_ERROR' || safe.code === 'RESPONSE_INVALID') return stopWith(safe, ticket);
        return publish({ phase: initialPhase, busy: false, error: safe });
      }
    });
  }
  function createStore(input) {
    return singleAction(async () => {
      if (!bootstrap()) return snapshot();
      const expected = actorId;
      if (!expected || state.phase !== 'ready') return publish({ error: failure('AUTH_REQUIRED') });
      const title = typeof input?.title === 'string' ? input.title.trim() : '';
      const slug = typeof input?.slug === 'string' ? input.slug.trim().toLowerCase() : '';
      const description = typeof input?.description === 'string' ? input.description : '';
      if (title.length < 2 || title.length > 80 || slug.length < 3 || slug.length > 48 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || description.length > 2000) return publish({ error: failure('STORE_INVALID') });
      const ticket = start('ready', false);
      try {
        const who = await context(ticket, expected);
        if (stale(ticket)) return superseded();
        if (!who) return stopWith(failure('AUTH_REQUIRED'), ticket);
        let result;
        if (input.registration) {
          const availability=await who.api.rpc('bemo_slug_available',{candidate:slug});
          if(availability.error)throw availability.error;
          if(availability.data!==true)throw {message:'BEMO_SLUG_TAKEN'};
          const {legal_name,phone,address,document:file,accepted} = input.registration;
          const ext = {'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}[file?.type];
          if (!ext || !accepted || !file.size || file.size>5242880) throw {message:'BEMO_STORE_INVALID'};
          const path=who.id+'/'+crypto.randomUUID()+'.'+ext;
          const uploaded=await who.api.storage.from('bemo-seller-identity').upload(path,file,{upsert:false,contentType:file.type});
          if(uploaded.error)throw uploaded.error;
          if(stale(ticket))return superseded();
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(who.id));
          const prefix=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
          async function storeImage(image) {
            if(!image)return null;
            const suffix={'image/jpeg':'jpg','image/png':'png'}[image.type];
            if(!suffix||!image.size||image.size>5242880)throw {message:'BEMO_STORE_INVALID'};
            const key=prefix+'/'+crypto.randomUUID()+'.'+suffix;
            const response=await who.api.storage.from('bemo-store-images').upload(key,image,{contentType:image.type,upsert:false});
            if(response.error)throw response.error;
            return key;
          }
          const [logo_path,cover_path]=await Promise.all([storeImage(input.registration.logo),storeImage(input.registration.cover)]);
          if(stale(ticket))return superseded();
          result=await who.api.rpc('bemo_register_seller',{title,slug,description,registration:{
            legal_name,phone,address,identity_path:path,logo_path,cover_path,terms_version:'seller-2026-11'
          }});
        } else result=await who.api.rpc('bemo_create_store',{title,slug,description});
        if (stale(ticket)) return superseded();
        if (result.error) throw result.error;
        return publish({ phase: 'ready', busy: false, store: storeData(result.data), error: null });
      } catch (error) {
        const safe = errorFor(error);
        if (stale(ticket)) return superseded();
        if (blockedCodes.has(safe.code) || safe.code === 'NETWORK_ERROR' || safe.code === 'RESPONSE_INVALID') return stopWith(safe, ticket);
        return publish({ phase: 'ready', busy: false, error: safe });
      }
    });
  }
  async function signOut() {
    if (!bootstrap()) return snapshot();
    try { localStorage.removeItem('bemo-live-cart-v1'); } catch (_) { /* No private drafts survive logout. */ }
    const ticket = start(); actorId = null; seenId = null; signingOut = true;
    clearTimeout(authTimer);
    try {
      // A code exchange may still write an SDK session. Finish that exchange
      // before revocation so a completed logout cannot be undone by it.
      if (callbackGuard && callbackTask) await callbackTask;
      if (stale(ticket)) return superseded();
      const result = await client.auth.signOut({ scope: 'local' });
      if (stale(ticket) && state.phase !== 'guest') return superseded();
      if (result.error) {
        // The SDK may retain a session when a server revocation fails.
        return publish(Object.assign({}, cleared, { phase: 'error', busy: false, error: failure('SIGNOUT_FAILED', true) }));
      }
      if (!stale(ticket) || state.phase === 'guest') return publish(Object.assign({}, cleared, { phase: 'guest', busy: false, error: null }));
      return snapshot();
    } catch (_) { return stale(ticket) && state.phase !== 'guest' ? superseded() : publish(Object.assign({}, cleared, { phase: 'error', busy: false, error: failure('SIGNOUT_FAILED', true) })); }
    finally {
      signingOut = false;
      if (state.phase === 'loading' && seenId && !callbackGuard) {
        clearTimeout(authTimer);
        authTimer = setTimeout(() => { refresh(); }, 0);
      }
    }
  }
  const merchantMethods = new Set(['bemo_topups','bemo_merchant_catalog','bemo_save_store_settings','bemo_save_product','bemo_save_variant','bemo_adjust_stock','bemo_prepare_media','bemo_finish_media','bemo_product_status','bemo_merchant_media']);
  for(const method of ['bemo_publish_store_profile','bemo_save_listing','bemo_save_priced_variant','bemo_console','bemo_console_action','bemo_delivery_workspace','bemo_save_delivery_regions','bemo_store_workspace','bemo_save_store_profile','bemo_seller_dashboard','bemo_list_addresses','bemo_save_address','bemo_delete_address']) merchantMethods.add(method);
  for (const method of ['bemo_set_discovery_entry','bemo_support_decision_with_hold','bemo_finance_admin_action','bemo_finance_admin_workspace','bemo_workspace_access','bemo_balance_workspace','bemo_save_commission_rule','bemo_resolve_commission_hold','bemo_quote_cart','bemo_place_order','bemo_list_orders','bemo_get_order','bemo_order_action','bemo_support_queue','bemo_support_case','bemo_support_decision','bemo_notifications']) merchantMethods.add(method);
  const merchantErrors = new Set(['STORE_UNAVAILABLE','SETTINGS_INVALID','SETTINGS_REQUIRED','VERSION_CONFLICT','CURRENCY_LOCKED','PRODUCT_INVALID','PRODUCT_UNAVAILABLE','VARIANT_INVALID','VARIANT_UNAVAILABLE','VARIANT_LIMIT','STOCK_INVALID','INSUFFICIENT_STOCK','IDEMPOTENCY_CONFLICT','MEDIA_INVALID','MEDIA_LIMIT','MEDIA_UNAVAILABLE','MEDIA_UPLOAD_REQUIRED','PRODUCT_IMAGE_REQUIRED','VARIANT_REQUIRED','QUERY_INVALID']);
  for(const code of ['DESTINATION_CHANGED','DESTINATION_REQUIRED','DELIVERY_UNAVAILABLE','DELIVERY_DUPLICATE','DELIVERY_INVALID','STORE_PROFILE_INVALID','TITLE_TAKEN','ADDRESS_INVALID','ADDRESS_LIMIT','ADDRESS_UNAVAILABLE']) merchantErrors.add(code);
  for (const code of ['CART_INVALID','ITEM_UNAVAILABLE','STOCK_INSUFFICIENT','MIXED_CURRENCY','TOTAL_TOO_LARGE','RATE_LIMIT','CHECKOUT_INVALID','REQUEST_CONFLICT','QUOTE_EXPIRED','QUOTE_CHANGED','ORDER_UNAVAILABLE','ACTION_INVALID','TRANSITION_INVALID','REASON_REQUIRED','SUPPORT_REQUIRED','CASE_UNAVAILABLE','CASE_NOT_ASSIGNED','CASE_CONFLICT_OF_INTEREST','CASE_RESOLVED','RESTOCK_INVALID']) merchantErrors.add(code);
  async function merchantRequest(name, args) {
    if (!merchantMethods.has(name) || state.phase !== 'ready' || !actorId) return {data:null,error:failure('AUTH_REQUIRED')};
    const ticket=epoch, expected=actorId;
    try {
      const who=await context(ticket,expected);
      if (stale(ticket) || !who || actorId!==expected) return {data:null,error:failure('SESSION_CHANGED')};
      const result=await who.api.rpc(name,args || {});
      if (stale(ticket) || actorId!==expected) return {data:null,error:failure('SESSION_CHANGED')};
      if(result.error) throw result.error;
      return {data:result.data,error:null};
    } catch(error) {
      const code=typeof error?.message==='string' ? error.message.replace(/^BEMO_/,'') : '';
      return {data:null,error:merchantErrors.has(code)?failure(code):error?.code==='23505'?failure('SKU_TAKEN'):errorFor(error)};
    }
  }
  async function merchantMedia(action,path,file) {
    if (state.phase!=='ready' || !actorId || !['upload','preview'].includes(action) || typeof path!=='string' || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/i.test(path)) return {data:null,error:failure('MEDIA_INVALID')};
    const ticket=epoch,expected=actorId;
    try {
      const who=await context(ticket,expected);
      if(stale(ticket)||!who||actorId!==expected) return {data:null,error:failure('SESSION_CHANGED')};
      let result;
      if(action==='upload') {
        if(!file || file.type!=='image/jpeg' || file.size<1 || file.size>5242880) return {data:null,error:failure('MEDIA_INVALID')};
        result=await who.api.storage.from('bemo-products').upload(path,file,{contentType:'image/jpeg',upsert:false,cacheControl:'60'});
      } else result=await who.api.storage.from('bemo-products').createSignedUrl(path,60);
      if(stale(ticket)||actorId!==expected) return {data:null,error:failure('SESSION_CHANGED')};
      if(result.error) throw result.error;
      if(action==='preview') {
        const url=new URL(result.data?.signedUrl);
        if(url.origin!==config.url || !url.pathname.startsWith('/storage/v1/object/sign/bemo-products/')) throw {code:'RESPONSE_INVALID'};
        return {data:{url:url.href},error:null};
      }
      return {data:{uploaded:true},error:null};
    } catch(error) { return {data:null,error:errorFor(error)}; }
  }
  function merchantScope() {
    const ticket=epoch,expected=actorId;
    const valid=()=>expected && !stale(ticket) && actorId===expected && state.phase==='ready';
    const changed=()=>Promise.resolve({data:null,error:failure('SESSION_CHANGED')});
    return Object.freeze({request:(name,args)=>valid()?merchantRequest(name,args):changed(),media:(action,path,file)=>valid()?merchantMedia(action,path,file):changed()});
  }
  window.BemoAccount = Object.freeze({
    async uploadStoreImage(file) {
      const ticket=epoch,who=await context(ticket,actorId);
      if(!who||stale(ticket))throw {code:'SESSION_CHANGED'};
      const ext={'image/jpeg':'jpg','image/png':'png'}[file.type];
      if(!ext||!file.size||file.size>5242880)throw {code:'MEDIA_INVALID'};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(who.id));
      const prefix=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      const path=prefix+'/'+crypto.randomUUID()+'.'+ext;
      const result=await who.api.storage.from('bemo-store-images').upload(path,file,{upsert:false,contentType:file.type});
      if(result.error||stale(ticket))throw {code:'MEDIA_INVALID'};
      return path;
    },
    async transferProof(fileOrPath) {
      const ticket=epoch,expected=actorId;
      if(!expected || state.phase!=='ready')throw new Error('AUTH_REQUIRED');
      const who=await context(ticket,expected);
      if(!who||stale(ticket))throw new Error('SESSION_CHANGED');
      const bucket=who.api.storage.from('bemo-transfer-proofs');
      if(typeof fileOrPath==='string') {
        const result=await bucket.createSignedUrl(fileOrPath,60);
        if(result.error||stale(ticket))throw new Error('MEDIA_INVALID');
        const url=new URL(result.data.signedUrl);
        if(url.origin!==config.url)throw new Error('MEDIA_INVALID');
        return url.href;
      }
      const ext={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}[fileOrPath?.type];
      if(!ext||!fileOrPath.size||fileOrPath.size>5242880)throw new Error('MEDIA_INVALID');
      const path=who.id+'/'+crypto.randomUUID()+'.'+ext;
      const result=await bucket.upload(path,fileOrPath,{upsert:false,contentType:fileOrPath.type});
      if(result.error||stale(ticket))throw new Error('MEDIA_INVALID');
      return path;
    },
    initialize, getState: snapshot, subscribe(listener) { if (typeof listener !== 'function') return () => {}; listeners.add(listener); try { listener(snapshot()); } catch (_) { /* Isolate view failures. */ } return () => listeners.delete(listener); },
    signIn, completeCallback, refresh, saveProfile, createStore, signOut, merchantRequest, merchantMedia, merchantScope,
    orderRequest: merchantRequest, orderScope: merchantScope
  });
})();
