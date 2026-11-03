# BEMO — إعداد تسجيل Google للمرحلة التجريبية

**تاريخ المراجعة: ٣ نوفمبر ٢٠٢٦.** مشروع Supabase الجديد هو **BEMO Development**، ومعرّفه `qjtsfdfcczxowsfjtrwy`. هذه تعليمات الإعداد التالي، وليست إثباتاً بأن تسجيل Google قد عمل. إعداد المزود وصفحة العودة والاختبار بحساب حقيقي لم تُنجز بعد.

## خطوات المالك

1. افتح [Google Auth Platform](https://console.cloud.google.com/auth/overview) داخل مشروع Google Cloud تملكه. اضبط **Audience = External** لأن الحسابات المطلوبة Gmail، واترك مرحلة التجربة **Testing**. أدخل اسم BEMO وبريد دعم حقيقياً. استخدم صلاحيات الهوية الأساسية فقط: `openid` و`userinfo.email` و`userinfo.profile`؛ لا حاجة إلى الوصول لبريد Gmail أو جهات الاتصال. راجع حسابات التجربة التي تتيحها Google في إعداد الجمهور. [دليل Google في Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

2. من **Clients → Create client** اختر **Web application**. ضع في **Authorized JavaScript origins**:

   `https://bemo-marketplace-studio.supplecinch1.chatgpt.site`

   افتح [مزود Google داخل مشروع BEMO](https://supabase.com/dashboard/project/qjtsfdfcczxowsfjtrwy/auth/providers?provider=Google)، وانسخ **Callback URL** المعروض إلى **Authorized redirect URIs** لدى Google. القيمة المعتادة المتوقعة لهذا المشروع هي `https://qjtsfdfcczxowsfjtrwy.supabase.co/auth/v1/callback`؛ يجب أن تطابق القيمة المعروضة في لوحة المشروع حرفياً. [تعليمات إعداد المزود](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

3. انسخ **Client ID** و**Client Secret** من Google إلى حقولهما في صفحة مزود Google داخل Supabase، ثم فعّله. أدخل السر مباشرة هناك؛ لا ترسله في المحادثة أو تضعه في ملفات الموقع. فعّل Google وحده، وأوقف مزودي البريد/الهاتف والدخول المجهول وأي مزود آخر؛ يرفض BEMO كلمات المرور وOTP في V1. إعداد المزود وحده لا يفرض شرط Gmail، لذلك يتحقق أساس BEMO أيضاً من الهوية والبريد في الخادم.

4. في [Authentication → URL Configuration](https://supabase.com/dashboard/project/qjtsfdfcczxowsfjtrwy/auth/url-configuration) اجعل **Site URL** هو أصل الموقع أعلاه. يضاف **رابط العودة إلى صفحة BEMO** بعد تنفيذ تلك الصفحة وتحديد مسارها الفعلي. هذا الرابط مختلف عن رابط Supabase الذي أضفته إلى Google. أضف الروابط الدقيقة المعتمدة فقط؛ لا حاجة إلى wildcard واسع. [دليل روابط العودة](https://supabase.com/docs/guides/auth/redirect-urls).

5. بعد اكتمال الربط، يجري المالك الدخول بنفسه بحساب Gmail. نتحقق من نجاح العودة، ورفض بريد غير مسموح، وإلغاء المستخدم للموافقة، وانتهاء الرابط، والخروج، وإعادة الدخول. الاتصال المتاح يتيح لنا قراءة Project URL والمفتاح العام عند الحاجة؛ لا يلزم إرسال أسرار أو كلمات مرور.

## حدود المرحلة الحالية

- الموقع ما زال خاصاً بالمالك عبر بوابة ChatGPT؛ هذه البوابة منفصلة عن تسجيل Google الخاص بـ BEMO.
- للإطلاق العام بعلامة Google موثقة، يجب مراجعة ملكية النطاق وصفحة رئيسية وسياسة خصوصية متاحتين للعامة. لم نثبت ملكية نطاق `chatgpt.site`، ولا نعد بقبول Google أو مدة موافقتها. لا تتطلب تجربة تطوير محدودة الادعاء بأن العلامة موثقة. [متطلبات التحقق من العلامة](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
- الأدوات المتصلة الحالية لا تتضمن تعديل إعدادات Auth مباشرة. يمكن استخدام لوحة Supabase بحساب المالك، أو واجهة الإدارة الرسمية عندما تتوفر وسيلة أسرار مناسبة؛ لا حاجة لإرسال رمز إدارة في المحادثة.

## ملاحظات التنفيذ للفريق

- يحافظ الدمج على HTML/CSS/JavaScript الحالي. يدعم `@supabase/supabase-js` تسجيل Google مع PKCE دون إدخال إطار واجهة. يستخدم العميل Project URL ومفتاح publishable العام فقط؛ حقوق الوصول تحكمها سياسات قاعدة البيانات.
- يضبط العميل `flowType: 'pkce'`. اختر تبادل الرمز التلقائي مع `detectSessionInUrl: true` أو التبادل الصريح مرة واحدة؛ لا تجمعهما. يستلزم PKCE إكمال التدفق في المتصفح/الجهاز الذي بدأه. عالج خطأ العودة أو فقدان verifier برسالة قابلة لإعادة المحاولة، ولا تطبع الرموز في السجلات. [توثيق PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
- لا تثبت بيانات `user_metadata` صلاحية أو مزوداً أو دوراً. `amr = oauth` يدل على OAuth عموماً؛ يعتمد قصره على Google أيضاً على تفعيل Google وحده وفحص سجل الهوية الموثوق. لا يسمح العميل بتعيين admin أو اعتماد متجر أو شارة. [مرجع JWT](https://supabase.com/docs/guides/auth/jwt-fields).
- فحص `session_id` مقابل سجل الجلسة يكشف الخروج الذي حذف الجلسة؛ مجرد وجود السجل لا يثبت كل سياسات انتهاء الجلسات، لأن تنظيف الجلسات المنتهية قد يتأخر. حدود وقت الجلسة المتقدمة ليست مفترضة ضمن الخطة المجانية. [توثيق الجلسات](https://supabase.com/docs/guides/auth/sessions).
- SDK لم يُضف إلى المشروع بعد. يلزم تثبيت نسخة محددة مع سجل اعتماد وحجم الحزمة الفعلي وملف قفل قبل الدمج؛ لقطات نتائج البحث ليست مرجعاً كافياً لتسمية أحدث نسخة.
