(function () {
  'use strict';
  const PAGE_SIZE = 12, MAX_PAGE = 834;
  function query(input = {}) {
    const text = typeof input.search === 'string' ? input.search.trim() : '';
    const page = Number(input.page ?? 1);
    if ([...text].length > 120 || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) throw new Error('QUERY_INVALID');
    return { search: text, page };
  }
  async function list(input, signal) {
    const request = query(input);
    const raw = window.BEMO_BACKEND;
    const url = new URL(raw?.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(raw?.publishableKey || '')) throw new Error('CONFIG_INVALID');
    // This endpoint deliberately exposes a public directory projection. Do not
    // attach a session, cookies, or owner data to a visitor's read request.
    const response = await fetch(url.origin + '/rest/v1/rpc/bemo_list_stores', {
      method: 'POST', credentials: 'omit', cache: 'no-store', signal,
      headers: { apikey: raw.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_text: request.search, limit_count: PAGE_SIZE + 1, offset_count: (request.page - 1) * PAGE_SIZE })
    });
    if (!response.ok) throw new Error('DIRECTORY_UNAVAILABLE');
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length > PAGE_SIZE + 1) throw new Error('RESPONSE_INVALID');
    const stores = rows.map(row => {
      if (!row || typeof row.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(row.id) || typeof row.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug) || row.slug.length > 48 || typeof row.title !== 'string' || [...row.title].length > 80 || !row.title.trim() || typeof row.description !== 'string' || [...row.description].length > 2000) throw new Error('RESPONSE_INVALID');
      // Whitelist public display fields even if a future response adds fields.
      return { id: row.id, slug: row.slug, title: row.title, description: row.description };
    });
    return { stores: stores.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE && request.page < MAX_PAGE, page: request.page, search: request.search };
  }
  window.BemoDirectory = Object.freeze({ list, query });
})();
