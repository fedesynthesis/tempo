/* TEMPO service worker — app offline + cache font/animazioni */
const CACHE='tempo-v3';
const CORE=['./','./index.html','./manifest.json','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>{
    c.add('https://cdn.jsdelivr.net/npm/motion@13.1.0/dist/motion.js').catch(()=>{}); // best-effort
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
  const accept=req.headers.get('accept')||'';
  // Documenti HTML (navigazioni comprese): SEMPRE network-first, fallback cache.
  // Così un nuovo index.html (o un link con #import=) arriva subito quando c'è rete.
  const isDoc = req.mode==='navigate' || req.destination==='document' || accept.includes('text/html');
  if(url.origin===location.origin && isDoc){
    e.respondWith(
      fetch(req).then(r=>{const cl=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cl));return r})
                .catch(()=>caches.match('./index.html').then(c=>c||caches.match(req)))
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
  // altri asset stesso dominio (icone, manifest): cache-first
  if(url.origin===location.origin){
    e.respondWith(caches.match(req).then(c=>c||fetch(req)));
  }
});
