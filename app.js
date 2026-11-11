/* =========================================================
   Quotidie — logica dell'app
   Dati: file JSON generati ogni mattina da GitHub Actions (data/).
   Stato personale (letture, preferiti, streak, preferenze): localStorage.
   ========================================================= */
(() => {
  'use strict';

  const TZ = 'Europe/Rome';
  const WPM = 200; // parole al minuto, lettura in italiano
  const WORKFLOW = 'daily.yml';
  const KEYS = {
    state: 'qd.state',
    prefs: 'qd.prefs',
    cache: 'qd.cache',
    topicsDraft: 'qd.topicsDraft',
    github: 'qd.github',
    run: 'qd.run',
  };

  // Categorie iniziali delle lezioni: il workflow usa le stesse se data/topics.json non esiste ancora
  const DEFAULT_TOPICS = [
    'Intelligenza artificiale', 'Informatica', 'Architettura software', 'Cybersecurity', 'Finanza personale',
    'Mercati finanziari', 'Macroeconomia', 'Economia comportamentale', 'Storia', "Storia dell'arte", 'Filosofia',
    'Psicologia', 'Neuroscienze', 'Fisica', 'Astronomia', 'Biologia', 'Medicina e salute', 'Chimica', 'Matematica',
    'Geopolitica', 'Linguistica ed etimologia', 'Letteratura', 'Musica', 'Design', 'Architettura', 'Cinema',
    'Gastronomia e vino', 'Produttività e metodo', 'Negoziazione e comunicazione', 'Retorica e pensiero critico',
    'Grandi invenzioni', 'Ecologia e clima', 'Diritto per tutti', 'Mitologia',
  ];
  const slug = (name) => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const $ = (id) => document.getElementById(id);
  const $view = $('view');
  const $topbar = $('topbar');
  const $progress = $('progress-bar');
  const $toast = $('toast');

  /* ---------- Utilità ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Testo generato → HTML sicuro: escape, poi solo **grassetto** e *corsivo*
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  const plain = (s) => String(s ?? '').replace(/\*\*?(.+?)\*\*?/g, '$1');

  const paragraphs = (s) => String(s ?? '')
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inline(p)}</p>`)
    .join('');

  const safeUrl = (u) => {
    try {
      const url = new URL(u);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  const load = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
  };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota piena: ignora */ }
  };

  // Data "di calendario" a Roma, formato YYYY-MM-DD
  const isoDay = (d = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const romeHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));

  const fromIso = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  };
  const addDays = (iso, n) => {
    const d = fromIso(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const isIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

  const fmt = (iso, opts) => new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', ...opts }).format(fromIso(iso));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = (iso) => cap(fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  // "dal 2 all'8 novembre" oppure "dal 28 ottobre al 3 novembre"
  const rangeText = (from, to) => {
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    const a = fmt(from, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' });
    const b = fmt(to, { day: 'numeric', month: 'long' });
    return `dal ${a} ${/^(8|11)\b/.test(b) ? "all'" : 'al '}${b}`;
  };

  const words = (s) => (String(s ?? '').match(/\S+/g) || []).length;
  const minutes = (n) => Math.max(1, Math.round(n / WPM));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let toastTimer;
  const toast = (msg) => {
    $toast.textContent = msg;
    $toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('is-on'), 2800);
  };

  const icon = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z"/></svg>',
    starSolid: '<svg class="star" viewBox="0 0 24 24" aria-label="Preferito"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    listen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
    chevron: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    logo: '<svg aria-hidden="true"><use href="#logo-mark"/></svg>',
  };

  /* ---------- Stato personale ---------- */
  const state = Object.assign({ read: {}, favs: {}, readDays: [], newsRead: {} }, load(KEYS.state, {}));
  const prefs = Object.assign({ theme: 'auto', textScale: 1 }, load(KEYS.prefs, {}));
  const persist = () => save(KEYS.state, state);

  const markRead = (date, read = true) => {
    if (read) {
      if (!state.read[date]) state.read[date] = Date.now();
      const today = isoDay();
      if (!state.readDays.includes(today)) state.readDays.push(today);
    } else {
      delete state.read[date];
    }
    persist();
  };
  const toggleFav = (date) => {
    if (state.favs[date]) delete state.favs[date]; else state.favs[date] = true;
    persist();
    return !!state.favs[date];
  };

  // Notizie lette: si tengono solo le edizioni ancora in archivio
  const storyKey = (date, story) => `${date}:${slug(story.title).slice(0, 60)}`;
  const markStoryRead = (key) => {
    if (state.newsRead[key]) return;
    state.newsRead[key] = 1;
    const cutoff = addDays(isoDay(), -10);
    for (const k of Object.keys(state.newsRead)) if (k.slice(0, 10) < cutoff) delete state.newsRead[k];
    persist();
  };

  // Giorni consecutivi con almeno una lezione letta (oggi o ieri compresi)
  const streak = () => {
    const days = new Set(state.readDays);
    let d = isoDay();
    if (!days.has(d)) d = addDays(d, -1);
    let n = 0;
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  };

  /* ---------- Dati ---------- */
  const cache = load(KEYS.cache, {});
  const memo = {};

  async function getJSON(path) {
    if (memo[path]) return memo[path];
    try {
      // Il parametro evita la cache di GitHub Pages/Safari; il service worker lo ignora
      const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      const data = await res.json();
      memo[path] = data;
      cache[path] = data;
      // In cache solo indici, ultime notizie e ultime lezioni, per restare leggeri
      const keys = Object.keys(cache);
      const dated = (k) => /\/\d{4}-\d{2}-\d{2}\.json$/.test(k);
      const keep = keys.filter((k) => !dated(k)).concat(keys.filter(dated).sort((a, b) => a.slice(-15).localeCompare(b.slice(-15))).slice(-8));
      save(KEYS.cache, Object.fromEntries(keep.map((k) => [k, cache[k]])));
      return data;
    } catch (err) {
      if (cache[path]) { memo[path] = cache[path]; return cache[path]; }
      throw err;
    }
  }
  const clearMemo = () => Object.keys(memo).forEach((k) => delete memo[k]);

  const getNews = (date) => getJSON(date ? `data/news/${date}.json` : 'data/news/latest.json');
  const getEditions = () => getJSON('data/news/index.json').then((d) => d.editions || []).catch(() => []);
  const getIndex = () => getJSON('data/lessons/index.json').then((d) => d.lessons || []);
  const getLesson = (date) => getJSON(`data/lessons/${date}.json`);
  const getTopics = () => getJSON('data/topics.json');

  /* ===================== QUOTIDIE ENGLISH (app) — INIZIO =====================
     Pagina "Inglese": 5 schede al giorno + ripasso a ripetizione dilazionata.
     Usa: $view, esc, inline, toast, getJSON, isoDay, addDays, fmt, cap,
     emptyState, noEditionState, load, save, cleanup, speech.
     ========================================================================== */
  const EN_KEY = 'qd.english';
  const EN_BOX_DAYS = [0, 1, 3, 7, 14, 30]; // scatola 1..5 → giorni al prossimo ripasso
  const enState = Object.assign({ cards: {}, days: [], quizDone: {} }, load(EN_KEY, {}));
  const enSave = () => save(EN_KEY, enState);
  const enUi = { tab: 'today', q: '', filter: 'all' };

  // Scheda di ripetizione dilazionata (sistema a scatole di Leitner)
  const enCard = (id) => enState.cards[id] || (enState.cards[id] = { box: 0, due: isoDay(), seen: 0, right: 0 });
  const enGrade = (id, good) => {
    const c = enCard(id);
    c.seen++;
    // Parola nuova già nota: parte dalla scatola 2 (ripasso tra 3 giorni)
    if (good) { c.right++; c.box = Math.min(5, Math.max(2, c.box + 1)); } else c.box = 1;
    c.due = addDays(isoDay(), EN_BOX_DAYS[c.box]);
    const t = isoDay();
    if (!enState.days.includes(t)) enState.days.push(t);
    enSave();
  };
  const enLearned = () => Object.values(enState.cards).filter((c) => c.box >= 4).length;
  const enStreak = () => {
    const days = new Set(enState.days);
    let d = isoDay();
    if (!days.has(d)) d = addDays(d, -1);
    let n = 0;
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  };

  const enSpeak = (w) => {
    if (w.audio) {
      const a = new Audio(w.audio);
      a.play().catch(() => enSynth(w.word));
    } else enSynth(w.word);
  };
  const enSynth = (text) => {
    const s = window.speechSynthesis;
    if (!s) return toast('Audio non disponibile su questo dispositivo');
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    const v = s.getVoices().find((x) => /^en-GB/i.test(x.lang));
    if (v) u.voice = v;
    u.rate = 0.9;
    s.speak(u);
  };

  const enShuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Carica le parole di più giorni (per il ripasso e l'archivio)
  async function enLoadDays(dates) {
    const out = [];
    for (const d of dates) {
      try { const day = await getJSON(`data/english/${d}.json`); (day.words || []).forEach((w) => out.push({ ...w, date: d })); } catch { /* giorno non disponibile */ }
    }
    return out;
  }

  async function renderEnglish(param) {
    let index;
    try {
      index = (await getJSON('data/english/index.json')).days || [];
    } catch (err) {
      if (err.status === 404) { $view.innerHTML = noEditionState(); return; }
      throw err;
    }
    if (!index.length) { $view.innerHTML = noEditionState(); return; }
    if (param === 'archivio') enUi.tab = 'archive';
    else if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) enUi.tab = 'today';
    else if (!param) enUi.tab = enUi.tab === 'archive' ? 'today' : enUi.tab;

    const date = param && /^\d{4}-\d{2}-\d{2}$/.test(param) && index.some((d) => d.date === param) ? param : index[0].date;
    const day = await getJSON(`data/english/${date}.json`);
    const words = day.words || [];
    const isToday = date === isoDay();
    const due = Object.entries(enState.cards).filter(([id, c]) => c.box > 0 && c.due <= isoDay() && !id.startsWith(date)).length;

    const subnav = `
      <nav class="subnav" aria-label="Inglese">
        <div class="segmented">
          <a href="#/english" class="${enUi.tab !== 'archive' ? 'is-on' : ''}">${isToday || enUi.tab === 'archive' ? 'Oggi' : esc(cap(fmt(date, { day: 'numeric', month: 'short' })))}</a>
          <a href="#/english/archivio" class="${enUi.tab === 'archive' ? 'is-on' : ''}">Tutte le parole${due ? `<span class="badge" aria-label="${due} da ripassare">${due}</span>` : ''}</a>
        </div>
      </nav>`;

    if (enUi.tab === 'archive') return enRenderArchive(index, subnav);

    const streak = enStreak();
    $view.innerHTML = `${subnav}
      <section class="en">
        <header class="en-head">
          <div class="dateline">
            <span>${esc(cap(fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })))}</span>
            <span>${words.length} parole, circa 4 minuti</span>
          </div>
          <h1>${isToday ? 'Le parole <em>di oggi</em>' : 'Le parole <em>del giorno</em>'}</h1>
          <div class="en-stats">
            <span><b>${streak}</b> ${streak === 1 ? 'giorno di fila' : 'giorni di fila'}</span>
            <span><b>${enLearned()}</b> parole imparate</span>
            <span><b>${due}</b> da ripassare</span>
          </div>
        </header>

        <div class="en-deck" id="en-deck" tabindex="0" aria-label="Schede delle parole">
          ${words.map((w, i) => enCardHtml(w, i, words.length)).join('')}
        </div>
        <div class="en-nav">
          <button class="icon-round" data-en="prev" aria-label="Scheda precedente"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
          <div class="en-dots" id="en-dots">${words.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
          <button class="icon-round" data-en="next" aria-label="Scheda successiva"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
        </div>
        <p class="en-hint">Tocca la scheda per girarla. Scorri per passare alla prossima.</p>

        <section class="en-quiz" id="en-quiz">
          <div class="en-quiz-head">
            <h2>Ripasso</h2>
            <span class="meta">${enState.quizDone[date] ? `Fatto: ${enState.quizDone[date]}` : 'circa 2 minuti'}</span>
          </div>
          <p>Le parole di oggi e quelle dei giorni scorsi che è il momento di ripassare.</p>
          <button class="btn primary" data-en="quiz">Inizia il ripasso</button>
        </section>
      </section>`;

    const deck = document.getElementById('en-deck');
    const dots = [...document.querySelectorAll('#en-dots i')];
    const current = () => Math.round(deck.scrollLeft / deck.clientWidth);
    const go = (i) => deck.scrollTo({ left: Math.max(0, Math.min(words.length - 1, i)) * deck.clientWidth, behavior: 'smooth' });
    const onScroll = () => { const i = current(); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
    deck.addEventListener('scroll', onScroll, { passive: true });
    deck.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') go(current() + 1);
      if (e.key === 'ArrowLeft') go(current() - 1);
    });

    $view.querySelector('.en').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-en]');
      const card = e.target.closest('.en-card');
      if (!b && card) { card.classList.toggle('is-flipped'); return; }
      if (!b) return;
      const act = b.dataset.en;
      const w = words[Number(b.dataset.i)];
      if (act === 'prev') go(current() - 1);
      else if (act === 'next') go(current() + 1);
      else if (act === 'speak') enSpeak(w);
      else if (act === 'know' || act === 'again') {
        enGrade(w.id, act === 'know');
        b.closest('.en-card').querySelectorAll('.en-grade button').forEach((x) => x.classList.toggle('is-on', x === b));
        toast(act === 'know' ? 'Bene: la rivedrai tra qualche giorno' : 'La ripasserai domani');
        setTimeout(() => go(Number(b.dataset.i) + 1), 350);
      } else if (act === 'quiz') {
        await enStartQuiz(words, index, date);
      }
    });
  }

  function enCardHtml(w, i, total) {
    const c = enState.cards[w.id];
    return `
      <article class="en-card" data-id="${esc(w.id)}">
        <div class="en-face en-front">
          <div class="en-meta"><span>${esc(w.categoryLabel || '')}</span><span>${i + 1} di ${total}</span></div>
          <h2 class="en-word" lang="en">${esc(w.word)}</h2>
          <div class="en-pron">
            <span lang="en">${esc(w.ipa)}</span>
            <button class="icon-round small" data-en="speak" data-i="${i}" aria-label="Ascolta la pronuncia"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg></button>
          </div>
          <div class="en-tags"><span>${esc(w.partOfSpeech)}</span><span>${esc(w.level)}</span><span>${esc(w.register)}</span></div>
          <p class="en-turn">Tocca per scoprire il significato</p>
        </div>
        <div class="en-face en-back">
          <div class="en-meta"><span lang="en">${esc(w.word)}</span><span>${esc(w.ipa)}</span></div>
          <p class="en-meaning">${inline(w.meaningIt)}</p>
          <p class="en-def" lang="en">${inline(w.definitionEn)}</p>
          <ul class="en-examples" lang="en">${(w.examples || []).map((x) => `<li>${inline(x)}</li>`).join('')}</ul>
          ${w.exampleIt ? `<p class="en-tr">${inline(w.exampleIt)}</p>` : ''}
          ${(w.collocations || []).length ? `<p class="en-row"><b>Si usa con</b> <span lang="en">${w.collocations.map(esc).join(' · ')}</span></p>` : ''}
          ${(w.synonyms || []).length ? `<p class="en-row"><b>Simili</b> <span lang="en">${w.synonyms.map(esc).join(', ')}</span></p>` : ''}
          ${w.commonMistake ? `<p class="en-warn">${inline(w.commonMistake)}</p>` : ''}
          <div class="en-grade">
            <button class="btn small ${c && c.box > 1 ? 'is-on' : ''}" data-en="know" data-i="${i}">La so già</button>
            <button class="btn small ${c && c.box === 1 ? 'is-on' : ''}" data-en="again" data-i="${i}">Da ripassare</button>
          </div>
        </div>
      </article>`;
  }

  async function enStartQuiz(todayWords, index, date) {
    const box = document.getElementById('en-quiz');
    box.innerHTML = '<div class="skeleton" style="height:18px;width:50%"></div><div class="skeleton" style="height:60px"></div>';
    // Parole dei giorni passati "in scadenza" (al massimo 5) + quelle del giorno
    const pastDates = index.map((d) => d.date).filter((d) => d !== date).slice(0, 30);
    const pool = await enLoadDays(pastDates);
    const dueWords = enShuffle(pool.filter((w) => { const c = enState.cards[w.id]; return c && c.box > 0 && c.due <= isoDay(); })).slice(0, 5);
    const items = enShuffle([...todayWords, ...dueWords]).slice(0, Math.max(6, todayWords.length));
    const distract = [...todayWords, ...pool];
    const questions = items.map((w, i) => {
      const others = enShuffle(distract.filter((x) => x.word !== w.word));
      const cloze = i % 3 !== 2 && w.cloze?.includes('____');
      const options = enShuffle([w, ...others.slice(0, 3)]);
      return cloze
        ? { w, kind: 'cloze', prompt: w.cloze, options: options.map((o) => ({ label: o.word, ok: o.word === w.word, en: true })) }
        : { w, kind: 'meaning', prompt: `Che cosa significa “${w.word}”?`, options: options.map((o) => ({ label: o.meaningIt, ok: o.word === w.word })) };
    });
    let n = 0;
    let right = 0;
    const draw = () => {
      if (n >= questions.length) {
        const score = `${right} su ${questions.length}`;
        enState.quizDone[date] = score;
        const t = isoDay();
        if (!enState.days.includes(t)) enState.days.push(t);
        enSave();
        box.innerHTML = `
          <div class="en-quiz-head"><h2>Ripasso completato</h2><span class="meta">${score}</span></div>
          <p>${right === questions.length ? 'Perfetto. Le parole tornano tra qualche giorno per fissarle.' : 'Le parole sbagliate torneranno domani: è così che restano in memoria.'}</p>
          <button class="btn" data-en="quiz">Rifai il ripasso</button>`;
        return;
      }
      const q = questions[n];
      box.innerHTML = `
        <div class="en-quiz-head"><h2>Ripasso</h2><span class="meta">${n + 1} di ${questions.length}</span></div>
        <p class="en-q"${q.kind === 'cloze' ? ' lang="en"' : ''}>${q.kind === 'cloze' ? esc(q.prompt).replace('____', '<span class="en-blank">____</span>') : esc(q.prompt)}</p>
        <div class="en-options">
          ${q.options.map((o, k) => `<button class="en-opt" data-k="${k}"${o.en ? ' lang="en"' : ''}>${esc(o.label)}</button>`).join('')}
        </div>
        <div class="en-feedback" id="en-feedback"></div>`;
      box.querySelectorAll('.en-opt').forEach((btn) => btn.addEventListener('click', () => {
        const o = q.options[Number(btn.dataset.k)];
        box.querySelectorAll('.en-opt').forEach((x, k) => { x.disabled = true; x.classList.toggle('ok', q.options[k].ok); });
        if (!o.ok) btn.classList.add('ko'); else right++;
        enGrade(q.w.id, o.ok);
        document.getElementById('en-feedback').innerHTML = `
          <p><b lang="en">${esc(q.w.word)}</b> ${esc(q.w.ipa)}: ${inline(q.w.meaningIt)}</p>
          <p lang="en" class="en-tr">${inline(q.w.examples?.[0] || '')}</p>
          <button class="btn primary" id="en-next">${n + 1 < questions.length ? 'Avanti' : 'Vedi il risultato'}</button>`;
        document.getElementById('en-next').addEventListener('click', () => { n++; draw(); });
      }));
    };
    draw();
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function enRenderArchive(index, subnav) {
    $view.innerHTML = `${subnav}<div class="loading"><div class="skeleton" style="height:46px"></div><div class="skeleton" style="height:60px"></div><div class="skeleton" style="height:60px"></div></div>`;
    const all = await enLoadDays(index.map((d) => d.date).slice(0, 120));
    $view.innerHTML = `${subnav}
      <section class="en en-archive">
        <div class="filters">
          <label class="sr-only" for="en-q">Cerca una parola</label>
          <input class="search" id="en-q" type="search" placeholder="Cerca una parola o un significato" value="${esc(enUi.q)}" autocomplete="off" enterkeyhint="search">
          <div class="chips" role="group" aria-label="Filtra">
            ${[['all', 'Tutte'], ['due', 'Da ripassare'], ['learned', 'Imparate']].map(([k, l]) => `<button class="chip ${enUi.filter === k ? 'is-on' : ''}" data-f="${k}">${l}</button>`).join('')}
          </div>
        </div>
        <div id="en-list"></div>
      </section>`;
    const list = document.getElementById('en-list');
    const draw = () => {
      const q = enUi.q.trim().toLowerCase();
      const rows = all.filter((w) => {
        const c = enState.cards[w.id];
        if (enUi.filter === 'due' && !(c && c.box > 0 && c.due <= isoDay())) return false;
        if (enUi.filter === 'learned' && !(c && c.box >= 4)) return false;
        return !q || `${w.word} ${w.meaningIt} ${(w.synonyms || []).join(' ')}`.toLowerCase().includes(q);
      });
      if (!rows.length) { list.innerHTML = '<div class="empty small"><p>Nessuna parola con questi filtri.</p></div>'; return; }
      let month = '';
      list.innerHTML = rows.map((w) => {
        const m = fmt(w.date, { month: 'long', year: 'numeric' });
        const head = m !== month ? `<h2 class="month">${esc(m)}</h2>` : '';
        month = m;
        const c = enState.cards[w.id];
        const status = !c || !c.box ? '' : c.box >= 4 ? '<span class="en-pill ok">imparata</span>' : c.due <= isoDay() ? '<span class="en-pill due">da ripassare</span>' : '';
        return `${head}
          <details class="en-item">
            <summary>
              <span><b lang="en">${esc(w.word)}</b> <small>${esc(w.ipa)}</small></span>
              <span class="en-item-sub">${esc(w.meaningIt)}</span>
              ${status}
            </summary>
            <div class="en-item-body">
              <p lang="en">${inline(w.definitionEn)}</p>
              <ul class="en-examples" lang="en">${(w.examples || []).map((x) => `<li>${inline(x)}</li>`).join('')}</ul>
              <button class="text-link" data-speak="${esc(w.id)}">Ascolta la pronuncia</button>
            </div>
          </details>`;
      }).join('');
    };
    draw();
    document.getElementById('en-q').addEventListener('input', (e) => { enUi.q = e.target.value; draw(); });
    $view.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
      enUi.filter = b.dataset.f;
      $view.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('is-on', x === b));
      draw();
    }));
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-speak]');
      if (b) enSpeak(all.find((w) => w.id === b.dataset.speak));
    });
  }
  /* ===================== QUOTIDIE ENGLISH (app) — FINE ===================== */

  /* ---------- Router ---------- */
  const routes = { english: renderEnglish, news: renderNews, learn: renderLearn, settings: renderSettings };

  let cleanup = [];
  let currentView = '';
  async function route() {
    cleanup.forEach((fn) => fn());
    cleanup = [];
    speech.stop();

    // Vecchio indirizzo dello storico, ora dentro Impara
    if (/^#\/?archive/.test(location.hash)) return location.replace('#/learn/storico');

    const [name = 'news', param] = location.hash.replace(/^#\/?/, '').split('/');
    const view = routes[name] ? name : 'news';
    const sameView = view === currentView;
    currentView = view;

    document.querySelectorAll('[data-tab]').forEach((a) => {
      const on = a.dataset.tab === view;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.body.dataset.view = view;
    moveTabIndicator();

    if (!sameView) $view.innerHTML = skeleton(view);
    window.scrollTo(0, 0);
    try {
      await routes[view](param);
    } catch (err) {
      console.error(err);
      $view.innerHTML = err.status === 404 ? noEditionState() : emptyState(
        'Contenuti non disponibili',
        'Non riesco a caricare l\'edizione: controlla la connessione.',
        '<button class="text-link" data-action="reload">Riprova</button>'
      );
    }
    $view.classList.remove('view-enter');
    void $view.offsetWidth;
    $view.classList.add('view-enter');
    updateProgress();
  }

  const skeleton = (view) => view === 'news' ? `
    <div class="loading" aria-label="Caricamento">
      <div class="skeleton" style="height:13px;width:45%"></div>
      <div class="skeleton" style="height:44px;width:80%;margin-top:.8rem"></div>
      <div class="skeleton" style="height:3px;margin:1.4rem 0"></div>
      ${Array.from({ length: 4 }, () => `
        <div class="skeleton" style="height:20px;width:88%;margin-top:1.6rem"></div>
        <div class="skeleton" style="height:14px"></div>
        <div class="skeleton" style="height:14px;width:62%"></div>`).join('')}
    </div>` : `
    <div class="loading" aria-label="Caricamento">
      <div class="skeleton" style="height:13px;width:40%"></div>
      <div class="skeleton" style="height:44px;width:85%;margin-top:.8rem"></div>
      <div class="skeleton" style="height:44px;width:60%;margin-bottom:2rem"></div>
      <div class="skeleton" style="height:14px"></div>
      <div class="skeleton" style="height:14px"></div>
      <div class="skeleton" style="height:14px;width:70%"></div>
    </div>`;

  const emptyState = (title, text, action = '') => `
    <div class="empty">
      ${icon.logo}
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${action}
    </div>`;

  const noEditionState = () => emptyState(
    'Nessuna edizione ancora',
    'La prima edizione arriva domattina. Puoi anche crearla adesso: ci vogliono un paio di minuti.',
    `<button class="btn primary" data-action="run">${icon.refresh}Crea l'edizione adesso</button>
     <button class="text-link" data-action="reload">Controlla di nuovo</button>`
  );

  /* ---------- Giornale ---------- */
  const deskShort = { tech: 'Tech e AI', finance: 'Finanza', italy: 'Italia', world: 'Mondo' };
  const storyText = (st) => [st.title, st.lead, st.body || st.summary, st.why].filter(Boolean).join(' ');

  async function renderNews(param) {
    const date = isIso(param) ? param : null;
    const [news, editions] = await Promise.all([getNews(date), getEditions()]);
    const today = isoDay();
    const sections = (news.sections || []).filter((s) => s.stories?.length);
    const weekly = news.kind === 'weekly';

    const allText = [...(news.brief || []), ...sections.flatMap((s) => s.stories.map(storyText))].join(' ');
    const mins = news.minutes || minutes(words(allText));
    const storyCount = sections.reduce((n, s) => n + s.stories.length, 0);
    const keys = sections.flatMap((s) => s.stories.map((st) => storyKey(news.date, st)));

    const isLatest = !date;
    let note = '';
    if (isLatest && news.date !== today) {
      const late = romeHour() >= 9;
      note = `
        <div class="stale-note">
          <span>${news.date === addDays(today, -1) ? 'Questa è l\'edizione di ieri' : `Questa è l'edizione del ${esc(fmt(news.date, { day: 'numeric', month: 'long' }))}`}${late ? ': quella di oggi non è ancora arrivata.' : '. Quella di oggi arriva in mattinata.'}</span>
          ${late ? `<button class="text-link" data-action="run">Aggiorna adesso</button>` : ''}
        </div>`;
    }

    const heading = weekly
      ? `La settimana <em>${esc(rangeText(news.range?.from || addDays(news.date, -6), news.range?.to || news.date))}</em>`
      : isLatest && news.date === today ? greeting() : `Il mondo, <em>${esc(fmt(news.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</em>`;

    $view.innerHTML = `
      <header class="masthead">
        ${editionChips(editions, news.date)}
        <div class="dateline">
          <span>${esc(longDate(news.date))}</span>
          <span>${storyCount} notizie, ${mins} minuti</span>
        </div>
        <h1>${heading}</h1>
        ${note}
        <div class="dawn" aria-hidden="true"></div>
        ${news.brief?.length ? `
          <ul class="brief" aria-label="In breve">
            ${news.brief.map((b) => `<li>${inline(b)}</li>`).join('')}
          </ul>` : ''}
        <div class="news-actions">
          <button class="btn small" data-action="listen-news">${icon.listen}Ascolta</button>
          <span class="read-count" id="read-count"></span>
        </div>
      </header>
      <nav class="desk-nav" id="desk-nav" aria-label="Sezioni del giornale">
        ${sections.map((s) => `<a href="#desk-${esc(s.id)}" data-desk="${esc(s.id)}">${esc(deskShort[s.id] || s.title)}</a>`).join('')}
      </nav>
      <div class="desks">
        ${sections.map((s) => renderDesk(s, news.date)).join('')}
      </div>`;

    const updateCount = () => {
      const n = keys.filter((k) => state.newsRead[k]).length;
      $('read-count').textContent = n ? `${n} di ${keys.length} lette` : 'Tocca una notizia per aprirla';
    };
    updateCount();

    // Espandi / chiudi notizia
    $view.querySelectorAll('.story-toggle').forEach((btn) => btn.addEventListener('click', () => {
      const story = btn.closest('.story');
      const open = !story.classList.contains('is-open');
      story.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open);
      if (open) {
        markStoryRead(story.dataset.key);
        story.classList.add('is-read');
        updateCount();
        // Se la notizia aperta finisce sotto la tab bar, la porta in vista
        requestAnimationFrame(() => {
          const r = story.getBoundingClientRect();
          if (r.top < 120) window.scrollBy({ top: r.top - 130, behavior: 'smooth' });
        });
      }
    }));

    // Barra delle sezioni: tocco = scorri alla sezione; scorrendo si evidenzia quella visibile
    const nav = $('desk-nav');
    const setDesk = (id) => nav.querySelectorAll('[data-desk]').forEach((a) => {
      const on = a.dataset.desk === id;
      if (on === a.classList.contains('is-on')) return;
      a.classList.toggle('is-on', on);
      // Porta in vista la voce attiva scorrendo solo la barra, non la pagina
      if (on) nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
    });
    let lockUntil = 0;
    nav.addEventListener('click', (e) => {
      const a = e.target.closest('[data-desk]');
      if (!a) return;
      e.preventDefault();
      const target = $(`desk-${a.dataset.desk}`);
      const top = target.getBoundingClientRect().top + window.scrollY - (nav.offsetHeight + $topbar.offsetHeight + 8);
      setDesk(a.dataset.desk);
      lockUntil = Date.now() + 900;
      window.scrollTo({ top, behavior: 'smooth' });
    });
    const onScroll = () => {
      if (Date.now() < lockUntil) return;
      const line = $topbar.offsetHeight + nav.offsetHeight + 40;
      let current = sections[0]?.id;
      for (const s of sections) if ($(`desk-${s.id}`).getBoundingClientRect().top <= line) current = s.id;
      setDesk(current);
    };
    let raf = 0;
    const scrollHandler = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(onScroll); };
    window.addEventListener('scroll', scrollHandler, { passive: true });
    cleanup.push(() => window.removeEventListener('scroll', scrollHandler));

    // Ascolto
    $view.querySelector('[data-action="listen-news"]').addEventListener('click', () => {
      const parts = [
        `${weekly ? 'La settimana' : 'Il giornale'} di ${longDate(news.date)}.`,
        ...(news.brief || []),
        ...sections.flatMap((s) => [`${s.title}.`, ...s.stories.flatMap((st) => [st.title + '.', st.lead, st.body || st.summary, st.why])]),
      ];
      speech.play(parts, {
        title: weekly ? 'La settimana' : 'Il giornale',
        sub: `${mins} minuti`,
        audioUrl: `data/audio/news-${news.date}.mp3`,
        fallbackAudioUrl: 'data/audio/news-latest.mp3',
      });
    });
    $view.querySelectorAll('[data-action="listen-story"]').forEach((b) => b.addEventListener('click', () => {
      const st = sections.flatMap((s) => s.stories).find((x) => storyKey(news.date, x) === b.dataset.key);
      if (st) speech.play([st.title + '.', st.lead, st.body || st.summary, st.why], { title: plain(st.title), sub: 'Notizia' });
    }));
  }

  function editionChips(editions, current) {
    if (editions.length < 2) return '';
    const latest = editions[0]?.date;
    return `
      <nav class="editions" aria-label="Edizioni precedenti">
        ${editions.map((e) => {
          const label = e.date === isoDay() ? 'Oggi'
            : e.date === addDays(isoDay(), -1) ? 'Ieri'
            : e.kind === 'weekly' ? `Settimana ${fmt(e.date, { day: 'numeric' })}`
            : cap(fmt(e.date, { weekday: 'short', day: 'numeric' }));
          const href = e.date === latest ? '#/news' : `#/news/${e.date}`;
          return `<a href="${href}" class="${e.date === current ? 'is-on' : ''}${e.kind === 'weekly' ? ' weekly' : ''}">${esc(label)}</a>`;
        }).join('')}
      </nav>`;
  }

  function greeting() {
    const h = romeHour();
    if (h < 5) return 'Buona notte, <em>ecco il mondo</em>';
    if (h < 13) return 'Buongiorno, <em>ecco il mondo</em>';
    if (h < 18) return 'Buon pomeriggio, <em>ecco il mondo</em>';
    return 'Buonasera, <em>ecco il mondo</em>';
  }

  function renderDesk(section, date) {
    return `
      <section class="desk" id="desk-${esc(section.id)}" aria-labelledby="desk-h-${esc(section.id)}">
        <div class="desk-head">
          <h2 id="desk-h-${esc(section.id)}">${esc(section.title)}</h2>
          <span class="meta">${section.stories.length} notizie</span>
        </div>
        ${section.stories.map((st) => renderStory(st, date)).join('')}
      </section>`;
  }

  function renderStory(story, date) {
    const key = storyKey(date, story);
    const sources = (story.sources || [])
      .map((s) => ({ ...s, url: safeUrl(s.url) }))
      .filter((s) => s.url)
      .slice(0, 3);
    const body = story.body || story.summary || '';
    // Edizioni vecchie senza "lead": anteprima dalla prima frase del testo
    const lead = story.lead || (body.match(/^.*?[.!?](\s|$)/) || [body.slice(0, 160)])[0];
    const rest = story.lead ? body : body.slice(lead.length);
    const secs = story.readSeconds || Math.round(words(storyText(story)) / WPM * 60);
    const time = secs >= 90 ? `${Math.round(secs / 60)} min` : `${Math.max(1, Math.round(secs / 60))} min`;
    const read = !!state.newsRead[key];
    const id = `st-${slug(key).slice(-40)}`;
    return `
      <article class="story${read ? ' is-read' : ''}" data-key="${esc(key)}">
        <button class="story-toggle" type="button" aria-expanded="false" aria-controls="${id}">
          <h3>${inline(story.title)}</h3>
          <p class="lead">${inline(lead)}</p>
          <span class="story-meta">${read ? '<span class="tick" aria-label="Letta"></span>' : ''}${time}${icon.chevron}</span>
        </button>
        <div class="story-more" id="${id}">
          <div class="story-inner">
            ${paragraphs(rest)}
            ${story.why ? `<p class="why"><b>Perché conta.</b> ${inline(story.why)}</p>` : ''}
            <div class="story-foot">
              ${sources.length ? `<div class="sources">${sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || new URL(s.url).hostname)} ↗</a>`).join('')}</div>` : ''}
              <button class="text-link" data-action="listen-story" data-key="${esc(key)}">${icon.listen}Ascolta</button>
            </div>
          </div>
        </div>
      </article>`;
  }

  /* ---------- Impara: lezione di oggi + storico ---------- */
  async function renderLearn(param) {
    const index = await getIndex();
    if (!index.length) {
      $view.innerHTML = emptyState('Nessuna lezione ancora', 'La prima lezione arriva con la prossima edizione del mattino.',
        `<button class="btn primary" data-action="run">${icon.refresh}Crea l'edizione adesso</button>`);
      return;
    }
    const onArchive = param === 'storico';
    const isPast = !onArchive && param && param !== index[0].date && index.some((l) => l.date === param);
    const unread = index.filter((l) => !state.read[l.date]).length;
    const subnav = `
      <nav class="subnav" aria-label="Impara">
        <div class="segmented">
          <a href="#/learn" class="${!onArchive && !isPast ? 'is-on' : ''}">Oggi</a>
          <a href="#/learn/storico" class="${onArchive || isPast ? 'is-on' : ''}">Storico<span class="badge" ${unread ? '' : 'hidden'} aria-label="${unread} da leggere">${unread}</span></a>
        </div>
      </nav>`;
    if (onArchive) return renderArchive(index, subnav);
    return renderLesson(index, isPast ? param : index[0].date, subnav);
  }

  async function renderLesson(index, target, subnav) {
    const lesson = await getLesson(target);
    const isToday = target === index[0].date;
    const sections = lesson.sections || [];

    const fullText = [
      lesson.hook,
      ...sections.flatMap((s) => [s.heading, s.body]),
      ...(lesson.keyTakeaways || []),
      lesson.example, lesson.funFact,
    ].join(' ');
    const mins = lesson.minutes || minutes(words(fullText));
    const further = Array.isArray(lesson.furtherReading) ? lesson.furtherReading : [];

    $view.innerHTML = `${subnav}
      <article class="lesson">
        ${!isToday ? `<a class="text-link back" href="#/learn/storico">${icon.back}Torna allo storico</a>` : ''}
        <div class="lesson-meta">
          <span class="cat">${esc(lesson.category)}</span>
          <span>${esc(isToday ? 'Lezione di oggi' : fmt(target, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>
          <span>${mins} minuti</span>
        </div>
        <h1>${inline(lesson.title)}</h1>
        ${lesson.fromNews?.headline ? `<p class="from-news">Spunto dalla notizia: <em>${inline(lesson.fromNews.headline)}</em></p>` : ''}
        <p class="hook">${inline(lesson.hook)}</p>
        ${lesson.series ? seriesBox(lesson.series, index, target) : ''}
        <button class="btn small listen-lesson" data-action="listen-lesson">${icon.listen}Ascolta la lezione</button>

        <div class="body">
          ${sections.map((s) => `
            <section>
              <h2>${inline(s.heading)}</h2>
              ${paragraphs(s.body)}
            </section>`).join('')}
        </div>

        ${lesson.example ? `
          <aside class="callout">
            <h3>Un esempio concreto</h3>
            ${paragraphs(lesson.example)}
          </aside>` : ''}

        ${lesson.keyTakeaways?.length ? `
          <aside class="callout">
            <h3>Da ricordare</h3>
            <ol>${lesson.keyTakeaways.map((k) => `<li>${inline(k)}</li>`).join('')}</ol>
          </aside>` : ''}

        ${lesson.funFact ? `
          <aside class="callout sunlit">
            <h3>Lo sapevi?</h3>
            ${paragraphs(lesson.funFact)}
          </aside>` : ''}

        ${further.length ? `
          <p class="further">Per approfondire: ${further.map((f) => typeof f === 'string' ? inline(f) : `<em>${inline(f.title)}</em>${f.note ? ` (${inline(f.note)})` : ''}`).join('; ')}</p>` : ''}

        <div class="lesson-actions" id="lesson-end">
          <button class="btn ${state.read[target] ? 'is-on' : ''}" data-action="read" data-date="${esc(target)}">
            ${icon.check}<span>${state.read[target] ? 'Letta' : 'Segna come letta'}</span>
          </button>
          <button class="btn fav ${state.favs[target] ? 'is-on' : ''}" data-action="fav" data-date="${esc(target)}" aria-pressed="${!!state.favs[target]}">
            ${icon.star}<span>${state.favs[target] ? 'Nei preferiti' : 'Aggiungi ai preferiti'}</span>
          </button>
        </div>
      </article>`;

    $view.querySelector('[data-action="listen-lesson"]').addEventListener('click', () => {
      speech.play([
        lesson.title + '.', lesson.hook,
        ...sections.flatMap((s) => [s.heading + '.', s.body]),
        lesson.example ? 'Un esempio concreto. ' + lesson.example : '',
        lesson.keyTakeaways?.length ? 'Da ricordare. ' + lesson.keyTakeaways.join(' ') : '',
        lesson.funFact ? 'Lo sapevi? ' + lesson.funFact : '',
      ], {
        title: plain(lesson.title),
        sub: `Lezione, ${mins} minuti`,
        audioUrl: `data/audio/lesson-${target}.mp3`,
        fallbackAudioUrl: 'data/audio/lesson-latest.mp3',
        onEnd: () => { if (!state.read[target]) { markRead(target); syncReadButton(target); } },
      });
    });

    // Segna come letta in automatico quando arrivi in fondo (dopo almeno 20 secondi)
    const opened = Date.now();
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && Date.now() - opened > 20000 && !state.read[target]) {
        markRead(target);
        syncReadButton(target);
        toast(streak() > 1 ? `Lezione completata. Sei a ${streak()} giorni di fila` : 'Lezione completata');
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe($('lesson-end'));
    cleanup.push(() => io.disconnect());
  }

  function seriesBox(series, index, current) {
    // Le puntate uscite si trovano nell'indice con lo stesso id di percorso
    const published = Object.fromEntries(index.filter((l) => l.series?.id === series.id).map((l) => [l.series.part, l.date]));
    const parts = series.parts || [];
    return `
      <aside class="series">
        <div class="series-head">
          <span class="series-label">Percorso, parte ${series.part} di ${series.total}</span>
          <b>${inline(series.title)}</b>
          ${series.intro ? `<p>${inline(series.intro)}</p>` : ''}
        </div>
        <ol class="series-parts">
          ${parts.map((t, i) => {
            const n = i + 1;
            const date = published[n];
            const state_ = n === series.part ? 'is-current' : date ? 'is-done' : 'is-next';
            const label = inline(t);
            return `<li class="${state_}">${date && date !== current ? `<a href="#/learn/${esc(date)}">${label}</a>` : `<span>${label}</span>`}${!date ? '<small>in arrivo</small>' : ''}</li>`;
          }).join('')}
        </ol>
      </aside>`;
  }

  function syncReadButton(date) {
    const btn = $view.querySelector('[data-action="read"]');
    if (btn) {
      const on = !!state.read[date];
      btn.classList.toggle('is-on', on);
      btn.querySelector('span').textContent = on ? 'Letta' : 'Segna come letta';
    }
    const badge = $view.querySelector('.subnav .badge');
    if (badge) getIndex().then((index) => {
      const n = index.filter((l) => !state.read[l.date]).length;
      badge.textContent = n;
      badge.hidden = !n;
    });
  }

  /* ---------- Storico ---------- */
  const archiveFilter = { q: '', cat: 'all', only: 'all' };

  function renderArchive(index, subnav) {
    const cats = [...new Set(index.map((l) => l.category))].sort((a, b) => a.localeCompare(b, 'it'));
    const readCount = index.filter((l) => state.read[l.date]).length;
    const hasSeries = index.some((l) => l.series);
    const s = streak();

    // Ultimi 7 giorni per il mini-calendario della streak
    const today = isoDay();
    const days = new Set(state.readDays);
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

    const statusFilters = [['all', 'Tutte'], ['unread', 'Da leggere'], ['favs', 'Preferiti']];
    if (hasSeries) statusFilters.push(['series', 'Percorsi']);
    if (!statusFilters.some(([k]) => k === archiveFilter.only)) archiveFilter.only = 'all';

    $view.innerHTML = `${subnav}
      <section class="archive">
        <div class="stats">
          <div class="stat streak">
            <b>${s}</b>
            <span>${s === 1 ? 'giorno di fila' : 'giorni di fila'}</span>
            <div class="week" aria-label="Letture degli ultimi 7 giorni">
              ${week.map((d) => `<i class="${days.has(d) ? 'on' : ''}" title="${esc(fmt(d, { weekday: 'long', day: 'numeric' }))}"></i>`).join('')}
            </div>
          </div>
          <div class="stat"><b>${readCount}</b><span>lette</span></div>
          <div class="stat"><b>${index.length - readCount}</b><span>da leggere</span></div>
        </div>

        <div class="filters">
          <label class="sr-only" for="q">Cerca nello storico</label>
          <input class="search" id="q" type="search" placeholder="Cerca un argomento" value="${esc(archiveFilter.q)}" autocomplete="off" enterkeyhint="search">
          <div class="chips" role="group" aria-label="Filtra per stato">
            ${statusFilters.map(([k, label]) => `
              <button class="chip ${archiveFilter.only === k ? 'is-on' : ''}" data-only="${k}">${label}</button>`).join('')}
          </div>
          <div class="chips" role="group" aria-label="Filtra per categoria">
            <button class="chip ${archiveFilter.cat === 'all' ? 'is-on' : ''}" data-cat="all">Tutte le categorie</button>
            ${cats.map((c) => `<button class="chip ${archiveFilter.cat === c ? 'is-on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
        </div>

        <div id="entries"></div>
      </section>`;

    const $entries = $('entries');
    const draw = () => {
      const q = archiveFilter.q.trim().toLowerCase();
      const list = index.filter((l) =>
        (archiveFilter.cat === 'all' || l.category === archiveFilter.cat) &&
        (archiveFilter.only !== 'unread' || !state.read[l.date]) &&
        (archiveFilter.only !== 'favs' || state.favs[l.date]) &&
        (archiveFilter.only !== 'series' || l.series) &&
        (!q || `${l.title} ${l.category} ${l.hook || ''} ${l.series?.title || ''}`.toLowerCase().includes(q))
      );
      if (!list.length) {
        $entries.innerHTML = `<div class="empty small"><p>${
          archiveFilter.only === 'favs' ? 'Nessun preferito con questi filtri. Tocca la stella in fondo a una lezione per salvarla qui.'
          : archiveFilter.only === 'unread' ? 'Hai letto tutto. Ottimo lavoro.'
          : 'Nessuna lezione corrisponde alla ricerca.'
        }</p></div>`;
        return;
      }
      let month = '';
      $entries.innerHTML = list.map((l) => {
        const m = fmt(l.date, { month: 'long', year: 'numeric' });
        const head = m !== month ? `<h2 class="month">${esc(m)}</h2>` : '';
        month = m;
        const read = !!state.read[l.date];
        const sub = l.series ? `${esc(l.series.title)}, parte ${l.series.part} di ${l.series.total}` : esc(l.category);
        return `${head}
          <a class="entry ${read ? 'is-read' : ''}" href="#/learn/${esc(l.date)}">
            <span class="day"><b>${fromIso(l.date).getUTCDate()}</b><small>${esc(fmt(l.date, { weekday: 'short' }))}</small></span>
            <span>
              <h3>${inline(l.title)}</h3>
              <span class="sub">${sub}, ${l.minutes || 5} min</span>
            </span>
            <span class="marks">
              ${state.favs[l.date] ? icon.starSolid : ''}
              ${!read ? '<span class="dot" aria-label="Da leggere"></span>' : ''}
            </span>
          </a>`;
      }).join('');
    };
    draw();

    const $q = $('q');
    $q.addEventListener('input', () => { archiveFilter.q = $q.value; draw(); });
    $view.querySelectorAll('[data-only]').forEach((b) => b.addEventListener('click', () => {
      archiveFilter.only = b.dataset.only;
      $view.querySelectorAll('[data-only]').forEach((x) => x.classList.toggle('is-on', x === b));
      draw();
    }));
    $view.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
      archiveFilter.cat = b.dataset.cat;
      $view.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('is-on', x === b));
      draw();
    }));
  }

  /* ---------- GitHub: configurazione e API ---------- */
  function guessRepo() {
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return { owner: '', repo: '' };
    const owner = host.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    return { owner, repo: first || host };
  }
  const ghConfig = () => Object.assign(guessRepo(), load(KEYS.github, {}));
  const ghConnected = () => !!load(KEYS.github, {}).token;
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?name=Quotidie&description=Categorie+e+aggiornamento+dell%27edizione&expires_in=none&contents=write&actions=write';

  // L'indirizzo delle API si può cambiare solo per i test in locale
  const GH_API = (() => {
    const override = new URLSearchParams(location.search).get('ghapi');
    return override && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? override : 'https://api.github.com';
  })();

  async function gh(cfg, path, opts = {}) {
    const res = await fetch(`${GH_API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`, {
      ...opts,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.status === 401) throw ghError('Il token non è valido o è scaduto: creane uno nuovo.', 'token');
    return res;
  }
  const ghError = (message, kind) => Object.assign(new Error(message), { kind });

  async function pushTopics(cfg, content) {
    const current = await gh(cfg, '/contents/data/topics.json');
    let sha;
    if (current.status === 404) {
      // Il file non esiste ancora: verifica almeno che il repository sia raggiungibile
      const repoRes = await gh(cfg, '');
      if (!repoRes.ok) throw ghError('Repository non trovato o token senza accesso a questo repository.', 'token');
    } else if (!current.ok) {
      throw ghError(`GitHub ha risposto ${current.status}`);
    } else {
      ({ sha } = await current.json());
    }
    const json = JSON.stringify(content, null, 2) + '\n';
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    const res = await gh(cfg, '/contents/data/topics.json', {
      method: 'PUT',
      body: JSON.stringify({ message: 'Aggiorna categorie delle lezioni', content: btoa(bin), sha }),
    });
    if (res.status === 403 || res.status === 404) throw ghError('Il token non ha il permesso "Contents: Read and write" su questo repository.', 'token');
    if (!res.ok) throw ghError(`Salvataggio non riuscito (${res.status})`);
  }

  /* ---------- Aggiornamento dell'edizione (avvio del workflow) ---------- */
  const STEP_LABELS = [
    [/scarica|checkout/i, 'Preparazione dell\'ambiente'],
    [/node/i, 'Preparazione dell\'ambiente'],
    [/prepara il generatore/i, 'Preparazione dell\'ambiente'],
    [/genera/i, 'Gemini cerca le notizie e scrive i testi, circa 1-3 minuti'],
    [/salva/i, 'Salvataggio nel repository'],
    [/segnala/i, 'Controllo finale'],
  ];
  const PHASES = [
    ['start', 'Avvio'],
    ['queued', 'In coda su GitHub'],
    ['running', 'Scrittura del giornale e della lezione'],
    ['publish', 'Pubblicazione'],
    ['done', 'Pronto'],
  ];

  const runner = {
    job: load(KEYS.run, null), // { startedAt, runId, phase, step, error, htmlUrl, prevGen, opts }
    timer: null,
    sheetOpen: false,

    save() { save(KEYS.run, this.job); renderRunChip(); if (this.sheetOpen) renderSheet(); },
    active() { return this.job && !['done', 'error'].includes(this.job.phase); },

    async start(opts = {}) {
      const cfg = ghConfig();
      if (!cfg.token || !cfg.owner || !cfg.repo) { openSheet('setup'); return; }
      if (this.active()) { openSheet(); return; }
      const prev = await fetch(`data/news/latest.json?v=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      this.job = { startedAt: Date.now(), phase: 'start', step: '', prevGen: prev?.generatedAt || null, prevLesson: null, opts };
      const idx = await fetch(`data/lessons/index.json?v=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      this.job.prevLesson = idx?.lessons?.[0]?.date || null;
      this.save();
      openSheet();
      try {
        const inputs = { only: opts.only || 'tutto', force: String(!!opts.force), new_series: String(!!opts.newSeries) };
        const res = await gh(cfg, `/actions/workflows/${WORKFLOW}/dispatches`, {
          method: 'POST',
          body: JSON.stringify({ ref: await defaultBranch(cfg), inputs }),
        });
        if (res.status === 404) throw ghError('GitHub non trova il workflow: nel repository deve esistere il file .github/workflows/daily.yml (senza .txt).', 'workflow');
        if (res.status === 403) throw ghError('Il token non ha il permesso "Actions: Read and write". Creane uno nuovo con il link qui sotto.', 'token');
        if (res.status === 422) {
          const msg = (await res.json().catch(() => ({}))).message || '';
          throw ghError(/disabled/i.test(msg) ? 'Il workflow è disattivato: riattivalo da GitHub, tab Actions.' : `GitHub ha rifiutato la richiesta: ${msg}`, 'workflow');
        }
        if (!res.ok) throw ghError(`GitHub ha risposto ${res.status}`);
        this.job.phase = 'queued';
        this.save();
        this.poll();
      } catch (err) {
        this.fail(err);
      }
    },

    fail(err) {
      console.error(err);
      this.job = { ...(this.job || {}), failedAt: this.job?.phase || 'start', phase: 'error', error: err.message || 'Errore sconosciuto', errorKind: err.kind || '' };
      this.save();
      openSheet();
    },

    async poll() {
      clearTimeout(this.timer);
      if (!this.active()) return;
      const cfg = ghConfig();
      try {
        if (['queued', 'running', 'start'].includes(this.job.phase)) await this.checkRun(cfg);
        if (this.job.phase === 'publish') await this.checkPublished();
      } catch (err) {
        // Errori definitivi: si mostrano subito. Gli altri (rete) si riprovano al giro dopo
        if (err.kind === 'token' || err.kind === 'run' || err.kind === 'workflow') return this.fail(err);
        console.warn('Controllo stato non riuscito, riprovo', err);
      }
      if (Date.now() - this.job.startedAt > 25 * 60000 && this.active()) {
        return this.fail(ghError('L\'aggiornamento sta impiegando troppo. Controlla su GitHub, tab Actions.'));
      }
      if (this.active()) this.timer = setTimeout(() => this.poll(), document.hidden ? 15000 : 4000);
    },

    async checkRun(cfg) {
      if (!this.job.runId) {
        const since = new Date(this.job.startedAt - 60000).toISOString();
        const res = await gh(cfg, `/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=5&created=${encodeURIComponent('>=' + since)}`);
        if (res.status === 403) throw ghError('Il token non può leggere le Actions: serve il permesso "Actions: Read and write".', 'token');
        if (!res.ok) return;
        const { workflow_runs: runs = [] } = await res.json();
        const run = runs.find((r) => new Date(r.created_at).getTime() >= this.job.startedAt - 60000);
        if (!run) return;
        this.job.runId = run.id;
        this.job.htmlUrl = run.html_url;
      }
      const res = await gh(cfg, `/actions/runs/${this.job.runId}/jobs`);
      if (!res.ok) return;
      const { jobs = [] } = await res.json();
      const job = jobs[0];
      const runRes = await gh(cfg, `/actions/runs/${this.job.runId}`);
      const run = runRes.ok ? await runRes.json() : null;
      const status = run?.status || job?.status;
      if (status === 'queued' || status === 'waiting' || status === 'pending' || status === 'requested') {
        this.job.phase = 'queued';
      } else if (status === 'in_progress') {
        this.job.phase = 'running';
        const step = (job?.steps || []).find((s) => s.status === 'in_progress');
        const label = step && (STEP_LABELS.find(([re]) => re.test(step.name)) || [])[1];
        this.job.step = label || '';
      } else if (status === 'completed') {
        const failedStep = (job?.steps || []).find((s) => s.conclusion === 'failure');
        if (run?.conclusion === 'success') {
          this.job.phase = 'publish';
          this.job.publishSince = Date.now();
        } else if (failedStep && /segnala/i.test(failedStep.name) && (job.steps || []).some((s) => /salva/i.test(s.name) && s.conclusion === 'success')) {
          // Generazione parziale: qualcosa è stato salvato, si aspetta comunque la pubblicazione
          this.job.phase = 'publish';
          this.job.partial = true;
          this.job.publishSince = Date.now();
        } else {
          throw ghError(failedStep && /genera/i.test(failedStep.name)
            ? 'La generazione non è riuscita. Di solito dipende dalla API key di Gemini o da un limite temporaneo: apri il dettaglio su GitHub.'
            : `L'aggiornamento si è interrotto${failedStep ? ` allo step "${failedStep.name}"` : ''}. Apri il dettaglio su GitHub.`, 'run');
        }
      }
      this.save();
    },

    async checkPublished() {
      // GitHub Pages pubblica i nuovi file in 1-2 minuti dopo la fine del workflow
      const [news, idx] = await Promise.all([
        fetch(`data/news/latest.json?v=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`data/lessons/index.json?v=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const only = this.job.opts?.only || 'tutto';
      const newsReady = only === 'lesson' || (news?.generatedAt && news.generatedAt !== this.job.prevGen);
      // Lezione: pronta se c'è quella di oggi (se esisteva già e non si è chiesto di sostituirla, va bene così)
      const lessonToday = idx?.lessons?.[0]?.date === isoDay();
      const lessonReady = only === 'news' || (lessonToday && (this.job.prevLesson !== isoDay() || !this.job.opts?.force || Date.now() - this.job.publishSince > 90000));
      if ((newsReady && lessonReady) || Date.now() - this.job.publishSince > 6 * 60000) {
        this.job.phase = 'done';
        this.job.finishedAt = Date.now();
        this.save();
        clearMemo();
        if (!this.sheetOpen) toast('La nuova edizione è pronta');
        if (currentView !== 'settings') route();
      }
    },

    resume() { if (this.active()) this.poll(); },
    dismiss() { this.job = null; save(KEYS.run, null); renderRunChip(); },
  };

  async function defaultBranch(cfg) {
    try {
      const res = await gh(cfg, '');
      if (res.ok) return (await res.json()).default_branch || 'main';
    } catch (err) { if (err.kind === 'token') throw err; }
    return 'main';
  }

  function renderRunChip() {
    const chip = $('run-chip');
    const job = runner.job;
    const show = job && (runner.active() || (job.phase === 'done' && Date.now() - (job.finishedAt || 0) < 60000) || job.phase === 'error');
    chip.hidden = !show || runner.sheetOpen;
    if (!show) return;
    chip.dataset.phase = job.phase;
    chip.querySelector('.run-chip-text').textContent = job.phase === 'error' ? 'Errore' : job.phase === 'done' ? 'Pronta' : 'Aggiornamento';
  }
  $('run-chip').addEventListener('click', () => openSheet());

  /* ---------- Finestra dal basso ---------- */
  let sheetMode = 'run';
  let elapsedTimer;
  function openSheet(mode = 'run') {
    sheetMode = mode;
    runner.sheetOpen = true;
    $('sheet-backdrop').hidden = false;
    $('sheet').hidden = false;
    requestAnimationFrame(() => document.body.classList.add('sheet-open'));
    renderSheet();
    renderRunChip();
    clearInterval(elapsedTimer);
    elapsedTimer = setInterval(() => { if (runner.active()) updateElapsed(); }, 1000);
  }
  function closeSheet() {
    runner.sheetOpen = false;
    document.body.classList.remove('sheet-open');
    clearInterval(elapsedTimer);
    setTimeout(() => { if (!runner.sheetOpen) { $('sheet').hidden = true; $('sheet-backdrop').hidden = true; } }, 280);
    if (runner.job && ['done', 'error'].includes(runner.job.phase) && Date.now() - (runner.job.finishedAt || runner.job.startedAt) > 3000) {
      if (runner.job.phase === 'done') runner.dismiss();
    }
    renderRunChip();
  }
  $('sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && runner.sheetOpen) closeSheet(); });

  // Trascina verso il basso per chiudere
  (() => {
    const sheet = $('sheet');
    let y0 = null;
    let dy = 0;
    sheet.addEventListener('touchstart', (e) => {
      if (sheet.scrollTop > 0 || e.target.closest('input, textarea')) return;
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      if (y0 === null) return;
      sheet.style.transform = '';
      if (dy > 90) closeSheet();
      y0 = null;
    });
  })();

  const elapsedText = () => {
    const s = Math.max(0, Math.round((Date.now() - (runner.job?.startedAt || Date.now())) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  function updateElapsed() {
    const el = $('sheet-elapsed');
    if (el) el.textContent = elapsedText();
  }

  function renderSheet() {
    const body = $('sheet-body');
    const job = runner.job;
    const cfg = ghConfig();

    if (sheetMode === 'setup' || (!job && !cfg.token)) {
      body.innerHTML = `
        <h2 id="sheet-title">Collega l'app a GitHub</h2>
        <p>Per aggiornare l'edizione dal telefono, l'app deve poter avviare il lavoro su GitHub. Serve una sola volta.</p>
        <ol class="steps-howto">
          <li>Apri la <a href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">pagina di creazione del token</a>: nome e permessi sono già compilati.</li>
          <li>In <em>Repository access</em> scegli <em>Only select repositories</em> e seleziona <b>${esc(cfg.repo || 'il repository dell\'app')}</b>. Poi premi <em>Generate token</em> e copialo.</li>
          <li>Incollalo qui sotto e premi <em>Collega</em>.</li>
        </ol>
        <label class="lbl" for="sheet-token">Token</label>
        <input class="field" id="sheet-token" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
        ${cfg.owner ? '' : `
          <label class="lbl" for="sheet-owner">Utente GitHub</label>
          <input class="field" id="sheet-owner" autocomplete="off" autocapitalize="off" spellcheck="false">
          <label class="lbl" for="sheet-repo">Repository</label>
          <input class="field" id="sheet-repo" autocomplete="off" autocapitalize="off" spellcheck="false">`}
        <div class="sheet-actions">
          <button class="btn primary" id="sheet-connect">Collega e aggiorna</button>
          <button class="text-link" id="sheet-close">Annulla</button>
        </div>`;
      $('sheet-close').onclick = closeSheet;
      $('sheet-connect').onclick = async (e) => {
        const btn = e.currentTarget;
        const next = {
          owner: cfg.owner || $('sheet-owner')?.value.trim(),
          repo: cfg.repo || $('sheet-repo')?.value.trim(),
          token: $('sheet-token').value.trim(),
        };
        if (!next.token || !next.owner || !next.repo) return toast('Compila tutti i campi');
        btn.disabled = true;
        try {
          const res = await gh(next, '');
          if (!res.ok) throw ghError('Il token non vede questo repository: controlla di averlo selezionato.', 'token');
          save(KEYS.github, next);
          sheetMode = 'run';
          runner.start();
        } catch (err) {
          toast(err.message);
        } finally {
          btn.disabled = false;
        }
      };
      return;
    }

    if (!job) {
      body.innerHTML = `
        <h2 id="sheet-title">Aggiorna l'edizione</h2>
        <p>Crea adesso il giornale e la lezione di oggi, senza aspettare l'aggiornamento automatico. Ci vogliono circa 2-4 minuti.</p>
        <div class="run-options">
          <label class="check"><input type="radio" name="run-only" value="tutto" checked><span>Giornale e lezione</span></label>
          <label class="check"><input type="radio" name="run-only" value="news"><span>Solo il giornale</span></label>
          <label class="check"><input type="radio" name="run-only" value="lesson"><span>Solo la lezione</span></label>
          <label class="check"><input type="checkbox" id="run-force"><span>Sostituisci la lezione di oggi con una nuova</span></label>
          <label class="check"><input type="checkbox" id="run-series"><span>Inizia un nuovo percorso di più lezioni</span></label>
        </div>
        <div class="sheet-actions">
          <button class="btn primary" id="sheet-run">${icon.refresh}Avvia</button>
          <button class="text-link" id="sheet-close">Annulla</button>
        </div>`;
      $('sheet-close').onclick = closeSheet;
      $('sheet-run').onclick = () => runner.start({
        only: body.querySelector('[name="run-only"]:checked').value,
        force: $('run-force').checked,
        newSeries: $('run-series').checked,
      });
      return;
    }

    const order = PHASES.map(([k]) => k);
    const at = order.indexOf(job.phase === 'error' ? job.failedAt || 'start' : job.phase);
    const title = job.phase === 'done' ? 'La nuova edizione è pronta'
      : job.phase === 'error' ? 'Aggiornamento non riuscito'
      : 'Aggiornamento in corso';
    body.innerHTML = `
      <h2 id="sheet-title">${title}</h2>
      ${job.phase === 'error' ? `<p class="sheet-error">${esc(job.error)}</p>` : runner.active()
        ? `<p>Puoi chiudere questa finestra e continuare a leggere: ti avviso quando è pronta. <span class="elapsed" id="sheet-elapsed">${elapsedText()}</span></p>`
        : `<p>${job.partial ? 'Una parte non è riuscita, ma quello che è stato generato è già pubblicato.' : 'Notizie e lezione sono pubblicate.'}</p>`}
      <ol class="phases">
        ${PHASES.map(([k, label], i) => {
          const cls = i < at ? 'is-done'
            : i === at ? (job.phase === 'error' ? 'is-failed' : k === 'done' ? 'is-done' : 'is-active')
            : '';
          const detail = k === 'running' && job.phase === 'running' && job.step ? job.step
            : k === 'publish' && job.phase === 'publish' ? 'GitHub Pages aggiorna il sito, di solito in 1-2 minuti'
            : k === 'queued' && job.phase === 'queued' ? 'GitHub assegna una macchina, pochi secondi'
            : '';
          return `<li class="${cls}"><span class="ph-dot"></span><span class="ph-text">${label}${detail ? `<small>${esc(detail)}</small>` : ''}</span></li>`;
        }).join('')}
      </ol>
      <div class="sheet-actions">
        ${job.phase === 'done' ? '<button class="btn primary" id="sheet-open">Apri l\'edizione</button>' : ''}
        ${job.phase === 'error' && job.errorKind === 'token' ? `<a class="btn primary" href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">Crea un nuovo token</a>` : ''}
        ${job.phase === 'error' && job.errorKind !== 'token' ? '<button class="btn primary" id="sheet-retry">Riprova</button>' : ''}
        ${job.htmlUrl ? `<a class="text-link" href="${esc(job.htmlUrl)}" target="_blank" rel="noopener noreferrer">Dettagli su GitHub</a>` : ''}
        ${job.phase === 'error' && job.errorKind === 'token' ? '<button class="text-link" id="sheet-newtoken">Incolla il nuovo token</button>' : ''}
        <button class="text-link" id="sheet-close">${runner.active() ? 'Continua a leggere' : 'Chiudi'}</button>
      </div>`;
    $('sheet-close').onclick = closeSheet;
    const open = $('sheet-open');
    if (open) open.onclick = () => { runner.dismiss(); closeSheet(); clearMemo(); location.hash = '#/news'; route(); };
    const retry = $('sheet-retry');
    if (retry) retry.onclick = () => { const opts = job.opts; runner.job = null; runner.start(opts); };
    const newToken = $('sheet-newtoken');
    if (newToken) newToken.onclick = () => { runner.job = null; save(KEYS.run, null); const c = load(KEYS.github, {}); delete c.token; save(KEYS.github, c); openSheet('setup'); };
  }

  /* ---------- Impostazioni ---------- */
  async function renderSettings() {
    const remote = await getTopics().catch(() => ({
      categories: DEFAULT_TOPICS.map((name) => ({ id: slug(name), name, enabled: true })),
    }));
    let topics = load(KEYS.topicsDraft, null) || structuredClone(remote.categories);
    const gh0 = ghConfig();
    const dirty = () => JSON.stringify(topics) !== JSON.stringify(remote.categories);

    $view.innerHTML = `
      <section class="settings">
        <h1>Impostazioni</h1>

        <div class="group">
          <div class="group-head">
            <h2>Edizione</h2>
            <span class="pill" id="gh-pill"></span>
          </div>
          <p>L'edizione arriva da sola ogni mattina. Se non è arrivata, o vuoi una nuova lezione, puoi crearla adesso.</p>
          <div class="row">
            <button class="btn primary" data-action="run">${icon.refresh}Aggiorna l'edizione</button>
          </div>
        </div>

        <div class="group">
          <h2>Aspetto</h2>
          <p>Il tema automatico segue le impostazioni del telefono.</p>
          <div class="segmented" role="group" aria-label="Tema">
            ${[['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([k, l]) => `
              <button data-theme-set="${k}" class="${prefs.theme === k ? 'is-on' : ''}">${l}</button>`).join('')}
          </div>
          <label class="lbl">Dimensione del testo</label>
          <div class="segmented" role="group" aria-label="Dimensione del testo">
            ${[[0.94, 'Piccolo'], [1, 'Normale'], [1.08, 'Grande'], [1.16, 'Extra']].map(([k, l]) => `
              <button data-scale="${k}" class="${Number(prefs.textScale) === k ? 'is-on' : ''}">${l}</button>`).join('')}
          </div>
        </div>

        <div class="group">
          <h2>Argomenti delle lezioni</h2>
          <p>Ogni mattina la lezione arriva da una di queste categorie, a rotazione e senza mai ripetere un argomento. Ogni due o tre settimane arriva un percorso di più lezioni collegate. Tocca una categoria per attivarla o disattivarla.</p>
          <div class="topic-list" id="topics"></div>
          <div class="row">
            <label class="sr-only" for="new-topic">Nuova categoria</label>
            <input class="field" id="new-topic" placeholder="Aggiungi una categoria, per esempio Fotografia" maxlength="60" enterkeyhint="done">
            <button class="btn" data-action="add-topic">Aggiungi</button>
          </div>
          <div class="notice" id="topics-status" role="status"></div>
        </div>

        <div class="group" id="github">
          <h2>Collegamento a GitHub</h2>
          <p>Facoltativo. Serve per due cose: <b>aggiornare l'edizione</b> dal telefono e <b>salvare le categorie</b> qui sopra, che altrimenti restano solo su questo dispositivo.</p>
          <p class="hint">Non ha niente a che fare con la chiave di Gemini, che resta nei Secrets di GitHub e l'app non vede mai.</p>

          <details class="howto" ${gh0.token ? '' : 'open'}>
            <summary>Come ottenere il token (2 minuti)</summary>
            <ol>
              <li>Apri la <a href="${TOKEN_URL}" target="_blank" rel="noopener noreferrer">pagina di creazione del token</a>: nome e permessi (<em>Contents</em> e <em>Actions</em> in lettura e scrittura) sono già compilati.</li>
              <li>In <em>Repository access</em> scegli <em>Only select repositories</em> e seleziona solo il repository dell'app.</li>
              <li>Premi <em>Generate token</em>, copialo e incollalo qui sotto.</li>
            </ol>
            <p class="hint">Il token può agire solo su quel repository e resta salvato solo su questo dispositivo. Puoi revocarlo quando vuoi dalle impostazioni di GitHub.</p>
          </details>

          <label class="lbl" for="gh-owner">Utente GitHub</label>
          <input class="field" id="gh-owner" value="${esc(gh0.owner)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <label class="lbl" for="gh-repo">Repository</label>
          <input class="field" id="gh-repo" value="${esc(gh0.repo)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <label class="lbl" for="gh-token">Token</label>
          <input class="field" id="gh-token" type="password" value="${esc(gh0.token || '')}" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
          <div class="row" style="margin-top:1rem">
            <button class="btn primary" data-action="connect">Collega</button>
            <button class="btn" data-action="push-topics">Salva le categorie</button>
            <button class="text-link" data-action="disconnect">Scollega</button>
          </div>
        </div>

        <div class="group">
          <h2>I tuoi dati</h2>
          <p>Letture, preferiti e streak sono salvati su questo dispositivo. Puoi esportarli come copia di sicurezza.</p>
          <div class="row">
            <button class="btn" data-action="export">Esporta</button>
            <label class="btn" for="import-file">Importa</label>
            <input type="file" id="import-file" accept="application/json" hidden>
          </div>
        </div>
      </section>`;

    const $topics = $('topics');
    const $status = $('topics-status');
    const drawTopics = () => {
      $topics.innerHTML = topics.map((t, i) => `
        <span class="topic ${t.enabled ? 'is-on' : ''}" role="button" tabindex="0" data-i="${i}" aria-pressed="${t.enabled}">
          ${esc(t.name)}
          <span class="x" data-remove="${i}" role="button" aria-label="Rimuovi ${esc(t.name)}">×</span>
        </span>`).join('');
      const on = topics.filter((t) => t.enabled).length;
      const count = `${on} categorie attive su ${topics.length}.`;
      $status.classList.toggle('is-warn', dirty());
      if (!dirty()) {
        $status.textContent = count;
      } else if (ghConnected()) {
        $status.innerHTML = `${count} Hai modifiche non salvate: premi <a href="#github" data-jump>Salva le categorie</a> per farle valere dalla prossima lezione.`;
      } else {
        $status.innerHTML = `${count} Le modifiche sono solo su questo dispositivo e non cambiano ancora le lezioni. Per farle valere <a href="#github" data-jump>collega GitHub</a>.`;
      }
      if (dirty()) save(KEYS.topicsDraft, topics); else localStorage.removeItem(KEYS.topicsDraft);
    };

    const drawConnection = () => {
      const connected = ghConnected();
      const pill = $('gh-pill');
      pill.textContent = connected ? 'Collegato a GitHub' : 'Non collegato';
      pill.classList.toggle('is-on', connected);
      $view.querySelector('[data-action="disconnect"]').hidden = !connected;
      $view.querySelector('[data-action="connect"]').textContent = connected ? 'Aggiorna collegamento' : 'Collega';
    };
    drawTopics();
    drawConnection();

    const readCfg = () => ({
      owner: $('gh-owner').value.trim(),
      repo: $('gh-repo').value.trim(),
      token: $('gh-token').value.trim(),
    });

    // I link "#github" scorrono alla sezione senza cambiare pagina
    $status.addEventListener('click', (e) => {
      if (!e.target.closest('[data-jump]')) return;
      e.preventDefault();
      const target = $('github');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!ghConnected()) target.querySelector('.howto').open = true;
    });

    $view.querySelector('[data-action="connect"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const cfg = readCfg();
      if (!cfg.owner || !cfg.repo || !cfg.token) return toast(!cfg.token ? 'Incolla il token: vedi "Come ottenere il token"' : 'Inserisci utente e repository');
      btn.disabled = true;
      try {
        const res = await gh(cfg, '');
        if (!res.ok) throw ghError('Il token non vede questo repository: controlla di averlo selezionato.');
        save(KEYS.github, cfg);
        drawConnection();
        drawTopics();
        toast('Collegato a GitHub');
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    $view.querySelector('[data-action="disconnect"]').addEventListener('click', () => {
      const cfg = load(KEYS.github, {});
      delete cfg.token;
      save(KEYS.github, cfg);
      $('gh-token').value = '';
      drawConnection();
      drawTopics();
      toast('App scollegata da GitHub');
    });

    $topics.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        topics.splice(Number(rm.dataset.remove), 1);
        return drawTopics();
      }
      const t = e.target.closest('[data-i]');
      if (t) {
        const item = topics[Number(t.dataset.i)];
        if (item.enabled && topics.filter((x) => x.enabled).length === 1) return toast('Serve almeno una categoria attiva');
        item.enabled = !item.enabled;
        drawTopics();
      }
    });
    $topics.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-i]')) { e.preventDefault(); e.target.click(); }
    });

    const $new = $('new-topic');
    const addTopic = () => {
      const name = $new.value.trim();
      if (!name) return;
      const id = slug(name);
      if (!id || topics.some((t) => t.id === id)) return toast('Categoria già presente');
      topics.push({ id, name, enabled: true });
      $new.value = '';
      drawTopics();
    };
    $view.querySelector('[data-action="add-topic"]').addEventListener('click', addTopic);
    $new.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTopic(); });

    $view.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
      prefs.theme = b.dataset.themeSet;
      save(KEYS.prefs, prefs);
      applyPrefs();
      $view.querySelectorAll('[data-theme-set]').forEach((x) => x.classList.toggle('is-on', x === b));
    }));
    $view.querySelectorAll('[data-scale]').forEach((b) => b.addEventListener('click', () => {
      prefs.textScale = Number(b.dataset.scale);
      save(KEYS.prefs, prefs);
      applyPrefs();
      $view.querySelectorAll('[data-scale]').forEach((x) => x.classList.toggle('is-on', x === b));
    }));

    $view.querySelector('[data-action="push-topics"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const cfg = readCfg();
      if (!cfg.owner || !cfg.repo || !cfg.token) {
        $('github').querySelector('.howto').open = !cfg.token;
        return toast(!cfg.token ? 'Incolla il token: vedi "Come ottenere il token"' : 'Inserisci utente e repository');
      }
      btn.disabled = true;
      try {
        await pushTopics(cfg, { ...remote, updatedAt: isoDay(), categories: topics });
        // Il token viene salvato solo se funziona
        save(KEYS.github, cfg);
        remote.categories = structuredClone(topics);
        memo['data/topics.json'] = { ...remote };
        drawConnection();
        drawTopics();
        toast('Categorie salvate. Valgono dalla prossima lezione');
      } catch (err) {
        console.error(err);
        toast(err.message || 'Salvataggio non riuscito');
      } finally {
        btn.disabled = false;
      }
    });

    $view.querySelector('[data-action="export"]').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ state, prefs }, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `quotidie-${isoDay()}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.state) throw new Error();
        state.read = { ...state.read, ...data.state.read };
        state.favs = { ...state.favs, ...data.state.favs };
        state.readDays = [...new Set([...state.readDays, ...(data.state.readDays || [])])].sort();
        persist();
        toast('Dati importati');
      } catch {
        toast('File non valido: usa un file creato con Esporta');
      }
    });
  }

  /* ---------- Ascolto (Audio neurale MP3 + fallback sintesi vocale) ---------- */
  // Nome della voce dell'audio, letto da data/audio/index.json (scritto dal workflow)
  let audioVoices = {};
  fetch(`data/audio/index.json?v=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { audioVoices = d?.files || {}; })
    .catch(() => {});
  const VOICE_NAMES = { ryan: 'Ryan', eric: 'Eric', aiden: 'Aiden', dylan: 'Dylan', serena: 'Serena', vivian: 'Vivian' };
  const voiceLabel = (url) => {
    const meta = audioVoices[String(url || '').split('/').pop()];
    if (!meta) return 'Voce';
    if (meta.engine === 'qwen3-tts') return `Voce ${VOICE_NAMES[meta.voice] || meta.voice}`;
    const m = /-([A-Z][a-z]+)(?:Multilingual)?Neural$/.exec(meta.voice || '');
    return `Voce ${m ? m[1] : 'rapida'}`;
  };

  const speech = (() => {
    const synth = window.speechSynthesis;
    const $player = $('player');
    const audio = new Audio();
    audio.preload = 'metadata';

    let mode = 'idle'; // 'audio' | 'synth' | 'idle'
    let queue = [];
    let pos = 0;
    let playing = false;
    let opts = {};
    let voice = null;
    let token = 0;

    const fmtTime = (s) => {
      if (!s || isNaN(s) || s < 0) return '0:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const setupMediaSession = () => {
      if (!('mediaSession' in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: opts.title || 'Quotidie',
        artist: `Quotidie — ${voiceLabel(audio.currentSrc || audio.src)}`,
        album: opts.sub || 'Rassegna vocale',
        artwork: [
          { src: 'assets/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
      navigator.mediaSession.setActionHandler('play', () => { if (mode === 'audio') audio.play(); else toggle(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (mode === 'audio') audio.pause(); else toggle(); });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        if (mode === 'audio') audio.currentTime = Math.max(0, audio.currentTime - 15);
        else speakAt(pos - 1);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (mode === 'audio') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
        else speakAt(pos + 1);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (mode === 'audio' && details.seekTime != null) audio.currentTime = details.seekTime;
      });
    };

    // Eventi audio HTML5
    audio.addEventListener('play', () => {
      playing = true;
      $player.classList.add('is-playing');
      $player.querySelector('[data-player="toggle"]').setAttribute('aria-label', 'Pausa');
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
    audio.addEventListener('pause', () => {
      playing = false;
      $player.classList.remove('is-playing');
      $player.querySelector('[data-player="toggle"]').setAttribute('aria-label', 'Riprendi');
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    });
    audio.addEventListener('timeupdate', () => {
      if (mode !== 'audio') return;
      const cur = audio.currentTime;
      const dur = audio.duration;
      if (dur > 0) {
        $('player-progress').style.transform = `scaleX(${Math.min(1, cur / dur)})`;
        const left = dur - cur;
        $('player-sub').textContent = `${fmtTime(left)} rimanenti • ${voiceLabel(audio.currentSrc || audio.src)}`;
      }
    });
    audio.addEventListener('ended', () => {
      stop();
      if (opts.onEnd) opts.onEnd();
    });
    audio.addEventListener('error', () => {
      if (mode === 'audio' && queue.length) {
        console.warn('Audio MP3 non disponibile o errore, passo a sintesi vocale');
        playSynth(queue, opts);
      }
    });

    const pickVoice = () => {
      const voices = synth ? synth.getVoices() : [];
      const it = voices.filter((v) => /^it(-|_|$)/i.test(v.lang));
      voice = it.find((v) => /premium|enhanced|alice|federica|luca/i.test(v.name)) || it.find((v) => v.localService) || it[0] || null;
    };
    if (synth) {
      pickVoice();
      synth.addEventListener?.('voiceschanged', pickVoice);
    }

    const split = (parts) => parts
      .filter(Boolean)
      .map((p) => plain(p).replace(/\s+/g, ' ').trim())
      .flatMap((p) => p.match(/[^.!?;:]+[.!?;:]+["»”]?|[^.!?;:]+$/g) || [])
      .map((s) => s.trim())
      .filter((s) => s.length > 1)
      .flatMap((s) => {
        if (s.length <= 220) return [s];
        const out = [];
        let cur = '';
        for (const w of s.split(/(?<=,)\s+|\s+/)) {
          if ((cur + ' ' + w).length > 200 && cur) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
        }
        if (cur) out.push(cur);
        return out;
      });

    const ui = () => {
      const active = mode !== 'idle';
      $player.hidden = !active;
      document.body.classList.toggle('has-player', active);
      if (!active) return;
      $('player-title').textContent = opts.title || 'Ascolto';
      if (mode === 'audio') {
        $('player-sub').textContent = 'Caricamento audio...';
      } else {
        const left = queue.slice(pos).join(' ');
        $('player-sub').textContent = playing ? `Circa ${minutes(words(left))} min rimanenti` : 'In pausa';
        $('player-progress').style.transform = `scaleX(${queue.length ? pos / queue.length : 0})`;
      }
      $player.classList.toggle('is-playing', playing);
      $player.querySelector('[data-player="toggle"]').setAttribute('aria-label', playing ? 'Pausa' : 'Riprendi');
    };

    const speakAt = (i) => {
      const my = ++token;
      if (synth) synth.cancel();
      pos = Math.max(0, Math.min(i, queue.length));
      if (pos >= queue.length) {
        const done = opts.onEnd;
        stop();
        if (done) done();
        return;
      }
      const u = new SpeechSynthesisUtterance(queue[pos]);
      u.lang = 'it-IT';
      if (voice) u.voice = voice;
      u.rate = 1;
      u.onend = () => { if (my === token && playing) speakAt(pos + 1); };
      u.onerror = (e) => { if (my === token && playing && e.error !== 'interrupted' && e.error !== 'canceled') speakAt(pos + 1); };
      playing = true;
      ui();
      synth.speak(u);
    };

    function playSynth(parts, o) {
      mode = 'synth';
      queue = split(parts);
      opts = o;
      if (!queue.length) return;
      if (!voice) pickVoice();
      speakAt(0);
    }

    async function play(parts, o = {}) {
      stop();
      opts = o;
      queue = split(parts);

      if (o.audioUrl) {
        try {
          mode = 'audio';
          playing = true;
          ui();
          audio.src = o.audioUrl;
          await audio.play();
          setupMediaSession();
          return;
        } catch (err) {
          console.warn('Impossibile riprodurre audioUrl primario, provo fallback:', err.message);
          if (o.fallbackAudioUrl) {
            try {
              audio.src = o.fallbackAudioUrl;
              await audio.play();
              setupMediaSession();
              return;
            } catch (e2) {}
          }
          playSynth(parts, o);
          return;
        }
      }

      playSynth(parts, o);
    }

    function toggle() {
      if (mode === 'audio') {
        if (audio.paused) audio.play(); else audio.pause();
        return;
      }
      if (!queue.length) return;
      if (playing) { playing = false; token++; if (synth) synth.cancel(); ui(); } else speakAt(pos);
    }

    function stop() {
      token++;
      playing = false;
      mode = 'idle';
      queue = [];
      pos = 0;
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      if (synth) synth.cancel();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
      ui();
    }

    $player.addEventListener('click', (e) => {
      const b = e.target.closest('[data-player]');
      if (b) {
        const a = b.dataset.player;
        if (a === 'toggle') toggle();
        if (a === 'close') stop();
        if (a === 'prev') {
          if (mode === 'audio') audio.currentTime = Math.max(0, audio.currentTime - 15);
          else speakAt(pos - 1);
        }
        if (a === 'next') {
          if (mode === 'audio') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
          else speakAt(pos + 1);
        }
        return;
      }

      const bar = e.target.closest('.player-bar');
      if (bar && mode === 'audio' && audio.duration > 0) {
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = ratio * audio.duration;
      }
    });

    window.addEventListener('pagehide', stop);
    return { play, stop };
  })();

  /* ---------- Azioni globali ---------- */
  $view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, date } = el.dataset;
    if (action === 'reload') {
      clearMemo();
      route();
    } else if (action === 'run') {
      runner.active() || ghConnected() ? openSheet() : openSheet('setup');
    } else if (action === 'read') {
      markRead(date, !state.read[date]);
      syncReadButton(date);
    } else if (action === 'fav') {
      const on = toggleFav(date);
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-pressed', on);
      el.querySelector('span').textContent = on ? 'Nei preferiti' : 'Aggiungi ai preferiti';
      toast(on ? 'Aggiunta ai preferiti' : 'Rimossa dai preferiti');
    }
  });

  /* ---------- Tema, scroll, tab bar ---------- */
  function applyPrefs() {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.style.setProperty('--text-scale', prefs.textScale);
    const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    $('theme-color').setAttribute('content', dark ? '#13151F' : '#F5F1E8');
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPrefs);

  function moveTabIndicator() {
    const active = document.querySelector('.tabbar a.is-active');
    const ind = document.querySelector('.tab-indicator');
    if (!ind) return;
    ind.style.opacity = active ? '1' : '0';
    if (active) ind.style.transform = `translateX(${active.offsetLeft + active.offsetWidth / 2 - 14}px)`;
  }
  window.addEventListener('resize', moveTabIndicator);

  let ticking = false;
  function updateProgress() {
    const y = window.scrollY;
    $topbar.classList.toggle('is-scrolled', y > 8);
    const tracked = !location.hash || /^#\/?(news|learn)(\/|$)/.test(location.hash);
    const max = document.documentElement.scrollHeight - innerHeight;
    $progress.style.transform = `scaleX(${tracked && max > 0 ? Math.min(1, y / max) : 0})`;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });

  // Tira giù per aggiornare (Giornale e Impara)
  (() => {
    const $ptr = $('ptr');
    let y0 = null;
    let dy = 0;
    const limit = 70;
    window.addEventListener('touchstart', (e) => {
      if (window.scrollY > 0 || runner.sheetOpen || !['news', 'learn'].includes(currentView)) return;
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0 || window.scrollY > 0) { $ptr.style.transform = ''; $ptr.classList.remove('is-ready'); return; }
      const d = Math.min(limit * 1.4, dy * 0.5);
      $ptr.style.transform = `translate(-50%, ${d}px) rotate(${d * 4}deg)`;
      $ptr.style.opacity = Math.min(1, d / limit);
      $ptr.classList.toggle('is-ready', d >= limit * 0.9);
    }, { passive: true });
    window.addEventListener('touchend', async () => {
      if (y0 === null) return;
      const ready = $ptr.classList.contains('is-ready');
      y0 = null;
      if (!ready) { $ptr.style.transform = ''; $ptr.style.opacity = 0; return; }
      $ptr.classList.add('is-loading');
      clearMemo();
      await route();
      $ptr.classList.remove('is-loading', 'is-ready');
      $ptr.style.transform = '';
      $ptr.style.opacity = 0;
    });
  })();

  // Quando l'app torna in primo piano in un nuovo giorno, ricarica
  let lastDay = isoDay();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    runner.resume();
    if (isoDay() !== lastDay) {
      lastDay = isoDay();
      clearMemo();
      route();
    }
  });

  /* ---------- Icone e manifest (dentro i file dell'app) ---------- */
  function installIcons() {
    const symbol = $('logo-mark');
    const svg = (rounded) => {
      const inner = symbol.innerHTML
        .replace(/var\(--logo-bg\)/g, '#1D2033')
        .replace(/var\(--logo-line\)/g, '#F5F1E8')
        .replace(/var\(--logo-sun\)/g, '#F0A35E')
        .replace('rx="15"', rounded ? 'rx="15"' : 'rx="0"');
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${inner}</svg>`;
    };
    const addLink = (rel, href, extra = {}) => {
      document.head.appendChild(Object.assign(document.createElement('link'), { rel, href }, extra));
    };
    addLink('icon', 'data:image/svg+xml,' + encodeURIComponent(svg(true)), { type: 'image/svg+xml' });

    // iOS vuole un PNG quadrato pieno: gli angoli li arrotonda il sistema
    const img = new Image();
    img.onload = () => {
      const png = (size) => {
        const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
        c.getContext('2d').drawImage(img, 0, 0, size, size);
        return c.toDataURL('image/png');
      };
      const icon180 = png(180);
      addLink('apple-touch-icon', icon180);
      const manifest = {
        name: 'Quotidie', short_name: 'Quotidie', display: 'standalone',
        start_url: location.href.split('#')[0].split('?')[0], background_color: '#F5F1E8', theme_color: '#1D2033',
        icons: [{ src: icon180, sizes: '180x180', type: 'image/png' }, { src: png(512), sizes: '512x512', type: 'image/png' }],
      };
      addLink('manifest', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest)));
    };
    img.src = 'data:image/svg+xml,' + encodeURIComponent(svg(false));
  }

  /* ---------- Offline ---------- */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'activated' && navigator.serviceWorker.controller) toast('App aggiornata alla nuova versione');
        });
      });
    }).catch((err) => console.warn('Service worker non registrato', err));
  }

  installIcons();
  applyPrefs();
  registerServiceWorker();
  renderRunChip();
  runner.resume();
  window.addEventListener('hashchange', route);
  route();
})();
