const CACHE = "daragat-v1.10.9";
const CORE = ["./", "./index.html", "./admin.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {
  // Fetch fresh copies (bypass the browser HTTP cache) so a new version never installs stale files.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u =>
    fetch(new Request(u, {cache: "reload"})).then(r => { if(r && r.ok) return c.put(u, r); }).catch(() => {})
  ))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("daragat-") && k !== CACHE).map(k => caches.delete(k))))
  ]));
});
// Network first (so updates arrive immediately), cache fallback (so the app still works offline).
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  const req = sameOrigin ? new Request(e.request.url, {cache: "no-cache"}) : e.request;
  e.respondWith(
    fetch(req).then(res => {
      if(res && (res.ok || res.type === "opaque")){
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
