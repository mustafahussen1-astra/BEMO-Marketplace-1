/* Shared Ticket, Notification & Anti-Overprotection Client Helper */
(() => {
  'use strict';
  const STORAGE_KEY = 'bemo-support-tickets-v1';
  const NOTIF_KEY = 'bemo-admin-notifications-v1';
  const SECURITY_KEY = 'bemo-security-state-v1';

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }
  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }

  function currentUserInfo() {
    const st = window.BemoAccount?.getState?.();
    return {
      id: st?.profile?.id || st?.identity?.id || 'guest_' + (Date.now().toString(36)),
      email: st?.identity?.email || st?.profile?.email || '',
      name: st?.profile?.display_name || st?.profile?.username || 'مستخدم BEMO'
    };
  }

  async function submitTicket({ type, subject, message, targetRef = '', contact = '' }) {
    const cleanType = String(type || 'CONTACT').toUpperCase();
    const cleanSubject = String(subject || '').trim();
    const cleanMessage = String(message || '').trim();
    if (cleanSubject.length < 3 || cleanMessage.length < 10) {
      return { ok: false, error: 'VALIDATION_ERROR' };
    }

    const user = currentUserInfo();
    const ticket = {
      id: 'tkt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ticket_type: cleanType,
      reporter_id: user.id,
      reporter_name: user.name,
      reporter_contact: contact || user.email || 'via-support-notification',
      target_ref: String(targetRef || '').slice(0, 160),
      subject: cleanSubject.slice(0, 160),
      message: cleanMessage.slice(0, 3000),
      status: 'OPEN',
      admin_note: '',
      created_at: new Date().toISOString()
    };

    // Try live Supabase RPC first if authenticated with real SDK session
    try {
      const cfg = window.BEMO_BACKEND;
      if (window.supabase?.createClient && cfg?.url && cfg?.publishableKey) {
        const client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
          auth: { persistSession: true, storageKey: 'bemo-auth-v1' }
        });
        const res = await client.rpc('bemo_submit_ticket', {
          p_type: cleanType,
          p_subject: ticket.subject,
          p_message: ticket.message,
          p_target_ref: ticket.target_ref || null,
          p_contact: ticket.reporter_contact || null
        });
        if (!res.error && res.data?.ticket_id) {
          ticket.id = res.data.ticket_id;
          ticket.synced = true;
        }
      }
    } catch (_) {}

    // Persist locally & route to Admin Support Notification queue
    const tickets = readJson(STORAGE_KEY, []);
    tickets.unshift(ticket);
    writeJson(STORAGE_KEY, tickets.slice(0, 200));

    const notifs = readJson(NOTIF_KEY, []);
    notifs.unshift({
      id: 'ntf_' + Date.now().toString(36),
      kind: 'SUPPORT_TICKET_' + cleanType,
      ticket_id: ticket.id,
      title: `[إشعار دعم جديد - ${cleanType}] ${ticket.subject}`,
      body: `من: ${ticket.reporter_name} (${ticket.reporter_contact}) — ${ticket.message.slice(0, 160)}`,
      created_at: ticket.created_at,
      read: false
    });
    writeJson(NOTIF_KEY, notifs.slice(0, 100));

    window.dispatchEvent(new CustomEvent('bemo:ticket-submitted', { detail: ticket }));
    return { ok: true, ticket };
  }

  function listTickets({ onlyMine = false } = {}) {
    const all = readJson(STORAGE_KEY, []);
    if (!onlyMine) return all;
    const user = currentUserInfo();
    return all.filter(t => t.reporter_id === user.id || (user.email && t.reporter_contact === user.email));
  }

  function resolveLocalTicket(ticketId, status, adminNote) {
    const all = readJson(STORAGE_KEY, []);
    const idx = all.findIndex(t => t.id === ticketId);
    if (idx === -1) return false;
    all[idx].status = status;
    all[idx].admin_note = adminNote;
    all[idx].resolved_at = new Date().toISOString();
    writeJson(STORAGE_KEY, all);
    return true;
  }

  function listAdminNotifications() {
    return readJson(NOTIF_KEY, []);
  }

  function markAdminNotificationRead(id) {
    const all = readJson(NOTIF_KEY, []);
    for (const item of all) {
      if (!id || item.id === id) item.read = true;
    }
    writeJson(NOTIF_KEY, all);
  }

  function getSecurityState() {
    return readJson(SECURITY_KEY, {
      monitorMode: true,
      events: [],
      allowlist: [],
      suspended: {}
    });
  }

  function saveSecurityState(next) {
    writeJson(SECURITY_KEY, next);
  }

  window.BemoSupport = {
    submitTicket,
    listTickets,
    resolveLocalTicket,
    listAdminNotifications,
    markAdminNotificationRead,
    getSecurityState,
    saveSecurityState
  };
})();
