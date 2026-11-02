# Guida: pubblicare Quotidie su GitHub

Tempo richiesto: circa 15 minuti. Serve solo un browser; il terminale è facoltativo.

Alla fine avrai:
- l'app online su `https://TUO-UTENTE.github.io/quotidie/`;
- un'automazione (GitHub Actions) che ogni mattina chiede a Gemini notizie e lezione e le salva nel repository;
- l'app installata sulla Home dell'iPhone.

```
06:30-07:30  GitHub Actions → legge il secret GEMINI_API_KEY → chiama Gemini → salva data/*.json
quando vuoi  iPhone/PC → apre la pagina GitHub Pages → legge data/*.json
```

---

## 1. Crea l'account e il repository

1. Se non ce l'hai, crea un account su https://github.com.
2. In alto a destra premi **+** e poi **New repository**.
3. Compila così:
   - **Repository name**: `quotidie`.
   - **Public**: necessario per usare GitHub Pages gratis. Il codice è pubblico, ma la chiave Gemini no: sta nei Secrets.
   - Non spuntare "Add a README".
4. Premi **Create repository**.

## 2. Carica i file

Nella cartella `quotidie/` del pacchetto ci sono: `index.html`, `style.css`, `app.js`, `README.md` e la cartella nascosta `.github/workflows/daily.yml`.

### Opzione A: dal browser

1. Nella pagina del repo appena creato premi **uploading an existing file**.
2. Trascina `index.html`, `style.css`, `app.js` e `README.md`, poi premi **Commit changes**.
3. Il workflow va creato a mano, perché il browser spesso non carica le cartelle che iniziano con il punto:
   - premi **Add file → Create new file**;
   - nel nome del file scrivi esattamente `.github/workflows/daily.yml`; gli slash creano le cartelle da soli;
   - apri `quotidie/.github/workflows/daily.yml` dal pacchetto con il Blocco note, copia **tutto** il contenuto e incollalo;
   - premi **Commit changes**.

> Su Windows le cartelle con il punto possono essere nascoste: in Esplora file attiva *Visualizza → Mostra → Elementi nascosti*.

### Opzione B: da terminale (se hai git)

```bash
cd percorso/del/pacchetto/quotidie
git init -b main
git add .
git commit -m "Prima versione di Quotidie"
git remote add origin https://github.com/TUO-UTENTE/quotidie.git
git push -u origin main
```

## 3. Crea la API key di Gemini

1. Vai su https://aistudio.google.com/apikey ed entra con il tuo account Google.
2. Premi **Create API key** e copiala.

> Non incollarla mai nei file del progetto: il repository è pubblico.

## 4. Salva la chiave nei Secrets di GitHub

1. Nel repo apri **Settings**: è la tab in alto, l'ultima a destra.
2. Nel menu a sinistra apri **Secrets and variables → Actions**.
3. Premi **New repository secret** e compila:
   - **Name**: `GEMINI_API_KEY`, esattamente così, in maiuscolo;
   - **Secret**: incolla la chiave.
4. Premi **Add secret**.

**Facoltativo: scegliere il modello.** Sempre in questa pagina apri la tab **Variables** e premi **New repository variable**, con nome `GEMINI_MODEL` e come valore per esempio `gemini-3.8-flash`. Se non la crei si usa `gemini-3.8-flash`. Ti serve solo se Google cambia i nomi dei modelli. L'elenco aggiornato è su https://ai.google.dev/gemini-api/docs/models.

## 5. Permetti alle Actions di salvare i contenuti

1. **Settings → Actions → General**.
2. In fondo, sotto **Workflow permissions**, seleziona **Read and write permissions**.
3. Premi **Save**.

Senza questo passaggio il workflow genera i contenuti ma non riesce a salvarli (errore 403).

## 6. Attiva GitHub Pages

1. **Settings → Pages**.
2. In **Build and deployment** compila:
   - **Source**: Deploy from a branch;
   - **Branch**: `main`, cartella `/ (root)`.
3. Premi **Save**.

Dopo 1-2 minuti in cima alla pagina compare l'indirizzo, per esempio `https://TUO-UTENTE.github.io/quotidie/`. Se lo apri adesso vedrai "Nessuna edizione ancora": è normale.

## 7. Genera la prima edizione

1. Apri la tab **Actions** del repo. Se GitHub chiede di abilitare i workflow, conferma.
2. A sinistra scegli **Edizione del mattino**.
3. A destra premi **Run workflow**, lascia "tutto" e premi il pulsante verde **Run workflow**.
4. Dopo qualche secondo compare un'esecuzione: cliccaci sopra per seguirla. Dura 1-3 minuti.

**Come leggere il risultato:**
- ✅ **Verde**: notizie e lezione sono state salvate nella cartella `data/` del repo. Pages si aggiorna da solo in 1-2 minuti: riapri l'app.
- ❌ **Rosso**: apri lo step **Genera notizie e lezione** e leggi il messaggio, poi guarda la tabella più sotto.

Da qui in poi parte da solo **ogni mattina tra le 6:30 e le 7:30**: GitHub a volte ritarda di qualche decina di minuti, ma tutto è pronto prima delle 9.

### Le opzioni di "Run workflow"

| Opzione | A cosa serve |
|---|---|
| Cosa generare: `tutto` | Notizie e lezione |
| Cosa generare: `news` | Solo il giornale, per esempio per aggiornarlo nel pomeriggio |
| Cosa generare: `lesson` | Solo la lezione |
| Rigenera la lezione | Sostituisce la lezione di oggi con una nuova, su un altro argomento |

## 8. Installa l'app

**iPhone**
1. Apri l'indirizzo di Pages in **Safari**: da Chrome non si può installare.
2. Premi **Condividi** (il quadrato con la freccia) e poi **Aggiungi alla schermata Home**.
3. Comparirà l'icona di Quotidie: si apre a schermo intero, come un'app.

**PC**: apri l'indirizzo nel browser e aggiungilo ai preferiti. Con Chrome o Edge puoi anche usare *Installa app* dal menu.

> Letture, preferiti e streak sono salvati **sul singolo dispositivo**. Per portarli da un dispositivo all'altro usa *Impostazioni → Esporta / Importa*.

## 9. Cambiare le categorie delle lezioni (facoltativo)

**Dall'app**
1. Crea un token: https://github.com/settings/personal-access-tokens/new e compila così:
   - **Token name**: Quotidie;
   - **Expiration**: quella che preferisci;
   - **Repository access**: Only select repositories → `quotidie`;
   - **Permissions → Repository permissions → Contents**: Read and write.
2. Premi **Generate token** e copialo.
3. Nell'app apri **Impostazioni** (l'ingranaggio), attiva o disattiva le categorie o aggiungine di nuove, compila *Utente, Repository e Token* e premi **Salva le categorie su GitHub**.

**Da GitHub**: dopo la prima edizione apri `data/topics.json` nel repo, premi la matita e metti `"enabled": false` sulle categorie che non vuoi.

Le modifiche valgono dalla lezione successiva.

## 10. Risoluzione problemi

| Problema | Soluzione |
|---|---|
| `Manca il secret GEMINI_API_KEY` | Ripeti il passo 4: il nome deve essere esatto |
| `Modello "..." non trovato` | Crea o aggiorna la variabile `GEMINI_MODEL` (passo 4) con un modello Flash dall'elenco ufficiale |
| `Gemini 400 / API key not valid` | Chiave sbagliata o revocata: creane una nuova e aggiorna il secret (*Update*) |
| `Gemini 429` | Limite di richieste raggiunto: riprova più tardi. Una volta al giorno sta ampiamente nel piano gratuito |
| `403` nello step "Salva i contenuti" | Ripeti il passo 5 (Read and write permissions) |
| L'app mostra "Edizione di ieri" | La generazione di oggi non è ancora partita o è fallita: controlla la tab Actions |
| La pagina non si aggiorna | Pages impiega 1-2 minuti dopo il workflow. Su iPhone chiudi l'app dal multitasking e riaprila |
| Il workflow non parte più da solo | GitHub sospende i workflow programmati dopo 60 giorni senza attività nel repo. Riattivalo da Actions: la generazione quotidiana produce commit, quindi di solito non succede |

## Costi

- **GitHub** (repo pubblico, Actions, Pages): gratis.
- **Gemini**: ogni mattina servono circa 5 richieste più qualche ricerca Google. Google include 5.000 ricerche gratuite al mese, quindi i costi sono nulli o di pochi centesimi al mese. Limiti e prezzi cambiano nel tempo: controlli aggiornati su https://ai.google.dev/gemini-api/docs/pricing.
