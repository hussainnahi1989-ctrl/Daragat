/* Daragat service worker — يعمل من النسخة المحفوظة على الجهاز، ولا ينزّل إلا عند وجود تحديث فعلي.
   عند كل تشغيل يُرسل طلب صغير جداً (HEAD بدون محتوى) لمعرفة هل تغيّر index.html على الموقع؛
   إذا تغيّر تُنزَّل النسخة الجديدة في الخلفية وتظهر رسالة «تحديث جاهز». لا يُمس التفعيل (Firebase) إطلاقاً. */
const CACHE = "daragat-v1.13.0";
const META = "daragat-meta";
const CORE = ["./", "./index.html", "./admin.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const STATIC_EXT = /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|ico|webp|json)(\?|$)/i;
const STATIC_HOSTS = /(^|\.)(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com|unpkg\.com)$/i;

function verOf(res){
  if(!res) return "";
  return res.headers.get("etag") || res.headers.get("last-modified") || res.headers.get("content-length") || "";
}
async function getMeta(key){ const c = await caches.open(META); const r = await c.match("/__meta/" + key); return r ? r.text() : ""; }
async function setMeta(key, val){ const c = await caches.open(META); await c.put("/__meta/" + key, new Response(String(val || ""))); }

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // نقل النسخ المحفوظة سابقاً (حتى لا يحتاج الجهاز لتنزيل كامل بعد هذا التحديث إن لم يتغير شيء)
    const old = (await caches.keys()).filter(k => k.startsWith("daragat-v") && k !== CACHE);
    for(const k of old){
      const oc = await caches.open(k);
      for(const req of await oc.keys()){ if(!(await c.match(req))){ const r = await oc.match(req); if(r) await c.put(req, r); } }
    }
    await Promise.all(CORE.map(async u => {
      try{ const r = await fetch(new Request(u, {cache: "reload"})); if(r && r.ok){ await c.put(u, r.clone()); if(u === "./index.html") await setMeta("index", verOf(r)); } }catch(err){}
    }));
  })());
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.open(CACHE).then(c => c.match("./index.html")).then(ok => ok ?
      caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("daragat-v") && k !== CACHE).map(k => caches.delete(k)))) : null)
  ]));
});

let checking = null;
async function checkForUpdate(){
  if(checking) return checking;
  checking = (async () => {
    try{
      const head = await fetch(new Request("./index.html", {method: "HEAD", cache: "no-store"}));
      if(!head || !head.ok) return false;
      const now = verOf(head), saved = await getMeta("index");
      if(now && saved && now === saved) return false;          // لا يوجد تحديث: لا تنزيل
      const full = await fetch(new Request("./index.html", {cache: "no-store"}));
      if(!full || !full.ok) return false;
      const c = await caches.open(CACHE);
      await c.put("./index.html", full.clone());
      await c.put("./", full.clone());
      await setMeta("index", verOf(full) || now);
      // باقي ملفات الموقع الصغيرة
      await Promise.all(["./manifest.json", "./icon-192.png", "./icon-512.png"].map(async u => {
        try{ const r = await fetch(new Request(u, {cache: "no-store"})); if(r && r.ok) await c.put(u, r); }catch(err){}
      }));
      if(saved){ // كان عند الجهاز نسخة سابقة → أخبر الصفحة أن التحديث جاهز
        const list = await self.clients.matchAll({type: "window"});
        list.forEach(cl => cl.postMessage({type: "nb-update-ready"}));
      }
      return true;
    }catch(err){ return false; }
    finally{ setTimeout(() => { checking = null; }, 5000); }
  })();
  return checking;
}

self.addEventListener("message", e => { if(e.data && e.data.type === "nb-check-update") e.waitUntil(checkForUpdate()); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  if(req.url.indexOf("/lanpair/") !== -1) return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if(sameOrigin && /version\.json$/.test(url.pathname)) return;              // فحص تحديث التطبيق: من الشبكة دائماً
  if(sameOrigin && /admin\.html$/.test(url.pathname)) return;                // لوحة التفعيل: من الشبكة دائماً
  if(!sameOrigin && !(STATIC_HOSTS.test(url.hostname) && (STATIC_EXT.test(url.pathname) || /fonts\.googleapis\.com$/i.test(url.hostname)))) return; // Firebase/التفعيل وغيرها: مباشرة للشبكة
  const isPage = sameOrigin && /\/(index\.html)?$/.test(url.pathname);
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(isPage ? "./index.html" : req) || (isPage ? await c.match("./") : null);
    if(hit){
      if(isPage) e.waitUntil(checkForUpdate());                              // فحص صغير في الخلفية فقط
      return hit;
    }
    try{
      const res = await fetch(sameOrigin ? new Request(req.url, {cache: "no-cache"}) : req);
      if(res && (res.ok || res.type === "opaque")){
        await c.put(isPage ? "./index.html" : req, res.clone());
        if(isPage) await setMeta("index", verOf(res));
      }
      return res;
    }catch(err){
      const any = await caches.match(req) || (isPage ? await caches.match("./index.html") : null);
      return any || Response.error();
    }
  })());
});
