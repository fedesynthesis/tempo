/* RIFIUTI MAZZANO — promemoria serale (gira dentro il loop di send-reminders.js)
 * Alle 20:30 (ora italiana) manda "Stasera esponi: …" con i rifiuti ritirati DOMANI,
 * in base alla zona (NORD/SUD) salvata da ogni telefono in `tempo_rifiuti_tokens`.
 * Regole = ecocalendario C.B.B.O. Mazzano 2026 (stesse di /rifiuti/index.html).
 * Dedup: tempo_meta/rifiuti.lastSent = data (una notifica al giorno).
 */
const TZ = 'Europe/Rome';
const SEND_HOUR = 20;
const SEND_MIN  = 30;               // 20:30: margine se il cron di GitHub ritarda
const APP_URL = 'https://fedesynthesis.github.io/rifiuti/';
const COL = 'tempo_rifiuti_tokens';

const NAMES = { organico:'Umido', plastica:'Plastica', secco:'Secco', tessili:'Pannolini', vetro:'Vetro e lattine', carta:'Carta', verde:'Verde' };
const utc = (y,m,d)=>Date.UTC(y,m-1,d,12);                 // mezzogiorno UTC: niente sorprese con l'ora legale
const REF_NORD = utc(2026,1,7);                             // mer 7 gen 2026 = secco NORD, poi alterni
const VERDE = [utc(2026,2,3), utc(2026,11,24)];             // ogni martedì
const UMIDO_SAB = [utc(2026,6,6), utc(2026,8,29)];          // umido extra del sabato
const EXC = {
  '2026-01-01':[], '2026-01-02':['organico'], '2026-01-03':['carta','tessili'],
  '2026-12-25':[], '2026-12-26':['carta','tessili'],
  '2027-01-01':[], '2027-01-02':['carta','tessili'],
};
const key = t => new Date(t).toISOString().slice(0,10);
function inVerde(t){ if(t>=VERDE[0]&&t<=VERDE[1]) return true; const d=new Date(t); if(d.getUTCFullYear()<=2026) return false;
  const m=d.getUTCMonth(), g=d.getUTCDate(); return m>=1&&m<=10 && !(m===1&&g<3) && !(m===10&&g>24); }
function seccoZone(t){ const w=Math.round((t-REF_NORD)/6048e5); return w%2===0?'NORD':'SUD'; }
function pickup(t){                                          // t = ms UTC a mezzogiorno del giorno
  const k=key(t); if(EXC[k]) return EXC[k].map(x=>({t:x}));
  const w=new Date(t).getUTCDay(); const out=[];
  if(w===1||w===4) out.push({t:'organico'});
  if(w===2){ out.push({t:'plastica'}); if(inVerde(t)) out.push({t:'verde'}); }
  if(w===3){ out.push({t:'secco',zone:seccoZone(t)},{t:'tessili'},{t:'vetro'}); }
  if(w===5) out.push({t:'carta'});
  if(w===6){ out.push({t:'tessili'}); if(t>=UMIDO_SAB[0]&&t<=UMIDO_SAB[1]) out.push({t:'organico'}); }
  return out;
}
const forZone = (list,z)=>list.filter(x=>!x.zone||x.zone===z);

function romeNow(d=new Date()){
  const f=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const p=Object.fromEntries(f.formatToParts(d).map(x=>[x.type,x.value]));
  return { date:`${p.year}-${p.month}-${p.day}`, hour:Number(p.hour), minute:Number(p.minute) };
}
const dayLabel = t => new Date(t).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});

async function send(db, fcm, tokens, title, body){
  if(!tokens.length) return;
  const res = await fcm.sendEachForMulticast({
    tokens, notification:{ title, body },
    webpush:{ notification:{ title, body, icon:'/rifiuti/icon-192-b.png', badge:'/rifiuti/icon-192-b.png', tag:'rifiuti' }, fcmOptions:{ link:APP_URL } }
  });
  res.responses.forEach((r,i)=>{
    if(r.success) return;
    const c=(r.error&&r.error.code)||'';
    if(c.includes('registration-token-not-registered')||c.includes('invalid-argument')||c.includes('mismatched-credential'))
      db.collection(COL).doc(tokens[i]).delete().catch(()=>{});
  });
  return res;
}

async function run(db, fcm){
  const snap = await db.collection(COL).get();
  if(snap.empty) return;
  const docs = snap.docs.map(d=>({ id:d.id, ref:d.ref, ...d.data() }));

  // Notifiche di prova richieste dall'app (campo testAt) — in qualunque momento
  for(const t of docs){
    if(t.testAt && !(t.testSentAt>=t.testAt)){
      await send(db, fcm, [t.id], '♻️ Rifiuti — prova', 'Le notifiche funzionano. Ti avviso ogni sera alle 20:30 quando c’è da esporre qualcosa.');
      await t.ref.update({ testSentAt: Date.now() }).catch(()=>{});
      console.log('Rifiuti: notifica di prova inviata');
    }
  }

  const rn = romeNow();
  if(rn.hour < SEND_HOUR || (rn.hour === SEND_HOUR && rn.minute < SEND_MIN)) return;
  const metaRef = db.collection('tempo_meta').doc('rifiuti');
  const meta = (await metaRef.get()).data() || {};
  if(meta.lastSent === rn.date) return;

  const [y,m,d] = rn.date.split('-').map(Number);
  const tomorrow = utc(y,m,d) + 864e5;
  const label = dayLabel(tomorrow);
  for(const zone of ['NORD','SUD']){
    const tokens = docs.filter(t=>(t.zone||'NORD')===zone).map(t=>t.id);
    if(!tokens.length) continue;
    const list = forZone(pickup(tomorrow), zone);
    if(!list.length){ console.log('Rifiuti', zone, ': domani nessun ritiro'); continue; }
    const names = list.map(x=>NAMES[x.t]).join(', ');
    await send(db, fcm, tokens, '♻️ Stasera esponi: '+names, 'Ritiro di '+label+'. Fuori dalle 22, entro le 5.');
    console.log('Rifiuti', zone, '→', tokens.length, 'telefoni:', names);
  }
  await metaRef.set({ lastSent: rn.date, at: Date.now() }, { merge:true });
}

module.exports = { run, pickup, forZone, key, utc };
