const C="niti-pwa-v3",A=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icon.svg","./icon-192.svg","./icon-512.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("niti-pwa-")&&key!==C).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET"||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).then(response=>{
    if(response.ok){const copy=response.clone();e.waitUntil(caches.open(C).then(cache=>cache.put(e.request,copy)))}
    return response;
  }).catch(()=>caches.match(e.request)));
});
