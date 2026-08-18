# TEMPO — Backlog modifiche

Richieste da Federico (18 ago 2026). Stato: ⬜ da fare · 🔧 in corso · ✅ fatto.

## 1. ⬜ Visualizzatore allegati DENTRO l'app
Foto e PDF allegati devono aprirsi **in-app** (non in app esterne).
- Overlay/lightbox: immagini a schermo (con zoom), PDF in `<iframe>`/`<embed>` (Safari li renderizza inline), testo mostrato come testo.
- Fallback "apri/scarica" solo per formati non visualizzabili.
- Sostituisce l'attuale `openAttachment()` (che apre esterno).

## 2. ✅ Puntini calendario colorati per priorità
Nel calendario ogni giorno mostra i puntini colorati per **priorità** dei task (alta=corallo, media=ambra, bassa=blu, nessuna=grigio).

## 3. ⬜ Categorie + sottocategorie (spuntabili, aggiungibili, filtrabili)
- Categorie tipo **Casa**, **Lavoro**, ecc., con **sottocategorie**.
- Poter **aggiungere** nuove categorie/sottocategorie.
- Quando creo un task **spunto la categoria** (e la sottocategoria).
- **Filtrare** i task per categoria/sottocategoria (chip nella vista Task).
- Sostituisce l'attuale campo "Lista" (testo libero) con una struttura gestita (salvata in localStorage; poi anche su Firestore quando c'è la sync).

## 4. ✅ Digest giornaliero alle 06:50
Cambiato l'orario del reminder mattutino da 07:00 a **06:50** (ora italiana). (Attivo quando Firebase è configurato.)

## 5. ⬜ "Chiamare Mike" → numero + tasto Chiama
⚠️ **Vincolo iOS**: una PWA **non può leggere la rubrica** dell'iPhone (l'API Contacts è solo Android). Quindi NON si prende il numero in automatico dalla rubrica di sistema.
Versione fattibile:
- Mini-rubrica **dentro TEMPO** (nome → numero), che compili tu una volta.
- Se il titolo contiene un nome presente in rubrica (o un numero), appare il tasto **"Chiama"** che apre il telefono (`tel:+39…`) → l'iPhone parte con la chiamata.
- (Opzionale) campo "telefono" sul task.

## 6. ⬜ Restyle "taccuino" (esperimento grafico)
Far sembrare la app un **taccuino**: grana tipo foglio, righe orizzontali, riquadri "disegnati a mano".
- Da fare come **preview/esperimento** prima di toccare il design attuale (magari come tema alternativo attivabile).
- Grana carta (texture/SVG), righe, bordi irregolari tipo schizzo, font che accompagna.
