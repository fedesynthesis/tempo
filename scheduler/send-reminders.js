/* TEMPO — scheduler notifiche (gira su GitHub Actions ogni ~5 min)
 * 1) Alert per ogni task con orario, quando arriva la scadenza.
 * 2) Digest mattutino alle 06:50 (ora italiana): "ecco i task di oggi".
 * Legge da Firestore (collezioni: tasks, pushTokens, meta) e manda push via FCM.
 * La chiave del service account arriva dalla env FIREBASE_SERVICE_ACCOUNT (secret GitHub).
 */
const admin = require('firebase-admin');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('Manca il secret FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const serviceAccount = JSON.parse(raw);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const fcm = admin.messaging();

const TZ = 'Europe/Rome';          // fuso per il digest (gestisce anche l'ora legale)
const DIGEST_HOUR = 6;             // 06:50
const DIGEST_MIN  = 50;
const APP_URL = 'https://fedesynthesis.github.io/tempo/';

function romeNow(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

async function getTokens() {
  const s = await db.collection('tempo_tokens').get();
  return s.docs.map(d => d.id);
}

async function sendToAll(tokens, title, body) {
  if (!tokens.length) return { successCount: 0 };
  const res = await fcm.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { title, body, icon: '/tempo/icon-192.png', badge: '/tempo/icon-192.png' },
      fcmOptions: { link: APP_URL }
    }
  });
  // pulizia token non più validi
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const c = (r.error && r.error.code) || '';
      if (c.includes('registration-token-not-registered') || c.includes('invalid-argument') || c.includes('mismatched-credential')) {
        db.collection('tempo_tokens').doc(tokens[i]).delete().catch(() => {});
      }
    }
  });
  return res;
}

(async () => {
  const now = Date.now();
  const tokens = await getTokens();
  if (!tokens.length) { console.log('Nessun token registrato — niente da fare.'); return; }

  // offset (ms) delle chiavi avviso
  const OFF = { at: 0, '1h': 3600e3, '2h': 7200e3, '1d': 86400e3, '2d': 2 * 86400e3 };
  // avvisi del task (MULTI). Compat col vecchio campo singolo `remind`. Default = ['at'].
  const remindsOf = (t) => {
    if (Array.isArray(t.reminds)) return t.reminds;
    if (t.remind) return t.remind === 'none' ? [] : [t.remind];
    return ['at'];
  };

  // 1) ALERT: per ogni avviso scelto, notifica a dueAt - offset. Traccia quali sono già partiti in `remindedKeys`.
  //    Query fino a 2 giorni avanti (per il "2 giorni prima").
  const dueSnap = await db.collection('tempo_tasks').where('dueAt', '<=', now + 2 * 86400e3).get();
  for (const d of dueSnap.docs) {
    const t = d.data();
    if (t.deleted || t.done || t.dueAt == null) continue;
    const keys = remindsOf(t).filter(k => k !== 'daily' && k !== 'none');
    if (!keys.length) continue;
    let fired = Array.isArray(t.remindedKeys) ? t.remindedKeys.slice() : [];
    // migrazione dal vecchio `remindedAt` (avviso singolo già mandato): segno come già fatti gli offset scaduti allora
    if (!Array.isArray(t.remindedKeys) && t.remindedAt != null) {
      for (const k of keys) if (t.dueAt - (OFF[k] || 0) <= t.remindedAt) fired.push(k);
    }
    let changed = false;
    for (const k of keys) {
      if (fired.includes(k)) continue;
      const fireAt = t.dueAt - (OFF[k] || 0);
      if (fireAt > now) continue;                                  // non è ancora ora
      if (now - fireAt > 6 * 60 * 60 * 1000) { fired.push(k); changed = true; continue; }  // troppo vecchio: segno senza inviare
      await sendToAll(tokens, 'TEMPO — promemoria', t.title || 'Hai un task da fare');
      fired.push(k); changed = true;
      console.log('Alert inviato:', t.title, '(', k, ')');
    }
    if (changed) await d.ref.update({ remindedKeys: fired }).catch(() => {});
  }

  // 1b) PROMEMORIA "ogni giorno": una volta al giorno (dall'ora del digest) finché il giorno del task non è passato.
  {
    const rn = romeNow();
    if (rn.hour > DIGEST_HOUR || (rn.hour === DIGEST_HOUR && rn.minute >= DIGEST_MIN)) {
      const seen = new Set(); const dailyDocs = [];
      const q1 = await db.collection('tempo_tasks').where('reminds', 'array-contains', 'daily').get();
      q1.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); dailyDocs.push(d); } });
      const q2 = await db.collection('tempo_tasks').where('remind', '==', 'daily').get();  // compat vecchio campo
      q2.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); dailyDocs.push(d); } });
      for (const d of dailyDocs) {
        const t = d.data();
        if (t.deleted || t.done) continue;
        if (t.date && t.date < rn.date) continue;   // giorno già passato
        if (t.dailyLast === rn.date) continue;      // già avvisato oggi
        await sendToAll(tokens, 'TEMPO — promemoria', t.title || 'Hai un task da fare');
        await d.ref.update({ dailyLast: rn.date }).catch(() => {});
        console.log('Promemoria giornaliero:', t.title);
      }
    }
  }

  // 2) DIGEST del mattino alle 06:50 (una volta al giorno)
  const { date: today, hour, minute } = romeNow();
  if (hour > DIGEST_HOUR || (hour === DIGEST_HOUR && minute >= DIGEST_MIN)) {
    const metaRef = db.collection('tempo_meta').doc('digest');
    const meta = (await metaRef.get()).data() || {};
    if (meta.lastSent !== today) {
      const snap = await db.collection('tempo_tasks').where('date', '==', today).get();
      const list = snap.docs.map(d => d.data()).filter(t => !t.done && !t.deleted)
        .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      let body;
      if (list.length === 0) body = 'Nessun task in agenda per oggi. Buona giornata!';
      else {
        const names = list.slice(0, 4).map(t => { const w = t.time ? (t.time + (t.timeEnd ? '–' + t.timeEnd : '') + ' ') : (t.timeEnd ? 'entro ' + t.timeEnd + ' ' : ''); return w + t.title; }).join(' · ');
        body = `${list.length} task oggi: ${names}` + (list.length > 4 ? ` +${list.length - 4}` : '');
      }
      await sendToAll(tokens, '☀️ La tua giornata', body);
      await metaRef.set({ lastSent: today, at: now }, { merge: true });
      console.log('Digest inviato per', today, '—', list.length, 'task');
    } else {
      console.log('Digest già inviato oggi.');
    }
  }

  console.log('Fatto.');
})().catch(e => { console.error(e); process.exit(1); });
