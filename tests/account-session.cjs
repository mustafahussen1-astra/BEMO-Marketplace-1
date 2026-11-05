const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../dist/account-session.js'), 'utf8');
const origin = 'https://bemo.example';
const endpoint = 'https://project.supabase.co';
const clean = value => JSON.parse(JSON.stringify(value));
const readySettings = () => ({ external: { google: true, email: false, anonymous_users: false, phone: false }, saml_enabled: false, passkeys_enabled: false, disable_signup: false });
const session = id => ({ access_token: 'private-token-' + id, refresh_token: 'private-refresh-' + id, user: { id } });
const profile = id => ({ id: 'business-' + id, email: id + '@gmail.com', display_name: 'Name ' + id, locale: 'ar', status: 'ACTIVE', created_at: '2026-11-04', updated_at: '2026-11-04' });
const store = id => ({ id: 'store-' + id, slug: 'shop-' + id.toLowerCase(), title: 'Shop ' + id, description: '', status: 'ACTIVE', created_at: '', updated_at: '' });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function drain() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
function boot(options = {}) {
  const traces = [], rpcCalls = [], authCalls = [], instances = [], events = [], timers = new Map(), persisted = new Map();
  let current = options.session || null, settings = options.settings || readySettings(), eventHandler, timerId = 0;
  let href = options.href || origin + '/account.html';
  const records = new Map([['A', { profile: profile('A'), store: null }], ['B', { profile: profile('B'), store: store('B') }]]);
  const hooks = {};
  const runtime = {
    traces, rpcCalls, authCalls, instances, events, persisted, records, hooks,
    get href() { return href; },
    get current() { return current; },
    setSession(value) { current = value; },
    setSettings(value) { settings = value; },
    emit(name, value = current) { eventHandler(name, value); },
    async flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await drain(); },
  };
  const auth = {
    onAuthStateChange(fn) { eventHandler = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    async getSession() { authCalls.push('getSession'); if (hooks.getSession) return hooks.getSession(); return { data: { session: current }, error: null }; },
    async getUser(token) { authCalls.push(['getUser', token]); if (hooks.getUser) return hooks.getUser(token); const id = token.replace('private-token-', ''); return { data: { user: { id, email: id + '@gmail.com', user_metadata: { role: 'superadmin' } } }, error: null }; },
    async signInWithOAuth(args) { authCalls.push(['signInWithOAuth', clean(args)]); if (hooks.signIn) return hooks.signIn(args); return { data: { url: endpoint + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(origin + '/auth-callback.html') }, error: null }; },
    async exchangeCodeForSession(code, flow) { authCalls.push(['exchange', code, flow && clean(flow)]); traces.push('exchange'); if (hooks.exchange) return hooks.exchange(code, flow); current = session('A'); eventHandler('SIGNED_IN', current); return { data: { session: current }, error: null }; },
    async signOut(args) { authCalls.push(['signOut', clean(args)]); if (hooks.signOut) return hooks.signOut(args); current = null; eventHandler('SIGNED_OUT', null); return { error: null }; }
  };
  const window = {
    BEMO_BACKEND: { url: endpoint, publishableKey: 'sb_publishable_public', siteOrigin: origin },
    supabase: { createClient(url, key, config) {
      traces.push('sdk'); instances.push({ url, key, config });
      if (!config.accessToken) { if (options.sdkError) throw options.sdkError; return { auth }; }
      return { async rpc(name, args) {
        const token = await config.accessToken(); const id = token.replace('private-token-', '');
        rpcCalls.push({ name, args: args && clean(args), token });
        if (hooks.rpc) { const result = await hooks.rpc(name, args, token); if (result !== undefined) return result; }
        const record = records.get(id);
        if (name === 'bemo_get_profile') return record?.profile ? { data: record.profile, error: null } : { data: null, error: { message: 'BEMO_PROFILE_REQUIRED', code: '42501' } };
        if (name === 'bemo_get_my_store') return { data: record.store, error: null };
        if (name === 'bemo_onboard') { records.set(id, { profile: Object.assign(profile(id), args), store: null }); return { data: records.get(id).profile, error: null }; }
        if (name === 'bemo_update_profile') { Object.assign(record.profile, args); return { data: record.profile, error: null }; }
        if (name === 'bemo_create_store') { record.store = Object.assign(store(id), args); return { data: record.store, error: null }; }
        throw new Error('Unexpected RPC: ' + name);
      } };
    } },
    localStorage: { setItem(k, v) { if (options.storageError) throw Error('denied'); persisted.set(k, v); }, removeItem(k) { persisted.delete(k); } },
    location: { get href() { return href; }, get origin() { return new URL(href).origin; }, assign(url) { runtime.navigation = url; } },
    history: { replaceState(_state, _unused, url) { traces.push('scrub'); href = new URL(url, href).href; } }
  };
  const context = {
    window, URL, AbortController, console,
    setTimeout(fn, ms) { const id = ++timerId; if (ms === 0) timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    async fetch(url, config) { traces.push('settings'); runtime.settingsRequest = { url, config }; if (hooks.fetch) return hooks.fetch(); return { ok: true, json: async () => settings }; }
  };
  vm.runInNewContext(source, context, { filename: 'account-session.js' });
  runtime.api = window.BemoAccount;
  runtime.api.subscribe(state => events.push(state));
  return runtime;
}
const tests = [];
const test = (name, run) => tests.push({ name, run });
function privateClear(state) { assert.equal(state.identity, null); assert.equal(state.profile, null); assert.equal(state.store, null); }
test('Guest initialization uses PKCE, explicit callback handling and separate auth storage', async () => {
  const b = boot(); const first = b.api.initialize(); assert.equal(first, b.api.initialize());
  assert.equal((await first).phase, 'guest'); assert.equal(b.rpcCalls.length, 0);
  assert.deepEqual(clean(b.instances[0].config.auth), { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'bemo-auth-v1' });
  assert.equal(b.persisted.size, 0);
});
test('Provider settings fail closed for alternate login, SAML and passkeys', async () => {
  for (const change of [s => s.external.email = true, s => s.external.github = true, s => s.saml_enabled = true, s => s.passkeys_enabled = true, s => s.disable_signup = true]) {
    const settings = readySettings(); change(settings); const b = boot({ settings, session: session('A') });
    const result = await b.api.initialize(); assert.equal(result.provider, 'misconfigured'); privateClear(result); assert.equal(b.rpcCalls.length, 0);
    await b.api.signIn(); assert(!b.navigation);
  }
});
test('Disabled provider and offline settings never invoke OAuth or protected RPCs', async () => {
  const settings = readySettings(); settings.external.google = false; const b = boot({ settings });
  assert.equal((await b.api.signIn()).error.code, 'PROVIDER_DISABLED'); assert.equal(b.authCalls.length, 0);
  b.hooks.fetch = () => { throw new TypeError('token-private network'); };
  assert.equal((await b.api.signIn()).error.code, 'NETWORK_ERROR'); assert(!JSON.stringify(b.events).includes('token-private'));
});
test('Verified token selects the RPC identity; metadata and surplus fields never escape', async () => {
  const b = boot({ session: session('A') }); b.records.get('A').profile.access_token = 'danger';
  const result = await b.api.initialize(); assert.equal(result.phase, 'ready'); assert.equal(result.profile.id, 'business-A');
  assert(b.authCalls.some(call => call[0] === 'getUser' && call[1] === 'private-token-A'));
  assert(b.rpcCalls.every(call => call.token === 'private-token-A'));
  assert(!JSON.stringify(result).match(/danger|private-token|superadmin|refresh_token/));
  result.profile.display_name = 'changed'; assert.equal(b.api.getState().profile.display_name, 'Name A');
});
test('Unverified session data is rejected before business RPCs', async () => {
  const b = boot({ session: session('A') }); b.hooks.getUser = async () => ({ data: { user: null }, error: { status: 401, message: 'private-token-A' } });
  const result = await b.api.initialize(); assert.equal(result.phase, 'blocked'); assert.equal(result.error.code, 'AUTH_EXPIRED'); privateClear(result); assert.equal(b.rpcCalls.length, 0);
});
test('Only PROFILE_REQUIRED leads to onboarding; suspended or wrong identity stays blocked', async () => {
  const b = boot({ session: session('A') }); b.records.delete('A');
  assert.equal((await b.api.initialize()).phase, 'onboarding'); assert.equal(b.api.getState().identity.email, 'A@gmail.com');
  for (const message of ['BEMO_PROFILE_UNAVAILABLE', 'BEMO_VERIFIED_GMAIL_REQUIRED', 'BEMO_GOOGLE_REQUIRED']) {
    b.hooks.rpc = () => ({ error: { message, code: '42501' }, data: null });
    const result = await b.api.refresh(); assert.equal(result.phase, 'blocked'); privateClear(result);
  }
});
test('Onboarding saves explicit choices and reloads confirmed server state', async () => {
  const b = boot({ session: session('A') }); b.records.delete('A'); await b.api.initialize();
  const result = await b.api.saveProfile({ display_name: '  New Name  ', locale: 'en' });
  assert.equal(result.phase, 'ready'); assert.equal(result.profile.display_name, 'New Name'); assert.equal(result.profile.locale, 'en');
  const write = b.rpcCalls.find(call => call.name === 'bemo_onboard'); assert.deepEqual(write.args, { display_name: 'New Name', locale: 'en' });
});
test('Invalid input is rejected locally without a write', async () => {
  const b = boot({ session: session('A') }); await b.api.initialize(); const count = b.rpcCalls.length;
  assert.equal((await b.api.saveProfile({ display_name: '', locale: 'ar' })).error.code, 'PROFILE_INVALID');
  assert.equal((await b.api.createStore({ title: 'A', slug: 'bad/path' })).error.code, 'STORE_INVALID');
  assert.equal(b.rpcCalls.length, count);
});
test('Store creation returns only server-confirmed safe fields and duplicate clicks coalesce', async () => {
  const b = boot({ session: session('A') }); await b.api.initialize();
  const input = { title: ' My Store ', slug: 'MY-STORE', description: 'A shop' };
  const first = b.api.createStore(input); assert.equal(first, b.api.createStore(input));
  const result = await first; assert.equal(result.store.slug, 'my-store'); assert.equal(result.store.title, 'My Store');
  assert.equal(b.rpcCalls.filter(call => call.name === 'bemo_create_store').length, 1);
});
test('Unique conflict maps to safe actionable error and never invents a store', async () => {
  const b = boot({ session: session('A') }); await b.api.initialize();
  b.hooks.rpc = name => name === 'bemo_create_store' ? { error: { code: '23505', message: 'duplicate stores_slug_key private-secret', details: 'private-token-A' } } : undefined;
  const result = await b.api.createStore({ title: 'Shop', slug: 'new-shop' });
  assert.equal(result.error.code, 'SLUG_TAKEN'); assert.equal(result.store, null); assert(!JSON.stringify(result).includes('private-'));
});
test('Ambiguous network write result clears private data and does not claim success', async () => {
  const b = boot({ session: session('A') }); await b.api.initialize();
  b.hooks.rpc = name => { if (name === 'bemo_create_store') throw new TypeError('Network private-token-A'); };
  const result = await b.api.createStore({ title: 'Shop', slug: 'new-shop' });
  assert.equal(result.error.code, 'NETWORK_ERROR'); privateClear(result); assert.equal(result.phase, 'error');
});
test('Pending account read cannot repopulate private data after logout', async () => {
  const b = boot({ session: session('A') }), gate = deferred();
  b.hooks.rpc = name => name === 'bemo_get_profile' ? gate.promise : undefined;
  const pending = b.api.initialize(); await drain(); await b.api.signOut();
  gate.resolve({ data: profile('A'), error: null }); await pending;
  assert.equal(b.api.getState().phase, 'guest'); privateClear(b.api.getState());
});
test('Cross-account event clears privacy immediately and late write cannot overwrite the next user', async () => {
  const b = boot({ session: session('A') }), gate = deferred(); await b.api.initialize();
  b.hooks.rpc = name => name === 'bemo_create_store' ? gate.promise : undefined;
  const pending = b.api.createStore({ title: 'Shop A', slug: 'shop-a' }); await drain();
  b.setSession(session('B')); b.emit('SIGNED_IN'); privateClear(b.api.getState());
  b.hooks.rpc = null; await b.flush(); assert.equal(b.api.getState().profile.id, 'business-B');
  gate.resolve({ data: store('A'), error: null }); const result = await pending;
  assert.equal(result.error.code, 'SESSION_CHANGED'); assert.equal(b.api.getState().profile.id, 'business-B'); assert.equal(b.api.getState().store.id, 'store-B');
  assert.equal(b.rpcCalls.find(call => call.name === 'bemo_create_store').token, 'private-token-A');
});
test('Silent SDK identity replacement cannot retarget a profile write', async () => {
  const b = boot({ session: session('A') }); await b.api.initialize(); b.setSession(session('B'));
  const result = await b.api.saveProfile({ display_name: 'Edit A', locale: 'ar' });
  assert.equal(result.error.code, 'SESSION_CHANGED'); assert(!b.rpcCalls.some(call => call.name === 'bemo_update_profile')); privateClear(result);
});
test('OAuth launch is restricted to the configured origin and callback', async () => {
  const local = boot({ href: 'http://127.0.0.1/account.html' }); assert.equal((await local.api.signIn()).error.code, 'ORIGIN_NOT_ALLOWED'); assert(!local.navigation);
  const b = boot(); assert.equal((await b.api.signIn()).phase, 'redirecting');
  const args = b.authCalls.find(call => call[0] === 'signInWithOAuth')[1];
  assert.equal(args.provider, 'google'); assert.equal(args.options.redirectTo, origin + '/auth-callback.html'); assert.equal(args.options.skipBrowserRedirect, true);
  const bad = boot(); bad.hooks.signIn = () => ({ data: { url: endpoint + '/auth/v1/authorize?provider=google&redirect_to=https://evil.example' } });
  assert.equal((await bad.api.signIn()).error.code, 'RESPONSE_INVALID'); assert(!bad.navigation);
});
test('Callback scrubs secrets before SDK/network, exchanges once, and supports flow ID', async () => {
  const b = boot({ href: origin + '/auth-callback.html?code=sensitive-code&sb_flow_id=flow-1&next=https://evil.example&lang=en' });
  const first = b.api.completeCallback(); assert.equal(first, b.api.completeCallback()); const result = await first;
  assert.equal(result.phase, 'ready'); assert.equal(b.href, origin + '/auth-callback.html?lang=en'); assert.equal(b.traces[0], 'scrub');
  const calls = b.authCalls.filter(call => call[0] === 'exchange'); assert.equal(calls.length, 1); assert.deepEqual(calls[0], ['exchange', 'sensitive-code', { flowId: 'flow-1' }]);
  assert(!JSON.stringify(b.events).includes('sensitive-code'));
});
test('Malformed, denied and implicit-token callbacks scrub URL and do not exchange', async () => {
  for (const [suffix, code] of [['?code=a&code=b', 'CALLBACK_INVALID'], ['?code=a&sb_flow_id=x&sb_flow_id=y', 'CALLBACK_INVALID'], ['?error=denied&error_description=private-secret', 'CALLBACK_DENIED'], ['#access_token=private-token', 'CALLBACK_INVALID'], ['', 'CALLBACK_MISSING']]) {
    const b = boot({ href: origin + '/auth-callback.html' + suffix });
    const result = await b.api.completeCallback(); assert.equal(result.error.code, code); assert.equal(b.href, origin + '/auth-callback.html'); assert(!b.authCalls.some(call => call[0] === 'exchange')); privateClear(result);
  }
});
test('Logout during callback waits for exchange then revokes, without showing its profile', async () => {
  const b = boot({ href: origin + '/auth-callback.html?code=temporary' }), gate = deferred();
  b.hooks.exchange = async () => { await gate.promise; b.setSession(session('A')); b.emit('SIGNED_IN'); return { data: { session: session('A') }, error: null }; };
  const callback = b.api.completeCallback(); const logout = b.api.signOut(); await drain();
  assert(!b.authCalls.some(call => call[0] === 'signOut')); gate.resolve();
  assert.equal((await callback).error.code, 'SESSION_CHANGED'); assert.equal((await logout).phase, 'guest'); assert.equal(b.current, null); assert.equal(b.rpcCalls.length, 0); privateClear(b.api.getState());
});
test('Competing identity during callback is blocked instead of adopting either account', async () => {
  const b = boot({ href: origin + '/auth-callback.html?code=temporary' });
  b.hooks.exchange = async () => { b.setSession(session('B')); b.emit('SIGNED_IN'); b.setSession(session('A')); b.emit('SIGNED_IN'); return { data: { session: session('A') }, error: null }; };
  const result = await b.api.completeCallback(); assert.equal(result.error.code, 'SESSION_CHANGED'); privateClear(result); assert.equal(b.rpcCalls.length, 0);
});
test('Logout failure clears display and remains an explicit retryable failure', async () => {
  const b = boot({ session: session('A') }); await b.api.initialize(); b.hooks.signOut = () => ({ error: { message: 'private-secret' } });
  const result = await b.api.signOut(); assert.equal(result.error.code, 'SIGNOUT_FAILED'); assert.equal(result.error.retryable, true); privateClear(result);
});
test('Late logout failure cannot overwrite a freshly loaded different account', async () => {
  const b = boot({ session: session('A') }), gate = deferred(); await b.api.initialize(); b.hooks.signOut = () => gate.promise;
  const pending = b.api.signOut(); b.setSession(session('B')); b.emit('SIGNED_IN'); await b.api.refresh();
  gate.resolve({ error: { message: 'late failure' } }); const result = await pending;
  assert.equal(result.error.code, 'SESSION_CHANGED'); assert.equal(b.api.getState().profile.id, 'business-B');
});
test('Storage and unexpected SDK errors do not expose raw error codes', async () => {
  const denied = boot({ storageError: true }); assert.equal((await denied.api.initialize()).error.code, 'STORAGE_UNAVAILABLE');
  const broken = boot({ sdkError: { code: 'private-secret' } }); assert.equal((await broken.api.initialize()).error.code, 'CONFIG_INVALID'); assert(!JSON.stringify(broken.events).includes('private-secret'));
});
test('Subscriber failure and mutation cannot disrupt cleanup or alter internal state', async () => {
  const b = boot({ session: session('A') }); assert.doesNotThrow(() => b.api.subscribe(() => { throw Error('view failure'); }));
  b.api.subscribe(state => { if (state.profile) state.profile.display_name = 'mutated'; });
  await b.api.initialize(); assert.equal(b.api.getState().profile.display_name, 'Name A'); await b.api.signOut(); privateClear(b.api.getState());
});
(async () => {
  for (const { name, run } of tests) { await run(); console.log('PASS ' + name); }
  console.log(`${tests.length} account-session boundary checks passed. SDK/server responses are mocked; these do not prove real Google OAuth, RLS or multi-tab browser behavior.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
