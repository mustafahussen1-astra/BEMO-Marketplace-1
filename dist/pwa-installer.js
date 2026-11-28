// Register PWA service worker and installation banner
(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPrompt();
  });

  function showInstallPrompt() {
    if (sessionStorage.getItem('bemo-pwa-dismissed')) return;
    if (document.getElementById('bemoPwaBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'bemoPwaBanner';
    banner.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 16px;
      right: 16px;
      max-width: 440px;
      margin: 0 auto;
      background: var(--bemo-surface, #1E293B);
      color: var(--bemo-text, #F8FAFC);
      border: 1px solid var(--bemo-border, #334155);
      border-radius: 16px;
      padding: 14px 18px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 14px;
      animation: bemoSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    banner.innerHTML = `
      <img src="icon-512.svg" alt="BEMO" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <strong style="display:block;font-size:14px;line-height:1.2;">تطبيق BEMO على هاتفك</strong>
        <span style="font-size:12px;color:var(--bemo-muted, #94A3B8);">تصفح وتسوق أسرع مع تجربة تطبيق كاملة.</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <button id="pwaInstallBtn" style="background:#FF5000;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">تثبيت</button>
        <button id="pwaCloseBtn" style="background:transparent;color:var(--bemo-muted, #94A3B8);border:none;padding:6px;font-size:16px;cursor:pointer;line-height:1;">✕</button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
      }
      banner.remove();
    });

    document.getElementById('pwaCloseBtn')?.addEventListener('click', () => {
      sessionStorage.setItem('bemo-pwa-dismissed', '1');
      banner.remove();
    });
  }
})();
