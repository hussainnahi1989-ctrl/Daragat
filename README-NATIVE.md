# النسخ الاحتياطي التلقائي إلى مجلد يختاره المستخدم — v1.12

قسم «النسخ الاحتياطي» فيه الآن نسخ تلقائي دوري (كل أسبوع / أسبوعين / شهر / شهرين / 3 أشهر / 6 أشهر) مع الاحتفاظ بآخر 3 أو 5 أو 10 أو 20 نسخة.

أماكن الحفظ حسب ما يدعمه الجهاز:
- **مجلد يختاره المستخدم مرة واحدة** ثم يُحفظ فيه تلقائياً بدون أي سؤال: يعمل في Chrome/Edge على الحاسوب مباشرة، وعلى الأندرويد عند إضافة الجسر أدناه داخل الـAPK.
- **مجلد التنزيلات (Download)**: تنزيل تلقائي للملف عند موعد النسخة.
- **داخل التطبيق**: تُحفظ دائماً نسخ داخلية (IndexedDB) كشبكة أمان مهما كانت الوجهة.

الملفات بصيغة `نسخة-تلقائية-<اسم المدرسة>-YYYY-MM-DD-HHMM.json` وتُستعاد من زر «استيراد النسخة الاحتياطية». لا تحتوي على بيانات التفعيل.

## الجسر المطلوب في تطبيق الأندرويد (اختياري لكن ضروري لاختيار مجلد على الأندرويد)

WebView في أندرويد لا يسمح لصفحة HTML بالكتابة في مجلد دون تدخل المستخدم. الحل الرسمي هو Storage Access Framework: المستخدم يختار المجلد مرة واحدة، والتطبيق يحتفظ بإذن دائم عليه. يكفي أن يوفّر الـAPK:

```js
window.DaragatNative = window.DaragatNative || {};
DaragatNative.pickBackupFolder = async () => ({ name: 'اسم المجلد' });   // أو 'cancel'
DaragatNative.writeBackupFile  = async (fileName, jsonText) => 'ok';    // أو 'error'
DaragatNative.pruneBackups     = (prefix, keep) => {};                  // اختياري: حذف الأقدم
```

مثال Kotlin مختصر:

```kotlin
// 1) اختيار المجلد مرة واحدة + حفظ الإذن الدائم
val pickTree = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
    if (uri != null) {
        contentResolver.takePersistableUriPermission(uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        prefs.edit().putString("backupTree", uri.toString()).apply()
        val name = DocumentFile.fromTreeUri(this, uri)?.name ?: "المجلد"
        webView.evaluateJavascript("window.__nbabPicked && window.__nbabPicked(${JSONObject.quote(name)})", null)
    } else webView.evaluateJavascript("window.__nbabPicked && window.__nbabPicked(null)", null)
}

inner class BackupBridge {
    @JavascriptInterface fun pick() = runOnUiThread { pickTree.launch(null) }
    @JavascriptInterface fun write(fileName: String, text: String): String = try {
        val tree = DocumentFile.fromTreeUri(this@MainActivity, Uri.parse(prefs.getString("backupTree", null)))!!
        val f = tree.findFile(fileName) ?: tree.createFile("application/json", fileName)!!
        contentResolver.openOutputStream(f.uri, "wt")!!.use { it.write(text.toByteArray(Charsets.UTF_8)) }
        "ok"
    } catch (e: Exception) { "error" }
    @JavascriptInterface fun prune(prefix: String, keep: Int) {
        val tree = DocumentFile.fromTreeUri(this@MainActivity, Uri.parse(prefs.getString("backupTree", null) ?: return)) ?: return
        tree.listFiles().filter { it.name?.startsWith(prefix) == true }
            .sortedByDescending { it.name }.drop(keep).forEach { it.delete() }
    }
}
webView.addJavascriptInterface(BackupBridge(), "AndroidBackup")
```

ثم حقن هذا الغلاف بعد تحميل الصفحة (onPageFinished):

```js
window.DaragatNative = window.DaragatNative || {};
DaragatNative.pickBackupFolder = () => new Promise(res => { window.__nbabPicked = n => res(n ? {name:n} : 'cancel'); AndroidBackup.pick(); });
DaragatNative.writeBackupFile  = (n, t) => AndroidBackup.write(n, t);
DaragatNative.pruneBackups     = (p, k) => AndroidBackup.prune(p, k);
```

بدون هذا الجسر يبقى كل شيء يعمل: زر «اختيار مجلد الحفظ» يختفي على الأندرويد ويُستخدم مجلد التنزيلات أو الحفظ الداخلي.

---

# الربط مع تطبيق الأندرويد وتطبيق سطح المكتب (اختياري) — v1.11.2

## تهيئة الجهاز الملحق

أصبح في نسخة الويب زر 🔗 للدخول كجهاز ملحق، وزر داخل «حول التطبيق» يعرض رمز QR من الجهاز الرئيسي. رمز QR يحتوي على بروتوكول الربط وإصدار البروتوكول ورابط الموقع وهوية الجهاز الرئيسي ورمز pairing عشوائي. لا يحتوي على كلمة مرور أو بيانات تفعيل.

تتوفر الواجهة التالية لتطبيق Flutter/Native:

```js
window.DaragatAttachmentBridge.getPairingPayload();
window.DaragatAttachmentBridge.receivePairingPayload(payload);
window.DaragatAttachmentBridge.getPairingState();
window.DaragatAttachmentBridge.getSyncManifest();
window.DaragatAttachmentBridge.resetPairing();
```

ويمكن لتطبيق Native توفير الدوال الاختيارية التالية:

```js
window.DaragatNative = {
  scanAttachmentQr: async function(){ /* أعد نص QR المقروء بالكاميرا */ },
  applyAttachmentPairing: async function(payload){ /* أكمل الربط الأصلي */ }
};
```

المزامنة التلقائية الفعلية عبر Wi‑Fi، والعمل عند انقطاع الإنترنت، وخدمة الخلفية تحتاج إلى تنفيذ Native داخل تطبيق Flutter؛ ملف HTML يجهز QR والجسر فقط ولا يدّعي توفير هذه المزامنة وحده.

---

# الربط مع تطبيق الأندرويد وتطبيق سطح المكتب (اختياري) — v1.10.3

هذا الموقع (`index.html`) يعمل حالياً بشكل كامل داخل أي متصفح، وأيضاً
داخل تطبيقَي الأندرويد وسطح المكتب طالما أنهما يعرضانه بمكوّن ويب
عادي (WebView على أندرويد، أو Electron/WebView2/CEF على سطح المكتب).
**لا حاجة لأي تعديل إضافي لتشغيل الطباعة أو PDF بهذا الشكل** — كل ما
سبق تم اختباره ليعمل من داخل صفحة الويب نفسها بدون أي جسر.

مع ذلك، إن أردت أن يتولى تطبيقك (الأندرويد أو سطح المكتب) الحفظ أو
الطباعة بنفسه (مثلاً لإظهار نافذة "حفظ" الأصلية للنظام، أو لطباعة
حقيقية عبر خدمة الطباعة في أندرويد بدل نافذة طباعة المتصفح)، فبإمكانك
حقن كائن JavaScript باسم **`window.DaragatNative`** قبل تحميل الصفحة
(أو حتى في أي وقت بعده)، وسيكتشفه الكود تلقائياً ويستخدمه بدل الطرق
الاحتياطية في المتصفح — بدون أي تعديل آخر على `index.html`.

هذا الجسر **اختياري بالكامل**: إن لم يوجد `window.DaragatNative`، يعمل
كل شيء كما في متصفح Chrome عادي تماماً (كما كان يعمل من قبل).

## الدوال المتوقعة على `window.DaragatNative`

كلها اختيارية أيضاً — عرّف فقط ما تحتاجه:

### `savePdf(base64, fileName)`
يُستدعى عندما يريد المستخدم حفظ ملف PDF (بعد إنشائه فعلياً كنص متجهي
حقيقي داخل صفحة الويب). المطلوب من تطبيقك: فك ترميز `base64` وكتابته
كملف باسم `fileName` في المكان الذي يختاره المستخدم (أو حسب سياسة
تطبيقك)، ثم إرجاع واحدة من:
- `"ok"` أو `true` أو كائن `{ok:true}` → تم الحفظ بنجاح.
- `"cancel"` أو كائن `{cancelled:true}` → ألغى المستخدم الحفظ (لن تظهر رسالة خطأ).
- أي قيمة أخرى أو استثناء → سيعتبره الموقع فشلاً ويعرض نافذة الحفظ الاحتياطية في المتصفح تلقائياً (لن يفقد المستخدم الملف).

```js
window.DaragatNative = {
  savePdf: async function(base64, fileName){
    try{
      await AndroidBridge.saveFile(fileName, base64); // مثال
      return "ok";
    }catch(e){
      return "error"; // الموقع سيتولى إظهار بديل تلقائياً
    }
  }
};
```

### `printHtml(html, optionsJson)`
يُستدعى عند الضغط على أي زر طباعة في الموقع، ويُمرَّر له كامل HTML
الجاهز للطباعة (بنفس تنسيق وحجم الصفحة المطلوب) بالإضافة إلى معلومات
الصفحة (`optionsJson` نص JSON يحوي `widthMm` و`heightMm` و`landscape`
و`title`). استخدمها لطباعة حقيقية عبر خدمة الطباعة في النظام
(`PrintManager` في أندرويد مثلاً عبر `WebView.createPrintDocumentAdapter`).
أعد `"ok"` أو `"cancel"` بنفس منطق `savePdf` أعلاه. إن لم تُعرّف هذه
الدالة، أو أعادت خطأ، سينتقل الموقع تلقائياً لتجربة `printPdf` ثم
لطباعة المتصفح المباشرة ثم لنافذة PDF بديلة — لن تحدث أي قطيعة صامتة.

### `printPdf(base64, fileName)`
بديل أبسط من `printHtml`: يستقبل ملف PDF حقيقي (وليس HTML) بنفس شكل
`savePdf`، لتمريره مباشرة لخدمة طباعة PDF في نظامك إن كان أسهل من
معالجة HTML. نفس قيم الإرجاع المتوقعة (`ok`/`cancel`/غير ذلك).

## ملاحظات مهمة

- **لا تُخفِ** `window.showSaveFilePicker` أو `navigator.share` في
  WebView الخاص بك — الموقع يتحقق من `DaragatNative` أولاً على أي حال،
  فلا تعارض.
- الموقع لا يرسل أي بيانات لأي خادم أثناء إنشاء PDF أو الطباعة؛ كل
  المعالجة تتم محلياً داخل الصفحة قبل استدعاء الجسر.
- يمكنك تعريف `DaragatNative` كـ object عادي أو عبر
  `Object.defineProperty` أو حتى كجسر `WebViewJavascriptInterface` في
  أندرويد (Java/Kotlin) طالما أن الدوال تُستدعى وتُرجع Promise أو قيمة
  متزامنة.
- لا حاجة لتغيير رقم إصدار تطبيقك بسبب هذا الملف — إنه توثيق فقط لا يُحمَّل من الموقع.
