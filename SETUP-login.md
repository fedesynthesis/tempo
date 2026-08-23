# TEMPO — Login (email + password)

Obiettivo: rendere i task **privati nel cloud** (solo il tuo account li legge) e sostituire
le regole Firestore in "modalità test" (che scadono) con regole permanenti legate all'utente.

L'ordine dei passi è importante per **non chiudersi fuori** e **non perdere task**.

## 1) (Federico) Abilita Email/Password — PRIMA del deploy
Console Firebase → progetto **tempo-1580f** → **Authentication** → **Sign-in method**
→ **Email/Password** → **Abilita** → Salva.
(Basta "Email/Password"; NON serve il link via email.)
Poi scrivi a Claude: "provider abilitato".

## 2) (Claude) Deploy
Claude pubblica la nuova `index.html` (con schermata di login) e alza `CACHE_NAME` del service worker.
Le regole Firestore restano **aperte** in questa fase (serve per la migrazione dei task esistenti).

## 3) (Federico) Crea account e accedi — su OGNI dispositivo
- Sul dispositivo che mostra **tutti** i task: apri l'app → **Registrati** con la tua email + una password (min 6) → entri.
  I task esistenti vengono automaticamente "marchiati" col tuo account.
- Sull'altro dispositivo (Safari e/o app installata): apri l'app → **Accedi** con lo stesso account.
- Controlla che **tutti i task ci siano** su entrambi.

## 4) (Federico) Applica le regole definitive — SOLO dopo il punto 3
Console Firebase → **Firestore Database** → scheda **Regole** → incolla il contenuto di
`firestore.rules` (in questa cartella) → **Pubblica**.
⚠️ Non farlo prima del punto 3: le regole definitive impediscono di "marchiare" i task
vecchi non ancora associati al tuo account.

## Fatto
- I task sono privati: ogni account vede solo i propri.
- Le notifiche continuano a funzionare (lo scheduler gira con privilegi admin e bypassa le regole).
- Login persistente: resti dentro anche offline; c'è il tasto **esci** in alto a destra.

## Note
- La registrazione è aperta (chiunque apra il link può crearsi un account): non è un problema
  per la privacy, perché ognuno vede solo i **propri** task. Se in futuro vuoi limitare gli
  account ammessi, si può fare con una regola sugli indirizzi email.
- Le **Scritte stampi** restano locali (non sincronizzate).
