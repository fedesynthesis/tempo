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

  // 1) ALERT per task con orario scaduto e non ancora avvisato
  const dueSnap = await db.collection('tempo_tasks').where('dueAt', '<=', now).get();
  for (const d of dueSnap.docs) {
    const t = d.data();
    if (t.done || t.dueAt == null || t.remindedAt != null) continue;
    if (now - t.dueAt > 6 * 60 * 60 * 1000) { await d.ref.update({ remindedAt: now }).catch(() => {}); continue; } // troppo vecchio, non avviso
    await sendToAll(tokens, 'TEMPO — in scadenza', t.title || 'Hai un task in scadenza');
    await d.ref.update({ remindedAt: now }).catch(() => {});
    console.log('Alert inviato:', t.title);
  }

  // 2) DIGEST del mattino alle 06:50 (una volta al giorno)
  const { date: today, hour, minute } = romeNow();
  if (hour > DIGEST_HOUR || (hour === DIGEST_HOUR && minute >= DIGEST_MIN)) {
    const metaRef = db.collection('tempo_meta').doc('digest');
    const meta = (await metaRef.get()).data() || {};
    if (meta.lastSent !== today) {
      const snap = await db.collection('tempo_tasks').where('date', '==', today).get();
      const list = snap.docs.map(d => d.data()).filter(t => !t.done)
        .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      let body;
      if (list.length === 0) body = 'Nessun task in agenda per oggi. Buona giornata!';
      else {
        const names = list.slice(0, 4).map(t => (t.time ? t.time + ' ' : '') + t.title).join(' · ');
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
