(() => {
  'use strict';
  const form = document.getElementById('entry');
  const fields = form.elements;
  const words = {
    title:['مركز الإدارة','Admin center'], signin:['الدخول بحساب الإدارة','Sign in as an administrator'],
    finance:['إدارة الأرصدة والرسوم','Balances and fees'], support:['طلبات الدعم','Support cases'],
    discovery:['إدارة أشرطة الرئيسية','Homepage discovery'], section:['القسم','Section'],
    brand:['الماركات','Brands'], verified:['المتاجر الموثوقة','Verified stores'], offer:['العروض','Offers'],
    storeId:['معرّف المتجر','Store ID'], variantId:['معرّف خيار المنتج','Product variant ID'],
    brandName:['اسم الماركة','Brand name'], former:['السعر السابق للخيار','Previous variant price'],
    currency:['العملة','Currency'], position:['ترتيب الظهور','Display order'],
    visible:['ظاهر في الرئيسية','Visible on homepage'], save:['حفظ','Save'],
    ADMIN_REQUIRED:['هذه المساحة مخصصة للإدارة.','Administrator access required.']
  };
  const w = window.BemoWorkspace.create(words, {
    onReady: () => w.run(async request => {
      const access = await request('bemo_workspace_access');
      if (!access.admin) throw {code:'ADMIN_REQUIRED'};
      w.$('adminControls').hidden = false;
    }),
    onClear: () => { w.$('adminControls').hidden = true; form.reset(); layout(); },
    onLanguage: layout
  });
  function layout() {
    const offer = fields.kind.value === 'offer';
    w.$('targetLabel').textContent = w.t(offer ? 'variantId' : 'storeId');
    w.$('brandField').hidden = fields.kind.value !== 'brand';
    fields.label.required = !w.$('brandField').hidden;
    w.$('offerFields').hidden = !offer;
    fields.former.required = offer;
    w.$('supportLink').href = w.url('orders.html',{view:'support'});
  }
  for (const currency of window.BemoLive.currencies) fields.currency.add(new Option(currency,currency));
  fields.kind.addEventListener('change',layout);
  form.addEventListener('submit', event => {
    event.preventDefault();
    w.run(async request => {
      const kind = fields.kind.value;
      await request('bemo_set_discovery_entry', {
        kind, target:fields.target.value.trim(), label:kind === 'brand' ? fields.label.value.trim() : null,
        former_price:kind === 'offer' ? window.BemoLive.priceMinor(fields.former.value,fields.currency.value) : null,
        currency:kind === 'offer' ? fields.currency.value : null, enabled:fields.enabled.checked, sort_position:Number(fields.position.value)
      });
    },'saving');
  });
  w.start();
})();
