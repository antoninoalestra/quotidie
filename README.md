# Quotidie

Il tuo giornale del mattino e una lezione al giorno, in 5 minuti ciascuno.

- **Giornale**: Tecnologia e AI, Finanza e mercati, Italia, Mondo. Notizie reali del giorno con link alle fonti.
- **Impara**: una lezione al giorno su un argomento sempre nuovo, da oltre 30 categorie configurabili. Nella stessa sezione trovi lo **Storico**, con ricerca, filtri, letto/da leggere, preferiti e streak.

## Struttura

```
index.html                    ┐
style.css                     ├ l'app (logo, icona iOS e manifest sono già dentro)
app.js                        ┘
.github/workflows/daily.yml   ← ogni mattina chiede i contenuti a Gemini
data/                         ← creata e aggiornata in automatico dal workflow
```

La chiave Gemini sta nei **Secrets** di GitHub: solo il workflow la legge, l'app pubblica non la vede mai.
Letture, preferiti, streak e tema sono salvati sul dispositivo (localStorage).

## Installazione

Segui `GUIDA-GITHUB.md`, oppure dai `PROMPT-PER-AI.md` a un assistente AI con accesso al terminale.

In breve:
1. repo pubblico con questi file;
2. secret `GEMINI_API_KEY`;
3. permessi di scrittura per le Actions;
4. Pages dal branch `main`;
5. Run workflow;
6. Safari → Aggiungi alla schermata Home.

## Personalizzazione

| Cosa | Dove |
|---|---|
| Modello Gemini | Variabile di repository `GEMINI_MODEL` (default `gemini-3.8-flash`) |
| Orario | `cron` in `daily.yml` (in UTC) |
| Categorie delle lezioni | App → Impostazioni, oppure `data/topics.json` |
| Sezioni e numero di notizie | `NEWS_DESKS` in `daily.yml` |
| Lunghezza dei testi | `LIMITS` in `daily.yml` |
