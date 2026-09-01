/* TEMPO service worker — app offline + cache font/animazioni + notifiche push */
const CACHE='tempo-v38';
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
  if(url.pathname.startsWith('/hub/')) return;   // barra Hub: sempre dalla rete, cosi si aggiorna
  const accept=req.headers.get('accept')||'';
  // Documenti HTML (navigazioni comprese): SEMPRE network-first, fallback cache.
  const isDoc = req.mode==='navigate' || req.destination==='document' || accept.includes('text/html');
  if(url.origin===location.origin && isDoc){
    e.respondWith(
      fetch(new Request(req.url,{cache:'no-store',credentials:'same-origin'}))   // salta la cache HTTP di GitHub
        .then(r=>{const cl=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cl));return r})
        .catch(()=>caches.match('./index.html').then(c=>c||caches.match(req)))
    );
    return;
  }
  if(url.hostname==='cdn.jsdelivr.net'||url.hostname.indexOf('fonts.g')!==-1){
    e.respondWith(
      caches.match(req).then(c=>c||fetch(req).then(r=>{const cl=r.clone();caches.open(CACHE).then(ca=>ca.put(req,cl));return r}).catch(()=>c))
    );
    return;
  }
  if(url.origin===location.origin){
    e.respondWith(caches.match(req).then(c=>c||fetch(req)));
  }
});

/* ---- Notifiche push (FCM manda un webpush; qui la mostro) ---- */
self.addEventListener('push',e=>{
  let d={};
  try{ d = e.data ? e.data.json() : {}; }catch(_){ try{ d={notification:{body:e.data.text()}}; }catch(__){ d={}; } }
  const n = d.notification || (d.data||{});
  const title = n.title || 'TEMPO — in scadenza';
  const body  = n.body  || 'Hai un task in scadenza';
  const opts = {
    body,
    icon:'./icon-192.png',
    badge:'./icon-192.png',
    tag: n.tag || undefined,
    data: { link: (d.fcmOptions&&d.fcmOptions.link) || (n.click_action) || './' },
    vibrate:[80,40,80]
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || './';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){ if('focus' in w) return w.focus(); }
    if(clients.openWindow) return clients.openWindow(link);
  }));
});
