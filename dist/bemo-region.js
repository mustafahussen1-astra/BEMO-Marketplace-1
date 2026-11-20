/**
 * BEMO Regionalization & Multi-Currency Engine
 * Detects visitor location, timezone and currency automatically.
 * Supports manual switching and site-wide real-time currency updates.
 */
(() => {
  'use strict';

  const REGIONS = {
    IQ: {
      code: 'IQ',
      nameAr: 'العراق',
      nameEn: 'Iraq',
      currency: 'IQD',
      symbolAr: 'د.ع',
      symbolEn: 'IQD',
      flag: '🇮🇶',
      rate: 1310, // 1 USD = 1310 IQD
      decimals: 0,
      cities: ['بغداد', 'البصرة', 'أربيل', 'الموصل', 'النجف', 'كربلاء', 'السليمانية', 'كركوك', 'بابل']
    },
    SA: {
      code: 'SA',
      nameAr: 'السعودية',
      nameEn: 'Saudi Arabia',
      currency: 'SAR',
      symbolAr: 'ر.س',
      symbolEn: 'SAR',
      flag: '🇸🇦',
      rate: 3.75, // 1 USD = 3.75 SAR
      decimals: 2,
      cities: ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'أبها', 'تبوك']
    },
    AE: {
      code: 'AE',
      nameAr: 'الإمارات',
      nameEn: 'UAE',
      currency: 'AED',
      symbolAr: 'د.إ',
      symbolEn: 'AED',
      flag: '🇦🇪',
      rate: 3.67, // 1 USD = 3.67 AED
      decimals: 2,
      cities: ['دبي', 'أبوظبي', 'الشارقة', 'عجمان', 'رأس الخيمة', 'الفجيرة']
    },
    EG: {
      code: 'EG',
      nameAr: 'مصر',
      nameEn: 'Egypt',
      currency: 'EGP',
      symbolAr: 'ج.م',
      symbolEn: 'EGP',
      flag: '🇪🇬',
      rate: 49.50, // 1 USD = ~49.5 EGP
      decimals: 2,
      cities: ['القاهرة', 'الجيزة', 'الإسكندرية', 'المنصورة', 'طنطا', 'أسيوط', 'بورسعيد']
    },
    KW: {
      code: 'KW',
      nameAr: 'الكويت',
      nameEn: 'Kuwait',
      currency: 'KWD',
      symbolAr: 'د.ك',
      symbolEn: 'KWD',
      flag: '🇰🇼',
      rate: 0.31, // 1 USD = 0.31 KWD
      decimals: 3,
      cities: ['الكويت', 'الأحمدي', 'حولي', 'السالمية', 'الجهراء', 'الفروانية']
    },
    QA: {
      code: 'QA',
      nameAr: 'قطر',
      nameEn: 'Qatar',
      currency: 'QAR',
      symbolAr: 'ر.ق',
      symbolEn: 'QAR',
      flag: '🇶🇦',
      rate: 3.64,
      decimals: 2,
      cities: ['الدوحة', 'الريان', 'الوكرة', 'الخور']
    },
    JO: {
      code: 'JO',
      nameAr: 'الأردن',
      nameEn: 'Jordan',
      currency: 'JOD',
      symbolAr: 'د.أ',
      symbolEn: 'JOD',
      flag: '🇯🇴',
      rate: 0.71,
      decimals: 2,
      cities: ['عمان', 'إربد', 'الزرقاء', 'العقبة']
    },
    TR: {
      code: 'TR',
      nameAr: 'تركيا',
      nameEn: 'Turkey',
      currency: 'TRY',
      symbolAr: '₺',
      symbolEn: 'TRY',
      flag: '🇹🇷',
      rate: 34.50,
      decimals: 2,
      cities: ['إسطنبول', 'أنقرة', 'إزمير', 'بورصة', 'أنطاليا']
    },
    GLOBAL: {
      code: 'GLOBAL',
      nameAr: 'الدولي (USD)',
      nameEn: 'Global (USD)',
      currency: 'USD',
      symbolAr: '$',
      symbolEn: '$',
      flag: '🌐',
      rate: 1.0,
      decimals: 2,
      cities: ['Global Delivery']
    }
  };

  const STORAGE_KEY = 'bemo-user-region';

  function detectRegion() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && REGIONS[saved]) return REGIONS[saved];
    } catch (_) {}

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.includes('Baghdad')) return REGIONS.IQ;
      if (tz.includes('Riyadh')) return REGIONS.SA;
      if (tz.includes('Dubai') || tz.includes('Abu_Dhabi')) return REGIONS.AE;
      if (tz.includes('Cairo')) return REGIONS.EG;
      if (tz.includes('Kuwait')) return REGIONS.KW;
      if (tz.includes('Qatar')) return REGIONS.QA;
      if (tz.includes('Amman')) return REGIONS.JO;
      if (tz.includes('Istanbul')) return REGIONS.TR;

      const navLangs = navigator.languages || [navigator.language || ''];
      for (const lang of navLangs) {
        if (/[-_]IQ$/i.test(lang)) return REGIONS.IQ;
        if (/[-_]SA$/i.test(lang)) return REGIONS.SA;
        if (/[-_]AE$/i.test(lang)) return REGIONS.AE;
        if (/[-_]EG$/i.test(lang)) return REGIONS.EG;
        if (/[-_]KW$/i.test(lang)) return REGIONS.KW;
        if (/[-_]TR$/i.test(lang)) return REGIONS.TR;
      }
    } catch (_) {}

    // Default to Iraq as primary regional launch market
    return REGIONS.IQ;
  }

  let currentRegion = detectRegion();

  function setRegion(code) {
    if (!REGIONS[code]) return;
    currentRegion = REGIONS[code];
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch (_) {}

    updateDOM();
    window.dispatchEvent(new CustomEvent('bemo:region-change', { detail: currentRegion }));
  }

  function convert(amountUSD) {
    const val = Number(amountUSD) || 0;
    return val * currentRegion.rate;
  }

  function formatMoney(amountUSD, isArabic = (document.documentElement.lang !== 'en')) {
    const num = Number(amountUSD) || 0;
    const local = num * currentRegion.rate;
    const symbol = isArabic ? currentRegion.symbolAr : currentRegion.symbolEn;

    if (currentRegion.decimals === 0) {
      const formatted = Math.round(local).toLocaleString();
      return isArabic ? `${formatted} ${symbol}` : `${symbol} ${formatted}`;
    }

    const formatted = local.toLocaleString(undefined, {
      minimumFractionDigits: currentRegion.decimals,
      maximumFractionDigits: currentRegion.decimals
    });
    return isArabic ? `${formatted} ${symbol}` : `${symbol} ${formatted}`;
  }

  function updateDOM() {
    const isAr = document.documentElement.lang !== 'en';
    const name = isAr ? currentRegion.nameAr : currentRegion.nameEn;
    const symbol = isAr ? currentRegion.symbolAr : currentRegion.symbolEn;

    document.querySelectorAll('[data-bemo-region-flag]').forEach(el => el.textContent = currentRegion.flag);
    document.querySelectorAll('[data-bemo-region-name]').forEach(el => el.textContent = name);
    document.querySelectorAll('[data-bemo-region-currency]').forEach(el => el.textContent = currentRegion.currency);
    document.querySelectorAll('[data-bemo-region-symbol]').forEach(el => el.textContent = symbol);
    document.querySelectorAll('[data-bemo-region-full]').forEach(el => {
      el.textContent = `${currentRegion.flag} ${name} (${symbol})`;
    });

    const activeItem = document.querySelector(`.bemo-region-opt[data-code="${currentRegion.code}"]`);
    if (activeItem) {
      document.querySelectorAll('.bemo-region-opt').forEach(opt => opt.classList.remove('active'));
      activeItem.classList.add('active');
    }
  }

  function createDropdownMarkup() {
    const isAr = document.documentElement.lang !== 'en';
    const listHtml = Object.values(REGIONS).map(r => `
      <button type="button" class="bemo-region-opt ${r.code === currentRegion.code ? 'active' : ''}" data-code="${r.code}">
        <span class="region-flag">${r.flag}</span>
        <span class="region-opt-name">${isAr ? r.nameAr : r.nameEn}</span>
        <span class="region-opt-cur">${isAr ? r.symbolAr : r.symbolEn}</span>
      </button>
    `).join('');

    return `
      <div class="bemo-region-picker" id="bemoRegionPicker">
        <button type="button" class="bemo-region-trigger" id="bemoRegionBtn" aria-label="تغيير الدولة والعملة" title="تغيير الدولة والعملة">
          <span class="region-flag" data-bemo-region-flag>${currentRegion.flag}</span>
          <span class="region-label" data-bemo-region-full>${currentRegion.flag} ${isAr ? currentRegion.nameAr : currentRegion.nameEn} (${isAr ? currentRegion.symbolAr : currentRegion.symbolEn})</span>
          <span class="region-arrow">▾</span>
        </button>
        <div class="bemo-region-dropdown" id="bemoRegionMenu" hidden>
          <div class="region-menu-header">
            <strong>${isAr ? 'اختر وجهة التوصيل والعملة' : 'Select Delivery Country & Currency'}</strong>
            <small>${isAr ? 'الأسعار والتوصيل والدفع عند الاستلام تتحدث فورياً' : 'Prices & COD update immediately'}</small>
          </div>
          <div class="region-menu-list">
            ${listHtml}
          </div>
        </div>
      </div>
    `;
  }

  function injectRegionPicker() {
    // Look for top bar target
    const target = document.querySelector('.top-flash-links') || 
                   document.querySelector('.announcement-right') || 
                   document.querySelector('.flash-inner');
    if (!target) return;

    if (document.getElementById('bemoRegionPicker')) return;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.innerHTML = createDropdownMarkup();

    // Insert before language button or append
    const langBtn = target.querySelector('#languageButton') || target.querySelector('.top-lang-btn');
    if (langBtn && langBtn.parentNode) {
      const sep = document.createElement('span');
      sep.className = 'top-sep';
      sep.textContent = '|';
      sep.style.margin = '0 6px';
      langBtn.parentNode.insertBefore(wrapper, langBtn);
      langBtn.parentNode.insertBefore(sep, langBtn);
    } else {
      target.appendChild(wrapper);
    }

    // Bind events
    const trigger = document.getElementById('bemoRegionBtn');
    const menu = document.getElementById('bemoRegionMenu');

    if (trigger && menu) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
      });

      menu.addEventListener('click', (e) => {
        const opt = e.target.closest('.bemo-region-opt');
        if (!opt) return;
        const code = opt.dataset.code;
        setRegion(code);
        menu.hidden = true;
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#bemoRegionPicker')) {
          menu.hidden = true;
        }
      });
    }

    // Add styles
    if (!document.getElementById('bemo-region-styles')) {
      const style = document.createElement('style');
      style.id = 'bemo-region-styles';
      style.textContent = `
        .bemo-region-picker {
          position: relative;
          display: inline-flex;
          align-items: center;
          font-size: 11px;
        }
        .bemo-region-trigger {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.25);
          color: #FFFFFF;
          padding: 3px 8px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .bemo-region-trigger:hover {
          background: rgba(255, 255, 255, 0.2);
          border-color: #FFFFFF;
        }
        .bemo-region-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          inset-inline-end: 0;
          background: #FFFFFF;
          color: #1E293B;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
          min-width: 240px;
          z-index: 10000;
          overflow: hidden;
          animation: bemoFadeIn 150ms ease;
        }
        @keyframes bemoFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .region-menu-header {
          padding: 10px 12px;
          background: #F8FAFC;
          border-bottom: 1px solid #E2E8F0;
        }
        .region-menu-header strong {
          display: block;
          font-size: 12px;
          color: #0F172A;
        }
        .region-menu-header small {
          font-size: 10px;
          color: #64748B;
        }
        .region-menu-list {
          max-height: 280px;
          overflow-y: auto;
          padding: 4px;
        }
        .bemo-region-opt {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border: none;
          background: transparent;
          color: #1E293B;
          font-family: inherit;
          font-size: 12px;
          border-radius: 6px;
          cursor: pointer;
          text-align: start;
          transition: background 0.1s ease;
        }
        .bemo-region-opt:hover {
          background: #F1F5F9;
        }
        .bemo-region-opt.active {
          background: #FFF1E8;
          color: #FF5000;
          font-weight: 700;
        }
        .bemo-region-opt .region-opt-cur {
          margin-inline-start: auto;
          font-weight: 600;
          font-size: 11px;
          color: #64748B;
        }
        .bemo-region-opt.active .region-opt-cur {
          color: #FF5000;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Export public API
  window.BemoRegion = {
    getRegion: () => ({ ...currentRegion }),
    getRegions: () => ({ ...REGIONS }),
    setRegion,
    convert,
    formatMoney,
    updateDOM,
    mount: injectRegionPicker
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectRegionPicker);
  } else {
    injectRegionPicker();
  }
})();
