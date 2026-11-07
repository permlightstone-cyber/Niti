const C="niti-beta-2026-11-07-v1";
const A=["./","./index.html","./memory.css?v=1","./memory-app.mjs?v=1","./memory-core.mjs","./memory-store.mjs","./memory-timeline.mjs","./memory-timeline-ui.mjs","./memory-bahce-bridge.mjs","./manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(C).then(cache=>cache.addAll(A)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("niti-beta-")&&key!==C).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 if(new URL(event.request.url).origin!==self.location.origin)return;
 if(!new URL(event.request.url).pathname.includes("/beta/"))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(C).then(cache=>cache.put(event.request,copy)))}
  return response;
 }).catch(()=>caches.match(event.request)));
});
