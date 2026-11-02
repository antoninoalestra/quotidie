/* =========================================================
   Quotidie — logica dell'app
   Dati: file JSON generati ogni mattina da GitHub Actions (data/).
   Stato personale (letto, preferiti, streak, preferenze): localStorage.
   ========================================================= */
(() => {
  'use strict';

  const TZ = 'Europe/Rome';
  const WPM = 200; // parole al minuto, lettura in italiano
  const KEYS = {
    state: 'qd.state',
    prefs: 'qd.prefs',
    cache: 'qd.cache',
    topicsDraft: 'qd.topicsDraft',
    github: 'qd.github',
  };

  // Categorie iniziali delle lezioni: la GitHub Action usa le stesse se data/topics.json non esiste ancora
  const DEFAULT_TOPICS = [
    'Intelligenza artificiale', 'Informatica', 'Architettura software', 'Cybersecurity', 'Finanza personale',
    'Mercati finanziari', 'Macroeconomia', 'Economia comportamentale', 'Storia', "Storia dell'arte", 'Filosofia',
    'Psicologia', 'Neuroscienze', 'Fisica', 'Astronomia', 'Biologia', 'Medicina e salute', 'Chimica', 'Matematica',
    'Geopolitica', 'Linguistica ed etimologia', 'Letteratura', 'Musica', 'Design', 'Architettura', 'Cinema',
    'Gastronomia e vino', 'Produttività e metodo', 'Negoziazione e comunicazione', 'Retorica e pensiero critico',
    'Grandi invenzioni', 'Ecologia e clima', 'Diritto per tutti', 'Mitologia',
  ];
  const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const $view = document.getElementById('view');
  const $topbar = document.getElementById('topbar');
  const $progress = document.getElementById('progress-bar');
  const $toast = document.getElementById('toast');

  /* ---------- Utilità ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Testo generato → HTML sicuro: escape, poi solo **grassetto** e *corsivo*
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');

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

  const fromIso = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  };
  const addDays = (iso, n) => {
    const d = fromIso(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const fmt = (iso, opts) => new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', ...opts }).format(fromIso(iso));
  const longDate = (iso) => {
    const s = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const words = (s) => (String(s ?? '').match(/\S+/g) || []).length;
  const minutes = (n) => Math.max(1, Math.round(n / WPM));

  let toastTimer;
  const toast = (msg) => {
    $toast.textContent = msg;
    $toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('is-on'), 2600);
  };

  const icon = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z"/></svg>',
    starSolid: '<svg class="star" viewBox="0 0 24 24" aria-label="Preferito"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.8Z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    logo: '<svg aria-hidden="true"><use href="#logo-mark"/></svg>',
  };

  /* ---------- Stato personale ---------- */
  const state = Object.assign({ read: {}, favs: {}, readDays: [] }, load(KEYS.state, {}));
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
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      const data = await res.json();
      memo[path] = data;
      cache[path] = data;
      // In cache solo l'indice, le notizie e le ultime lezioni, per restare leggeri
      const keep = Object.keys(cache).filter((k) => !k.includes('/lessons/2')).concat(
        Object.keys(cache).filter((k) => k.includes('/lessons/2')).sort().slice(-5)
      );
      save(KEYS.cache, Object.fromEntries(keep.map((k) => [k, cache[k]])));
      return data;
    } catch (err) {
      if (cache[path]) { memo[path] = cache[path]; return cache[path]; }
      throw err;
    }
  }

  const getNews = () => getJSON('data/news/latest.json');
  const getIndex = () => getJSON('data/lessons/index.json').then((d) => d.lessons || []);
  const getLesson = (date) => getJSON(`data/lessons/${date}.json`);
  const getTopics = () => getJSON('data/topics.json');

  /* ---------- Router ---------- */
  const routes = {
    news: renderNews,
    learn: renderLearn,
    settings: renderSettings,
  };

  let cleanup = [];
  async function route() {
    cleanup.forEach((fn) => fn());
    cleanup = [];

    // Vecchio indirizzo dello storico, ora dentro Impara
    if (/^#\/?archive/.test(location.hash)) return location.replace('#/learn/storico');

    const [name = 'news', param] = location.hash.replace(/^#\/?/, '').split('/');
    const view = routes[name] ? name : 'news';
    const tab = view;

    document.querySelectorAll('[data-tab]').forEach((a) => {
      a.classList.toggle('is-active', a.dataset.tab === tab);
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });

    $view.innerHTML = skeleton();
    window.scrollTo(0, 0);
    try {
      await routes[view](param);
    } catch (err) {
      console.error(err);
      $view.innerHTML = err.status === 404
        ? emptyState(
          'Nessuna edizione ancora',
          'La prima edizione arriva domattina. Per averla subito, su GitHub apri Actions, scegli "Edizione del mattino" e premi Run workflow.',
          '<button class="text-link" data-action="reload">Controlla di nuovo</button>'
        )
        : emptyState(
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

  const skeleton = () => `
    <div class="loading" aria-label="Caricamento">
      <div class="skeleton" style="height:14px;width:40%"></div>
      <div class="skeleton" style="height:48px;width:85%"></div>
      <div class="skeleton" style="height:48px;width:60%;margin-bottom:2rem"></div>
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

  /* ---------- Giornale ---------- */
  async function renderNews() {
    const news = await getNews();
    const today = isoDay();
    const sections = news.sections || [];

    const allText = [
      ...(news.brief || []),
      ...sections.flatMap((s) => s.stories.flatMap((st) => [st.title, st.summary, st.why])),
    ].join(' ');
    const mins = minutes(words(allText));
    const storyCount = sections.reduce((n, s) => n + s.stories.length, 0);

    let staleNote = '';
    if (news.date !== today) {
      staleNote = news.date === addDays(today, -1)
        ? '<span class="stale">Edizione di ieri</span>'
        : `<span class="stale">Edizione del ${esc(fmt(news.date, { day: 'numeric', month: 'long' }))}</span>`;
    }

    $view.innerHTML = `
      <header class="masthead">
        <div class="dateline">
          <span>${esc(longDate(news.date))}</span>
          <span>${storyCount} notizie in ${mins} minuti</span>
          ${staleNote}
        </div>
        <h1>${greeting()}</h1>
        <div class="dawn" aria-hidden="true"></div>
        ${news.brief?.length ? `
          <ul class="brief" aria-label="In breve">
            ${news.brief.map((b) => `<li>${inline(b)}</li>`).join('')}
          </ul>` : ''}
      </header>
      <div class="desks">
        ${sections.map(renderDesk).join('')}
      </div>`;
  }

  function greeting() {
    const h = Number(new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
    if (h < 5) return 'Buona notte, <em>ecco il mondo</em>';
    if (h < 13) return 'Buongiorno, <em>ecco il mondo</em>';
    if (h < 18) return 'Buon pomeriggio, <em>ecco il mondo</em>';
    return 'Buonasera, <em>ecco il mondo</em>';
  }

  function renderDesk(section) {
    return `
      <section class="desk" aria-labelledby="desk-${esc(section.id)}">
        <div class="desk-head">
          <h2 id="desk-${esc(section.id)}">${esc(section.title)}</h2>
          <span class="meta">${section.stories.length} notizie</span>
        </div>
        ${section.stories.map(renderStory).join('')}
      </section>`;
  }

  function renderStory(story) {
    const sources = (story.sources || [])
      .map((s) => ({ ...s, url: safeUrl(s.url) }))
      .filter((s) => s.url)
      .slice(0, 3);
    return `
      <article class="story">
        <h3>${inline(story.title)}</h3>
        ${paragraphs(story.summary)}
        ${story.why ? `<p class="why">${inline(story.why)}</p>` : ''}
        ${sources.length ? `
          <div class="sources">
            ${sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || new URL(s.url).hostname)} ↗</a>`).join('')}
          </div>` : ''}
      </article>`;
  }

  /* ---------- Impara: lezione di oggi + storico ---------- */
  async function renderLearn(param) {
    const index = await getIndex();
    if (!index.length) {
      $view.innerHTML = emptyState('Nessuna lezione ancora', 'La prima lezione arriva con la prossima edizione del mattino.');
      return;
    }
    const onArchive = param === 'storico';
    const isPast = !onArchive && param && param !== index[0].date && index.some((l) => l.date === param);
    const unread = index.filter((l) => !state.read[l.date]).length;
    const subnav = `
      <nav class="subnav" aria-label="Impara">
        <div class="segmented">
          <a href="#/learn" class="${!onArchive && !isPast ? 'is-on' : ''}">Oggi</a>
          <a href="#/learn/storico" class="${onArchive || isPast ? 'is-on' : ''}">Storico${unread ? `<span class="badge" aria-label="${unread} da leggere">${unread}</span>` : ''}</a>
        </div>
      </nav>`;
    if (onArchive) return renderArchive(index, subnav);
    return renderLesson(index, isPast ? param : index[0].date, subnav);
  }

  async function renderLesson(index, target, subnav) {
    const lesson = await getLesson(target);
    const isToday = target === index[0].date;

    const fullText = [
      lesson.hook,
      ...lesson.sections.flatMap((s) => [s.heading, s.body]),
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
        <p class="hook">${inline(lesson.hook)}</p>

        <div class="body">
          ${lesson.sections.map((s) => `
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

    // Segna come letta in automatico quando arrivi in fondo (dopo almeno 20 secondi)
    const opened = Date.now();
    const end = document.getElementById('lesson-end');
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && Date.now() - opened > 20000 && !state.read[target]) {
        markRead(target);
        syncReadButton(target);
        toast(streak() > 1 ? `Lezione completata. Sei a ${streak()} giorni di fila` : 'Lezione completata');
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(end);
    cleanup.push(() => io.disconnect());
  }

  function syncReadButton(date) {
    const btn = $view.querySelector('[data-action="read"]');
    if (!btn) return;
    const on = !!state.read[date];
    btn.classList.toggle('is-on', on);
    btn.querySelector('span').textContent = on ? 'Letta' : 'Segna come letta';
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
    const s = streak();

    // Ultimi 7 giorni per il mini-calendario della streak
    const today = isoDay();
    const days = new Set(state.readDays);
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

    $view.innerHTML = `${subnav}
      <section class="archive">
        <header class="archive-head">
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
        </header>

        <div class="filters">
          <label class="sr-only" for="q">Cerca nello storico</label>
          <input class="search" id="q" type="search" placeholder="Cerca un argomento" value="${esc(archiveFilter.q)}" autocomplete="off">
          <div class="chips" role="group" aria-label="Filtra per stato">
            ${[['all', 'Tutte'], ['unread', 'Da leggere'], ['favs', 'Preferiti']].map(([k, label]) => `
              <button class="chip ${archiveFilter.only === k ? 'is-on' : ''}" data-only="${k}">${label}</button>`).join('')}
          </div>
          <div class="chips" role="group" aria-label="Filtra per categoria">
            <button class="chip ${archiveFilter.cat === 'all' ? 'is-on' : ''}" data-cat="all">Tutte le categorie</button>
            ${cats.map((c) => `<button class="chip ${archiveFilter.cat === c ? 'is-on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
        </div>

        <div id="entries"></div>
      </section>`;

    const $entries = document.getElementById('entries');
    const draw = () => {
      const q = archiveFilter.q.trim().toLowerCase();
      const list = index.filter((l) =>
        (archiveFilter.cat === 'all' || l.category === archiveFilter.cat) &&
        (archiveFilter.only !== 'unread' || !state.read[l.date]) &&
        (archiveFilter.only !== 'favs' || state.favs[l.date]) &&
        (!q || `${l.title} ${l.category} ${l.hook || ''}`.toLowerCase().includes(q))
      );
      if (!list.length) {
        $entries.innerHTML = `<div class="empty"><p>${
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
        return `${head}
          <a class="entry ${read ? 'is-read' : ''}" href="#/learn/${esc(l.date)}">
            <span class="day"><b>${fromIso(l.date).getUTCDate()}</b><small>${esc(fmt(l.date, { weekday: 'short' }))}</small></span>
            <span>
              <h3>${inline(l.title)}</h3>
              <span class="sub">${esc(l.category)}, ${l.minutes || 5} minuti</span>
            </span>
            <span class="marks">
              ${state.favs[l.date] ? icon.starSolid : ''}
              ${!read ? '<span class="dot" aria-label="Da leggere"></span>' : ''}
            </span>
          </a>`;
      }).join('');
    };
    draw();

    const $q = document.getElementById('q');
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

  /* ---------- Impostazioni ---------- */
  function guessRepo() {
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return { owner: '', repo: '' };
    const owner = host.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    return { owner, repo: first || host };
  }

  async function renderSettings() {
    const remote = await getTopics().catch(() => ({
      categories: DEFAULT_TOPICS.map((name) => ({ id: slug(name), name, enabled: true })),
    }));
    let topics = load(KEYS.topicsDraft, null) || structuredClone(remote.categories);
    const gh = Object.assign(guessRepo(), load(KEYS.github, {}));
    const dirty = () => JSON.stringify(topics) !== JSON.stringify(remote.categories);

    $view.innerHTML = `
      <section class="settings">
        <h1>Impostazioni</h1>

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
          <p>Ogni mattina la lezione arriva da una di queste categorie, a rotazione e senza mai ripetere un argomento. Tocca una categoria per attivarla o disattivarla.</p>
          <div class="topic-list" id="topics"></div>
          <div class="row">
            <label class="sr-only" for="new-topic">Nuova categoria</label>
            <input class="field" id="new-topic" placeholder="Aggiungi una categoria, per esempio Fotografia" maxlength="60">
            <button class="btn" data-action="add-topic">Aggiungi</button>
          </div>
          <div class="notice" id="topics-status" role="status"></div>
        </div>

        <div class="group" id="github">
          <div class="group-head">
            <h2>Collegamento a GitHub</h2>
            <span class="pill" id="gh-pill"></span>
          </div>
          <p>Facoltativo. Serve a una sola cosa: far valere le modifiche alle categorie qui sopra.</p>
          <p>La lezione viene scritta ogni mattina su GitHub, che sceglie la categoria leggendo l'elenco salvato nel tuo repository. Collegando l'app, le tue scelte vengono salvate lì. Senza collegamento l'app funziona lo stesso, con le categorie che ci sono adesso.</p>
          <p class="hint">Non ha niente a che fare con la chiave di Gemini, che resta nei Secrets di GitHub e l'app non vede mai.</p>

          <details class="howto">
            <summary>Come ottenere il token (2 minuti)</summary>
            <ol>
              <li>Apri la <a href="https://github.com/settings/personal-access-tokens/new?name=Quotidie&amp;description=Salva+le+categorie+delle+lezioni&amp;contents=write" target="_blank" rel="noopener noreferrer">pagina di creazione del token</a> su GitHub.</li>
              <li>In <em>Repository access</em> scegli <em>Only select repositories</em> e seleziona solo il repository dell'app.</li>
              <li>In <em>Permissions</em>, alla voce <em>Contents</em>, scegli <em>Read and write</em>. Non serve nient'altro.</li>
              <li>Premi <em>Generate token</em>, copialo e incollalo qui sotto.</li>
            </ol>
            <p class="hint">Il token può modificare solo i file di quel repository e resta salvato solo su questo dispositivo. Puoi revocarlo quando vuoi dalle impostazioni di GitHub.</p>
          </details>

          <label class="lbl" for="gh-owner">Utente GitHub</label>
          <input class="field" id="gh-owner" value="${esc(gh.owner)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <label class="lbl" for="gh-repo">Repository</label>
          <input class="field" id="gh-repo" value="${esc(gh.repo)}" autocomplete="off" autocapitalize="off" spellcheck="false">
          <label class="lbl" for="gh-token">Token</label>
          <input class="field" id="gh-token" type="password" value="${esc(gh.token || '')}" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
          <div class="row" style="margin-top:1rem">
            <button class="btn primary" data-action="push-topics">Collega e salva le categorie</button>
            <button class="text-link" data-action="disconnect" ${gh.token ? '' : 'hidden'}>Scollega</button>
          </div>
        </div>

        <div class="group">
          <h2>I tuoi dati</h2>
          <p>Letture, preferiti e streak sono salvati su questo dispositivo. Esportali per spostarli su un altro.</p>
          <div class="row">
            <button class="btn" data-action="export">Esporta</button>
            <label class="btn" for="import-file">Importa</label>
            <input type="file" id="import-file" accept="application/json" hidden>
          </div>
        </div>
      </section>`;

    const $topics = document.getElementById('topics');
    const $status = document.getElementById('topics-status');
    const drawTopics = () => {
      $topics.innerHTML = topics.map((t, i) => `
        <span class="topic ${t.enabled ? 'is-on' : ''}" role="button" tabindex="0" data-i="${i}" aria-pressed="${t.enabled}">
          ${esc(t.name)}
          <span class="x" data-remove="${i}" role="button" aria-label="Rimuovi ${esc(t.name)}">×</span>
        </span>`).join('');
      const on = topics.filter((t) => t.enabled).length;
      const count = `${on} categorie attive su ${topics.length}.`;
      const connected = !!load(KEYS.github, {}).token;
      $status.classList.toggle('is-warn', dirty());
      if (!dirty()) {
        $status.textContent = count;
      } else if (connected) {
        $status.innerHTML = `${count} Hai modifiche non salvate: premi <a href="#github" data-jump>Salva le categorie</a> per farle valere dalla prossima lezione.`;
      } else {
        $status.innerHTML = `${count} Le modifiche sono solo su questo dispositivo e non cambiano ancora le lezioni. Per farle valere <a href="#github" data-jump>collega GitHub</a>.`;
      }
      if (dirty()) save(KEYS.topicsDraft, topics); else localStorage.removeItem(KEYS.topicsDraft);
    };

    const $pill = document.getElementById('gh-pill');
    const drawConnection = () => {
      const connected = !!load(KEYS.github, {}).token;
      $pill.textContent = connected ? 'Collegato' : 'Non collegato';
      $pill.classList.toggle('is-on', connected);
      $view.querySelector('[data-action="push-topics"]').textContent = connected ? 'Salva le categorie' : 'Collega e salva le categorie';
      $view.querySelector('[data-action="disconnect"]').hidden = !connected;
    };
    drawTopics();
    drawConnection();

    // I link "#github" scorrono alla sezione senza cambiare pagina
    $status.addEventListener('click', (e) => {
      if (!e.target.closest('[data-jump]')) return;
      e.preventDefault();
      const target = document.getElementById('github');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const details = target.querySelector('.howto');
      if (!load(KEYS.github, {}).token) details.open = true;
    });

    $view.querySelector('[data-action="disconnect"]').addEventListener('click', () => {
      const cfg = load(KEYS.github, {});
      delete cfg.token;
      save(KEYS.github, cfg);
      document.getElementById('gh-token').value = '';
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

    const $new = document.getElementById('new-topic');
    const addTopic = () => {
      const name = $new.value.trim();
      if (!name) return;
      const id = slug(name);
      if (topics.some((t) => t.id === id)) return toast('Categoria già presente');
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
      const cfg = {
        owner: document.getElementById('gh-owner').value.trim(),
        repo: document.getElementById('gh-repo').value.trim(),
        token: document.getElementById('gh-token').value.trim(),
      };
      if (!cfg.owner || !cfg.repo || !cfg.token) {
        document.querySelector('#github .howto').open = !cfg.token;
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
    document.getElementById('import-file').addEventListener('change', async (e) => {
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

  async function pushTopics({ owner, repo, token }, content) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/data/topics.json`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const current = await fetch(url, { headers, cache: 'no-store' });
    if (current.status === 401) throw new Error('Token non valido o scaduto');
    let sha;
    if (current.status === 404) {
      // Il file non esiste ancora: verifica almeno che il repository sia raggiungibile
      const repoRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
      if (!repoRes.ok) throw new Error('Repository non trovato o token senza accesso');
    } else if (!current.ok) {
      throw new Error(`GitHub ha risposto ${current.status}`);
    } else {
      ({ sha } = await current.json());
    }

    const json = JSON.stringify(content, null, 2) + '\n';
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'Aggiorna categorie delle lezioni', content: b64, sha }),
    });
    if (res.status === 403) throw new Error('Il token non ha il permesso di scrittura');
    if (!res.ok) throw new Error(`Salvataggio non riuscito (${res.status})`);
  }

  /* ---------- Azioni globali ---------- */
  $view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, date } = el.dataset;
    if (action === 'reload') {
      Object.keys(memo).forEach((k) => delete memo[k]);
      route();
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

  /* ---------- Tema e scroll ---------- */
  function applyPrefs() {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.style.setProperty('--text-scale', prefs.textScale);
    const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.getElementById('theme-color').setAttribute('content', dark ? '#13151F' : '#F5F1E8');
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPrefs);

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

  // Quando l'app torna in primo piano in un nuovo giorno, ricarica le notizie
  let lastDay = isoDay();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isoDay() !== lastDay) {
      lastDay = isoDay();
      Object.keys(memo).forEach((k) => delete memo[k]);
      route();
    }
  });

  /* ---------- Icone e manifest (tutto dentro i 3 file) ---------- */
  function installIcons() {
    const symbol = document.getElementById('logo-mark');
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
        start_url: location.href.split('#')[0], background_color: '#F5F1E8', theme_color: '#1D2033',
        icons: [{ src: icon180, sizes: '180x180', type: 'image/png' }, { src: png(512), sizes: '512x512', type: 'image/png' }],
      };
      addLink('manifest', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest)));
    };
    img.src = 'data:image/svg+xml,' + encodeURIComponent(svg(false));
  }

  installIcons();
  applyPrefs();
  window.addEventListener('hashchange', route);
  route();
})();
