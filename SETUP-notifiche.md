# TEMPO — Notifiche push (alert scadenze + digest delle 7:00)

Come funziona: la app scrive i task con data/ora su **Firestore** e registra il **token** del telefono.
Un **cron su GitHub Actions** (ogni ~5 min) controlla e manda le **push** via **Firebase Cloud Messaging (FCM)**.
Il tuo `sw.js` mostra la notifica anche ad app chiusa. Tocchi la notifica → si apre TEMPO su "Oggi".

> ⚠️ **iOS**: le web push funzionano **solo se aggiungi TEMPO alla Home** (iOS 16.4+), e devi dare il permesso *dentro* l'app installata. Il suono è quello di sistema (non una suoneria personalizzata).

---

## Parte A — Cosa fai TU nella console (le chiavi sono tue)

### 1. Progetto Firebase
- Vai su https://console.firebase.google.com → crea un progetto nuovo (o riusa quello della firebase-demo).

### 2. Firestore
- Menu **Build → Firestore Database → Create database**.
- Per iniziare va bene **modalità test** (regole aperte). Scegli region **eur3 (europe-west)**.
- ⚠️ Nota privacy: in modalità test i titoli dei task sono leggibili pubblicamente. Va bene per partire; poi le blindiamo (vedi Parte D).

### 3. App Web + config
- **Impostazioni progetto (⚙️) → Le tue app → Web (</>)** → registra un'app (es. "TEMPO").
- Copia l'oggetto **firebaseConfig** (apiKey, authDomain, projectId, ...). *È pubblico, si può condividere.*

### 4. Chiave Web Push (VAPID)
- **Impostazioni progetto → Cloud Messaging → Web Push certificates → Generate key pair**.
- Copia la **chiave** (stringa lunga che inizia con `B...`). *Anche questa è pubblica.*

### 5. Service account (SEGRETO — solo per GitHub, MAI nel sito)
- **Impostazioni progetto → Account di servizio → Genera nuova chiave privata** → scarica il **JSON**.
- ⚠️ Questo file è **segreto**: non va nel codice del sito, solo nel secret di GitHub (passo 7).

---

## Parte B — Codice (in gran parte già fatto)

- ✅ `firebaseConfig` **già inserito**: riuso il tuo progetto **cicogna-57ae0** (lo stesso di migro/cicogna), con collezioni separate `tempo_tasks` / `tempo_tokens` / `tempo_meta`.
- ⬜ Manca solo la **VAPID key** (passo 4): mandamela in chat e la incollo io, poi ripubblico. *(È pubblica.)*

> Se preferisci un progetto Firebase separato per TEMPO invece di riusare cicogna-57ae0, dimmelo e cambio la config.

---

## Parte C — GitHub (lo scheduler)

Lo **script** dello scheduler è nel repo (`scheduler/`). Manca solo il **workflow** (il cron): va
aggiunto a parte perché caricarlo richiede un permesso extra su GitHub (vedi passo 3).

1. Repo `fedesynthesis/tempo` → **Settings → Secrets and variables → Actions → New repository secret**.
   - **Name:** `FIREBASE_SERVICE_ACCOUNT`
   - **Value:** incolla **tutto** il contenuto del JSON del passo 5 (Parte A).
2. Assicurati che le **Actions** siano abilitate (tab **Actions** del repo).
3. Aggiungi il workflow, in uno dei due modi:
   - **(a) Dammi il permesso e lo pubblico io:** esegui una volta
     `gh auth refresh -h github.com -s workflow` (autorizzi nel browser), poi te lo pusho.
   - **(b) A mano dal web:** repo → **Add file → Create new file** → nome
     `.github/workflows/reminders.yml` → incolla il contenuto che ti ho dato in chat → Commit.
4. Tab **Actions** → **TEMPO — reminder & digest** → **Run workflow** per una prova immediata.

---

## Parte D — Sul telefono + test

1. iPhone (Safari) → apri https://fedesynthesis.github.io/tempo/ → **Condividi → Aggiungi a Home**.
2. Apri TEMPO **dall'icona in Home** → tocca la **🔔 campanella** in alto → concedi il permesso.
3. Crea un task con **oggi + un orario tra 6-7 minuti** → aspetta il cron → deve arrivare la notifica.
4. Il **digest** arriva al primo giro del cron dopo le **07:00** italiane.

---

## Parte E — Sicurezza (da fare dopo che funziona)
La modalità test scade e lascia i dati aperti. Quando funziona, blindiamo con regole Firestore
(es. Anonymous Auth o una regola più stretta). Dimmelo e te le scrivo e spiego.
