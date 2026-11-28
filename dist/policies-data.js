/* BEMO Standard Policies Hub Data (All 15 Commercial & Legal Policies) */
(() => {
  'use strict';
  const OVERRIDE_KEY = 'bemo-policies-overrides-v1';

  const META = {
    governingLawAr: 'المبادئ العامة للتجارة الإلكترونية والقوانين المعمول بها في بلد الإطلاق (يُحدد الاختصاص القضائي الرسمي عند الاعتماد القانوني النهائي).',
    governingLawEn: 'General e-commerce principles and applicable laws in the launch jurisdiction (specific court jurisdiction to be confirmed upon final legal sign-off).',
    reviewNoticeAr: 'تنبيه قانوني: تم إعداد هذه السياسات كمسودة قياسية قيّمة لتنظيم العمل على المنصة، ولا تُعد ملزمة نهائياً إلا بعد مراجعتها واعتمادها قانونياً وفق القوانين المحلية المختارة من قِبل إدارة المشروع.',
    reviewNoticeEn: 'Legal Review Notice: These standard marketplace policies are provided as an operational draft and require formal legal review before final regulatory adoption in your target jurisdiction.',
    contactRouteAr: 'عبر نظام إشعارات الدعم الفني والمراسلات الداخلية (تصل الشكاوى والبلاغات مباشرة إلى المسؤولين دون كشف بيانات شخصية).',
    contactRouteEn: 'Via the in-platform Support Notification & Ticket system (all complaints and reports route directly to administrators).'
  };

  const STANDARD_POLICIES = [
    {
      slug: 'terms',
      category: 'core',
      titleAr: '1. شروط الخدمة (Terms of Service)',
      titleEn: '1. Terms of Service',
      bodyAr: `تحكم هذه الشروط استخدامك لمنصة BEMO بصفتها سوقاً إلكترونياً يربط المشترين بالمتاجر المستقلة.\n• المنصة وسيط تقني لعرض المنتجات وإدارة دورة الطلب؛ ويتحمل كل بائع مسؤولية جودة منتجاته ومطابقتها للوصف.\n• يلتزم المستخدم بتقديم معلومات حقيقية عند الشراء أو فتح المتجر.\n• يُخضع تفسير هذه الشروط للقواعد العامة للتجارة الإلكترونية وحماية المستهلك وفق بلد الإطلاق.\n• يحق لإدارة المنصة تحديث هذه الشروط مستقبلاً، وتُطلب موافقة المستخدم عند التحديثات الجوهرية فقط دون إزعاج في كل زيارة.`,
      bodyEn: `These Terms govern your access to BEMO as a multi-vendor marketplace connecting buyers with independent stores.\n• BEMO provides the technical storefront and order coordination; each seller is responsible for product quality and listing accuracy.\n• Users agree to provide accurate delivery and store details.\n• Governed by general e-commerce and consumer protection principles.\n• Substantial updates will be communicated clearly without requiring repeated consent on every visit.`
    },
    {
      slug: 'privacy',
      category: 'privacy',
      titleAr: '2. سياسة الخصوصية (Privacy Policy)',
      titleEn: '2. Privacy Policy',
      bodyAr: `تحترم BEMO خصوصيتك وتعتمد مبدأ الحد الأدنى من البيانات:\n• عند تسجيل الدخول بـ Google/Gmail أو باسم المستخدم، نجمع فقط الاسم والبريد/المعرّف؛ أما رقم الهاتف والعنوان فيظلان اختياريين وتضيفهما متى أردت تثبيت عنوان للتوصيل.\n• حماية بيانات المشتري: لا يرى التاجر رقم هاتفك أو عنوانك التفصيلي قبل أن يقبل طلبك رسمياً ويؤكد توفر المخزون.\n• نستخدم البيانات فقط لتنفيذ الطلبات، مكافحة الاحتيال في الخلفية، وإشعارات الحساب.\n• يمكنك طلب تنزيل نسخة من بياناتك الشخصية (JSON) أو طلب حذف حسابك مباشرة من صفحة حسابي.`,
      bodyEn: `BEMO respects your privacy and minimizes required personal data.\n• Sign-in requires only your Gmail/Google identity or chosen username; phone number and shipping address remain optional until you choose to save them for orders.\n• Buyer Contact Privacy: Sellers cannot see your phone number or exact street address until they formally accept your order.\n• You can export your personal data (JSON) or request account deletion anytime from My Account.`
    },
    {
      slug: 'cookies',
      category: 'privacy',
      titleAr: '3. سياسة ملفات الارتباط والتخزين المحلي (Cookie Policy)',
      titleEn: '3. Cookie Policy',
      bodyAr: `تستخدم BEMO ملفات الارتباط والتخزين المحلي (localStorage) الضرورية فقط لتشغيل المنصة:\n• حفظ جلسة تسجيل الدخول الحالية وأمانها.\n• حفظ محتويات سلة التسوق، قائمة المفضلة، اختيار اللغة (العربية/الإنجليزية)، والمظهر (فاتح/داكن).\n• لا تستخدم المنصة ملفات تتبع إعلانية لطرف ثالث لبيع بياناتك.`,
      bodyEn: `BEMO uses strictly necessary cookies and browser localStorage to keep the marketplace working smoothly:\n• Maintaining your active sign-in session.\n• Remembering cart items, saved favorites, language preference (AR/EN), and dark/light theme.\n• We do not sell personal data or run invasive third-party ad trackers.`
    },
    {
      slug: 'acceptable-use',
      category: 'rules',
      titleAr: '4. سياسة الاستخدام المقبول (Acceptable Use Policy)',
      titleEn: '4. Acceptable Use Policy',
      bodyAr: `يُحظر إساءة استخدام المنصة أو محاولة تعطيلها:\n• يُمنع إرسال طلبات وهمية متكررة (Fake COD Orders) بقصد الإضرار بالتجار.\n• يُمنع محاولة تجاوز صلاحيات الخادم، تعديل الأسعار أو الأرصدة من جهة العميل، أو استغلال ثغرات تقنية.\n• يُمنع جمع بيانات المستخدمين أو أرقام هواتفهم لأغراض التسويق المزعج (Spam) خارج إطار تنفيذ الطلب.`,
      bodyEn: `Abuse of the BEMO platform is strictly prohibited:\n• Placing fraudulent Cash-on-Delivery orders to harm sellers is forbidden.\n• Attempting to manipulate client-side prices, bypass server checks, or scrape user phone numbers/addresses is prohibited.\n• Respectful conduct is expected across support communications and order reviews.`
    },
    {
      slug: 'prohibited-items',
      category: 'rules',
      titleAr: '5. سياسة السلع المحظورة (Prohibited Items Policy)',
      titleEn: '5. Prohibited Items Policy',
      bodyAr: `يُمنع عرض أو بيع أي منتجات مخالفة للقانون العام أو تضر بسلامة المجتمع:\n• الأسلحة والذخائر والمواد المتفجرة أو الخطرة.\n• المواد المخدرة أو الأدوية غير المرخصة طبياً.\n• السلع المسروقة أو المقلدة التي تنتهك حقوق الغير.\n• أي مواد أو محتوى محظور بموجب الأنظمة العامة المعمول بها في بلد التشغيل.\nيحق للجميع الإبلاغ عن أي منتج مخالف عبر زر "الإبلاغ عن المنتج" وتُرفع الشكوى فوراً لإدارة المنصة.`,
      bodyEn: `Sellers may not list illegal, unsafe, or restricted goods:\n• Weapons, explosives, hazardous materials.\n• Controlled substances or unlicensed pharmaceuticals.\n• Stolen goods or counterfeit products infringing third-party rights.\n• Any item restricted by applicable public law. Anyone may report violating listings directly from the product page.`
    },
    {
      slug: 'seller-policy',
      category: 'commerce',
      titleAr: '6. سياسة البائع والتاجر (Seller Policy)',
      titleEn: '6. Seller Policy',
      bodyAr: `تنظم هذه السياسة عمل المتاجر المستقلة على BEMO:\n• يحق لكل حساب فتح متجر واحد بمعرّف دائم (@slug) وتقديم بيانات توثيق صحيحة.\n• يلتزم البائع بدقة الأسعار والصور وحالة المخزون.\n• يجب الرد على الطلبات الواردة بالقبول أو الرفض خلال المهلة المحددة (تنبيه بعد 24 ساعة وتصعيد للدعم بعد 48 ساعة عند عدم الرد).\n• يحدد كل بائع في إعدادات متجره "مدة الاسترجاع المعتمدة لديه" ورسوم التوصيل بوضوح تام قبل شراء العميل.\n• عمولة المنصة في مرحلة الإطلاق الحالية هي 0% (ما لم تحدد الإدارة نسبة رسمية معلنة مسبقاً في لوحة الرصيد).`,
      bodyEn: `This policy governs independent merchants on BEMO:\n• Each account may operate one store with a permanent @slug and accurate verification info.\n• Sellers must maintain accurate pricing, photos, and stock counts.\n• Sellers must respond to incoming orders promptly (24h reminder, 48h support escalation).\n• Each seller defines their store's return window and delivery fees transparently.\n• Platform launch commission is currently 0% unless explicitly configured and disclosed in Balance & Commission.`
    },
    {
      slug: 'buyer-policy',
      category: 'commerce',
      titleAr: '7. سياسة المشتري (Buyer Policy)',
      titleEn: '7. Buyer Policy',
      bodyAr: `توضح هذه السياسة حقوق والتزامات المشتري:\n• يحق للمشتري الاطلاع على السعر النهائي وتكلفة توصيل كل متجر بشكل منفصل قبل تأكيد الطلب.\n• يحق للمشتري معاينة وفحص الشحنة عند التسليم (الدفع عند الاستلام) ورفضها دون مقابل إذا كانت تالفة أو مخالفة للوصف.\n• يلتزم المشتري بالجدية في الطلب وتوفير عنوان واضح ورقم للتواصل عند التسليم.\n• يحق للمشتري إلغاء الطلب فوراً قبل قبول التاجر، أو فتح طلب إرجاع/شكوى بعد الاستلام حسب سياسة المتجر والمنصة.`,
      bodyEn: `This policy outlines buyer rights and obligations:\n• Buyers see the itemized total and per-store delivery fee clearly before order confirmation.\n• Buyers have the right to inspect COD deliveries before paying and reject damaged or mismatched packages.\n• Buyers agree to place genuine orders with accurate contact/address details.\n• Buyers may cancel freely before seller acceptance.`
    },
    {
      slug: 'refund-return',
      category: 'commerce',
      titleAr: '8. سياسة الإرجاع والاسترداد (Refund & Return Policy)',
      titleEn: '8. Refund & Return Policy',
      bodyAr: `تعتمد BEMO معيار الشفافية والمرونة في الإرجاع:\n• مدة الاسترجاع: تُحدد مدة الاسترجاع حسب سياسة كل بائع ومتجر وتظهر بوضوح في صفحة المنتج والمتجر قبل الشراء.\n• الرفض الفوري عند الباب: في نظام الدفع عند الاستلام، إذا وصل المنتج تالفاً أو غير مطابق يمكنك رفض الاستلام فوراً دون دفع ثمنه.\n• بعد الاستلام: في حال وجود عيب مصنعي أو مخالفة للوصف خلال مدة الاسترجاع المحددة من البائع، يتم تقديم طلب إرجاع من صفحة "طلباتي" مع فحص الحالة من الدعم عند الحاجة.\n• الاسترداد النقدي: بما أن الدفع عند الاستلام يتم مباشرة مع التاجر/مندوبه، يقوم التاجر برد المبلغ المتفق عليه للمشتري مباشرة عند استلام وفحص المرتجع، وبإشراف الدعم الإداري.`,
      bodyEn: `BEMO ensures transparent returns:\n• Return Window: The eligible return duration is set individually by each Seller and clearly displayed on the store/product page.\n• Instant Doorstep Rejection: For Cash-on-Delivery orders, you may inspect and reject damaged or mismatched items immediately without paying.\n• Post-Delivery Returns: Within the seller's return window, request a return via My Orders. Once returned and inspected, the seller refunds the cash payment directly under platform support oversight.`
    },
    {
      slug: 'cancellation',
      category: 'commerce',
      titleAr: '9. سياسة الإلغاء (Cancellation Policy)',
      titleEn: '9. Cancellation Policy',
      bodyAr: `تنقسم قواعد الإلغاء إلى مرحلتين:\n• قبل قبول التاجر: يحق للمشتري إلغاء الطلب بنقرة واحدة فوراً من صفحة "طلباتي" دون أي رسوم أو شروط.\n• بعد قبول التاجر أو الشحن: لا يمكن الإلغاء الفوري مباشرة؛ بل يقدم المشتري "طلب إلغاء" يراجعه البائع أو الدعم الإداري للتنسيق مع المندوب وحفظ حق الطرفين.\n• يحق للتاجر رفض الطلب قبل القبول إذا نفد المخزون فعلياً مع إشعار المشتري فوراً.`,
      bodyEn: `Cancellations follow a two-stage rule:\n• Before Seller Acceptance: Buyers can cancel instantly in one click with zero fees.\n• After Acceptance / Dispatch: Buyers submit a Cancellation Request reviewed by the seller or support team to coordinate with delivery.\n• Sellers may reject pending orders if stock is unavailable.`
    },
    {
      slug: 'shipping-delivery',
      category: 'commerce',
      titleAr: '10. سياسة الشحن والتوصيل (Shipping & Delivery Policy)',
      titleEn: '10. Shipping & Delivery Policy',
      bodyAr: `• يدير كل متجر مستقل عملية التوصيل الخاصة به أو عبر مندوبيه.\n• تظهر رسوم التوصيل والوقت المتوقع لكل متجر وبحسب المنطقة/المدينة بوضوح قبل تأكيد السلة.\n• يمكن للمشتري تتبع جميع مراحل الشحنة (قيد الانتظار، مقبول، قيد التجهيز، السائق في الطريق، وصل المندوب، تم التسليم) عبر صفحة طلباتي.`,
      bodyEn: `• Each independent store manages its own shipping and couriers.\n• Delivery fees per store and region are shown transparently before checkout confirmation.\n• Buyers track live order milestones from acceptance and packing to driver dispatch, arrival, and delivery in My Orders.`
    },
    {
      slug: 'payment',
      category: 'commerce',
      titleAr: '11. سياسة الدفع والمعاملات المالية (Payment Policy)',
      titleEn: '11. Payment Policy',
      bodyAr: `• طريقة الدفع الأساسية في المنصة هي الدفع نقداً عند الاستلام (Cash on Delivery - COD) مباشرة بين المشتري ومندوب التاجر.\n• لا تطلب BEMO بطاقات ائتمان من المشترين ولا تحتفظ بأموال المشترين.\n• عمولة المنصة على المشتري: 0% دائماً.\n• بالنسبة للتاجر: شحن الرصيد الإداري (إن فُعّلت العمولة مستقبلاً) يتم عبر إيصال تحويل بنكي يدوي يُراجع من الإدارة مع سجل مالي غير قابل للتعديل أو الحذف.`,
      bodyEn: `• BEMO operates primarily on Cash on Delivery (COD) paid directly upon inspection and delivery.\n• BEMO does not collect buyer credit card details or hold buyer funds.\n• Platform fee for buyers is always 0%.\n• Seller balance top-ups (when platform commission rules are active) use manual transfer receipts verified by administrators in an immutable ledger.`
    },
    {
      slug: 'ip',
      category: 'rules',
      titleAr: '12. سياسة الملكية الفكرية (Intellectual Property Policy)',
      titleEn: '12. Intellectual Property Policy',
      bodyAr: `• العلامة التجارية "BEMO" وتصاميم المنصة وأكوادها مملوكة لإدارة المشروع.\n• يضمن البائع أن صور المنتجات والأوصاف التي يرفعها لا تنتهك حقوق نشر أو علامات تجارية لأطراف ثالثة.\n• يمكن لأصحاب الحقوق تقديم بلاغ انتهاك ملكية فكرية عبر نظام إشعارات الدعم الفني وستتم مراجعته وإزالة المحتوى المخالف فور التحقق.`,
      bodyEn: `• The BEMO brand, interface designs, and software are proprietary to platform management.\n• Sellers warrant that uploaded photos and product copy do not infringe third-party copyrights or trademarks.\n• Rightsholders may submit takedown notices via the in-platform Support Notification channel.`
    },
    {
      slug: 'disputes',
      category: 'governance',
      titleAr: '13. سياسة حل النزاعات والشكاوى (Dispute Resolution Policy)',
      titleEn: '13. Dispute Resolution Policy',
      bodyAr: `• يتم التواصل والشكاوى عبر نظام إشعارات الدعم المباشر داخل المنصة (من المشتكي إلى المسؤول) دون الحاجة لمشاركة أرقام هواتف أو بريد شخصي علني.\n• يلتزم فريق الدعم بالحياد ومنع تضارب المصالح (لا يراجع الموظف أي قضية تخص متجره أو مشترياته).\n• عند عدم التوصل لحل ودي بين المشتري والبائع، تُفصل الإدارة في الحالة استناداً إلى الوصل الإلكتروني، سجل مراحل الطلب، والأدلة المرفقة.`,
      bodyEn: `• Disputes and complaints are routed directly to administrators via our in-platform Support Notification workflow without exposing private emails or phone numbers.\n• Support reviewers operate under strict conflict-of-interest checks.\n• Decisions rely on electronic order receipts, state transition logs, and submitted evidence.`
    },
    {
      slug: 'suspension',
      category: 'governance',
      titleAr: '14. سياسة تعليق الحسابات والاستئناف (Account Suspension & Recovery Policy)',
      titleEn: '14. Account Suspension, Termination & Recovery Policy',
      bodyAr: `تعتمد BEMO مبدأ التناسب ومنع الحظر المفرط (Anti-Overprotection):\n• لا يُحظر أي حساب حقيقي بسبب تغيير IP، استخدام VPN، اختلاف المتصفح، أو تكرار طبيعي للطلبات.\n• التدرج في الإجراء: الاشتباه المنخفض يقتصر على المراقبة فقط؛ النشاط غير المعتاد يواجه تقييداً مؤقتاً للوظيفة المحددة دون إيقاف الحساب؛ والحظر المؤقت ينتهي تلقائياً بانتهاء مدته.\n• حفظ الحقوق: عند أي تعليق أمني مؤقت تبقى جميع طلباتك، رصيدك، عناوينك، وبياناتك محفوظة بالكامل ولا تُحذف.\n• استعادة الحساب والطعن: إذا تعرضت لحظر عن طريق الخطأ، يمكنك تقديم طلب مراجعة وفك حظر مباشرة من صفحة حسابي أو مركز الأمان ليصل كإشعار فوري للإدارة.`,
      bodyEn: `BEMO enforces strict anti-overprotection and proportionality rules:\n• Real users are never banned solely for changing IP addresses, using VPNs, switching browsers, or making legitimate multiple purchases.\n• Graduated actions: low suspicion is monitored silently; unusual spikes face narrow feature throttling rather than full account bans; temporary blocks expire automatically.\n• Your orders, balances, and account history remain intact during any temporary hold, and you can submit an immediate false-positive unblock appeal directly from My Account or the Safety Center.`
    },
    {
      slug: 'disclaimer',
      category: 'governance',
      titleAr: '15. إخلاء المسؤولية وحدود مسؤولية المنصة (Disclaimer)',
      titleEn: '15. Disclaimer & Limitation of Liability',
      bodyAr: `• تُقدم المنصة "كما هي" وتخضع القواعد والضمانات لحدود الأنظمة العامة المطبقة.\n• BEMO ليست المصنّع ولا البائع المباشر للسلع المعروضة من المتاجر المستقلة، ولا تقدم ضمانات مالية أو قانونية غير منصوص عليها صراحة.\n• أية رسوم أو عمولات أو التزامات إضافية غير محددة بوضوح في لوحة التاجر وصفحة الدفع لا تُفرض على المستخدم.\n• يُذكّر المشروع بأن جميع السياسات المنشورة قياسية وتخضع للمراجعة القانونية النهائية من مستشار قانوني وفق الدولة المستهدفة عند الإطلاق الرسمي.`,
      bodyEn: `• BEMO provides marketplace infrastructure "as is" under applicable general commercial principles.\n• BEMO is not the manufacturer or direct vendor of independent store listings and creates no implied guarantees or hidden fees.\n• No unstated fees apply. All published policies remain standard drafts pending formal legal counsel review for your target launch jurisdiction.`
    }
  ];

  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); } catch (_) { return {}; }
  }

  function saveLocalOverride(slug, patch) {
    const all = getOverrides();
    all[slug] = { ...(all[slug] || {}), ...patch, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all)); } catch (_) {}
    return all[slug];
  }

  async function loadPolicies() {
    const overrides = getOverrides();
    let remote = [];
    try {
      const cfg = window.BEMO_BACKEND;
      if (window.supabase?.createClient && cfg?.url && cfg?.publishableKey) {
        const client = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false } });
        const res = await client.rpc('bemo_list_policies');
        if (!res.error && Array.isArray(res.data)) remote = res.data;
      }
    } catch (_) {}

    return STANDARD_POLICIES.map(base => {
      const rem = remote.find(r => r.slug === base.slug);
      const ov = overrides[base.slug];
      return {
        ...base,
        titleAr: ov?.titleAr || rem?.title_ar || base.titleAr,
        titleEn: ov?.titleEn || rem?.title_en || base.titleEn,
        bodyAr: ov?.bodyAr || rem?.body_ar || base.bodyAr,
        bodyEn: ov?.bodyEn || rem?.body_en || base.bodyEn,
        version: ov?.version || rem?.version || 1,
        updatedAt: ov?.updatedAt || rem?.updated_at || '2026-11-28'
      };
    });
  }

  window.BemoPolicies = {
    META,
    STANDARD_POLICIES,
    loadPolicies,
    saveLocalOverride
  };
})();
