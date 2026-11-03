## Parte B — Come funziona Quotidie

Quotidie è il tuo giornale del mattino più una lezione al giorno. È un'app web pubblicata con GitHub Pages; i contenuti li scrive Gemini ogni mattina.

### Cosa trovi nell'app
- **Giornale (circa 10 minuti)**:
  - 13 notizie in 4 sezioni: Tecnologia e AI, Finanza e mercati, Italia, Mondo;
  - ogni notizia si apre con un tocco e mostra il testo completo, il "perché conta" e le fonti;
  - in alto una barra salta da una sezione all'altra;
  - puoi sfogliare le edizioni degli ultimi 8 giorni.
- **La domenica**: il giornale diventa il riepilogo della settimana, e la lezione spiega un concetto nascosto dietro una notizia della settimana ("Dall'attualità").
- **Impara (circa 5 minuti)**:
  - una lezione al giorno, su un argomento sempre nuovo;
  - ogni 2-3 settimane arriva un **percorso** di 3-5 lezioni collegate;
  - nello **Storico** trovi tutte le lezioni, con ricerca, filtri (da leggere, preferiti, percorsi) e i giorni di fila in cui hai letto.
- **Ascolta**: il giornale e la lezione parlati con la voce neurale naturale di Diego (file MP3 generati ogni mattina). Funziona anche a schermo bloccato su iPhone, con le cuffie e con la levetta del silenzioso attiva. Per le singole notizie è disponibile la lettura istantanea.
- **Offline**: l'ultima edizione si apre anche senza connessione.
- **Aggiorna l'edizione**: dalle Impostazioni, o dall'avviso "edizione di ieri", puoi creare l'edizione subito. Una finestra mostra le fasi in tempo reale.

### Come arrivano i contenuti ogni mattina
Nel repository c'è il file `.github/workflows/daily.yml`. È un lavoro programmato di GitHub Actions che:
1. parte da solo **due volte ogni mattina**: alle 5:45 e alle 7:15 in inverno, alle 6:45 e alle 8:15 in estate. Il secondo avvio è una riserva: se il primo è andato bene non fa nulla;
2. legge la chiave di Gemini dai Secrets del repository;
3. chiede a Gemini, con la ricerca Google, le notizie del giorno, e scarta quelle senza una fonte verificata;
4. scrive la lezione del giorno;
5. salva tutto nella cartella `data/` del repository. GitHub Pages pubblica il sito aggiornato in 1-2 minuti.

GitHub può ritardare gli avvii programmati di 30-60 minuti: per questo si parte presto.

**Perché un giorno la programmazione non è partita.** GitHub esegue il lavoro solo se il file si trova **esattamente** in `.github/workflows/daily.yml`. Con un nome diverso (per esempio `daily.yml.txt`) o in un'altra cartella GitHub lo ignora: niente avvio automatico e niente pulsante "Run workflow". Per controllare, apri il repository su GitHub, tab **Actions**: a sinistra deve comparire **Edizione del mattino**.

**Avvio manuale da GitHub:** tab Actions → Edizione del mattino → Run workflow. Hai queste opzioni:
- cosa generare (tutto, solo giornale, solo lezione);
- sostituire la lezione di oggi;
- iniziare un nuovo percorso.

### Il token dell'app (per il pulsante "Aggiorna l'edizione")
È facoltativo e serve per due cose: avviare l'edizione dal telefono e salvare le categorie delle lezioni scelte nelle Impostazioni.
1. Nell'app apri Impostazioni → "Come ottenere il token", oppure premi "Aggiorna l'edizione": si apre la pagina di GitHub con nome e permessi già compilati (Contents e Actions, lettura e scrittura).
2. In *Repository access* scegli *Only select repositories* e seleziona solo il repository di Quotidie.
3. Premi *Generate token*, copia il token e incollalo nell'app.

Il token resta solo sul telefono e può agire solo su quel repository. La chiave di Gemini invece resta nei Secrets di GitHub: l'app non la vede mai.

### Personalizzare
| Cosa | Come |
|---|---|
| Categorie delle lezioni | App → Impostazioni → Argomenti, poi "Salva le categorie" (serve il token) |
| Modello di Gemini | Repository → Settings → Secrets and variables → Actions → Variables → `GEMINI_MODEL`. Se il modello indicato non esiste più, il workflow sceglie da solo il Flash più recente |
| Tema e dimensione del testo | App → Impostazioni → Aspetto |

### Problemi e soluzioni
| Cosa vedi | Soluzione |
|---|---|
| L'app mostra "edizione di ieri" dopo le 9 | Premi "Aggiorna adesso" nell'avviso, oppure su GitHub: Actions → Edizione del mattino → Run workflow |
| Su GitHub non c'è "Edizione del mattino" o manca "Run workflow" | Il file non è in `.github/workflows/daily.yml`, o ha ancora `.txt`: rinominalo dal browser (apri il file, matita, cambia il nome) |
| Il workflow risulta disattivato | Actions → Edizione del mattino → Enable workflow. GitHub disattiva i lavori programmati dopo 60 giorni senza modifiche al repository, ma i salvataggi quotidiani lo evitano |
| `Manca il secret GEMINI_API_KEY` | Settings → Secrets and variables → Actions → New repository secret, nome `GEMINI_API_KEY` |
| `La API key di Gemini non è valida` | Crea una nuova chiave su https://aistudio.google.com/apikey e aggiorna il secret |
| `Gemini 429` | Limite di richieste raggiunto: riprova più tardi |
| Errore 403 nello step "Salva i contenuti" | Settings → Actions → General → Workflow permissions → Read and write permissions |
| Nell'app: "Il token non è valido" o "non ha il permesso" | Crea un nuovo token con il link nell'app, selezionando il repository di Quotidie |
| L'app non mostra l'ultima versione | Chiudila dal multitasking e riaprila: si aggiorna da sola |

### Costi
- **GitHub** (repository pubblico, Actions, Pages): gratis.
- **Gemini**: una generazione al giorno (circa 6-8 richieste più alcune ricerche Google) rientra nel piano gratuito o costa pochi centesimi al mese.
