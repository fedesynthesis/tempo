/* TEMPO service worker — app offline + cache font/animazioni */
const CACHE='tempo-v2';
const CORE=['./','./index.html','./manifest.json','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>{
    // best-effort su risorse esterne (offline anim + font)
    c.add('https://cdn.jsdelivr.net/npm/motion@13.1.0/dist/motion.js').catch(()=>{});
    return c.addAll(CORE);
  }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // navigazione: network-first, fallback alla cache (app offline)
  if(req.mode==='navigate'){
    e.respondWith(
      fetch(req).then(r=>{const cl=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cl));return r})
                .catch(()=>caches.match('./index.html'))
    );
    return;
  }
  // CDN font/motion: cache-first con aggiornamento in background
  if(url.hostname==='cdn.jsdelivr.net'||url.hostname.indexOf('fonts.g')!==-1){
    e.respondWith(
      caches.match(req).then(c=>c||fetch(req).then(r=>{const cl=r.clone();caches.open(CACHE).then(ca=>ca.put(req,cl));return r}).catch(()=>c))
    );
    return;
  }
  // stesso dominio: cache-first
  if(url.origin===location.origin){
    e.respondWith(caches.match(req).then(c=>c||fetch(req)));
  }
});
