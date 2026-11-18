/* JasperDoku - game screens, input, hints and saving. */
(function () {
  'use strict';
  const E = window.JasperEngine;
  const { OPEN, OUT, JASPER } = E;

  // ---------------------------------------------------------------- colors
  const PALETTE = [
    { name: 'Coral', hex: '#FF9F94' },
    { name: 'Tangerine', hex: '#FFBE6B' },
    { name: 'Lemon', hex: '#FFDE70' },
    { name: 'Mint', hex: '#9BDDB0' },
    { name: 'Lime', hex: '#CFE584' },
    { name: 'Sky', hex: '#8ECDF7' },
    { name: 'Slate', hex: '#B4BFCD' },
    { name: 'Lavender', hex: '#C3A9F5' },
    { name: 'Pink', hex: '#F9AFCF' },
    { name: 'Latte', hex: '#D2B394' },
  ];

  // ---------------------------------------------------------------- Jasper's face
  // Jasper's and Leo's pictures: small WebP files, loaded once and then kept on the phone.
  let jasperSrc = 'assets/jasper.webp';
  const PICS = ['assets/jasper.webp', 'assets/jasper-full.webp', 'assets/leo.webp', 'assets/leo-full.webp'];
  const preloaded = [];
  function findJasperPhoto() {
    // start every picture downloading/decoding right away so they're ready before they're needed
    for (const src of PICS) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      if (img.decode) img.decode().catch(() => {});
      preloaded.push(img);
    }
  }
  // Big profile circles show Jasper's whole head (ears too); board pieces use the close-up face.
  let jasperFullSrc = 'assets/jasper-full.webp';
  function paintJasperImages() {
    document.querySelectorAll('.jasper-img').forEach((el) => { const want = el.closest('.piece') ? jasperSrc : jasperFullSrc; if (el.getAttribute('src') !== want) el.src = want; });
  }

  // ---------------------------------------------------------------- saving
  const STORE_KEY = 'jasperdoku.v1';
  const MAX_LIVES = 3;
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const defaults = () => ({
    level: 1,
    levels: {},
    daily: { streak: 0, last: null, best: 0, done: {}, forfeit: {} },
    settings: { autoX: false, timer: true, vibrate: true, sound: true, fxVol: 0.7, winVol: 0.8, theme: 'auto', holiday: 'auto', freeSize: 7, freeDiff: 'medium' },
    progress: {},
    seenHowTo: false,
    seenTutorial: false,
    stats: { wins: 0, flawless: 0, noHint: 0, free: 0, daily: 0, refillWins: 0, big10: 0 },
    achievements: {},
    lb: { name: '', room: '', rows: [], since: null, pending: [] },
    first: {},
  });
  let save = load();
  // carry over first-try treats recorded by the previous version (never from a skip)
  (function migrateFirst() {
    for (const [n, r] of Object.entries(save.levels)) {
      if (r.firstTreats !== undefined && !('level:' + n in save.first) && !(r.skipped && !r.done)) save.first['level:' + n] = r.firstTreats;
      delete r.firstTreats;
    }
    for (const [k, r] of Object.entries(save.daily.done)) {
      if (r.firstTreats !== undefined && !('daily:' + k in save.first)) save.first['daily:' + k] = r.firstTreats;
      delete r.firstTreats;
    }
  })();
  const firstKey = (spec) => (spec.mode === 'level' ? 'level:' + spec.id : spec.mode === 'daily' ? 'daily:' + spec.id : null);
  // has this puzzle's first completion already happened? (older finished levels count as completed)
  function firstDone(spec) {
    const k = firstKey(spec);
    if (!k) return true;
    if (k in save.first) return true;
    if (spec.mode === 'level') return !!(save.levels[spec.id] && save.levels[spec.id].done);
    return !!save.daily.done[spec.id];
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = defaults(), s = JSON.parse(raw);
        return Object.assign(d, s, { settings: Object.assign(d.settings, s.settings || {}), daily: Object.assign(d.daily, s.daily || {}), stats: Object.assign(d.stats, s.stats || {}), achievements: s.achievements || {}, lb: Object.assign(d.lb, s.lb || {}), first: s.first || {} });
      }
    } catch (e) { /* storage unavailable - play without saving */ }
    return defaults();
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- puzzle specs
  // Golden treat levels: one every 7-15 levels. The gaps come from a fixed seed,
  // so every phone gets golden levels on exactly the same level numbers.
  const GOLDEN = (() => {
    const rng = E.mulberry32(E.hashSeed('jasperdoku-golden-levels'));
    const set = new Set();
    for (let n = 0; n < 5000;) { n += 7 + Math.floor(rng() * 9); set.add(n); }
    return set;
  })();
  const isGolden = (n) => GOLDEN.has(n);
  // the regular board size for a level number (golden levels don't change the size path)
  const baseSize = (n) => (n <= 4 ? 5 : n <= 12 ? 6 : n <= 28 ? 7 : n <= 50 ? 8 : n <= 80 ? 9 : 10);
  function levelConfig(n) {
    if (isGolden(n)) return { size: 8, maxTier: 4, minTier: 2, golden: true };
    const size = baseSize(n);
    const maxTier = n <= 2 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4;
    const minTier = n >= 20 ? 3 : 0;
    return { size, maxTier, minTier };
  }
  function levelSpec(n) { return Object.assign({ mode: 'level', id: n, seed: 'level-' + n }, levelConfig(n)); }
  // Leo replaces Jasper's picture on golden levels only; the rules are identical.
  const isGoldenGame = () => !!(G && G.spec && G.spec.golden);
  const pieceSrc = () => (isGoldenGame() ? 'assets/leo.webp' : jasperSrc);
  const pieceName = () => (isGoldenGame() ? 'Leo' : 'Jasper');
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return todayStr(d); }
  // day number from a 'YYYY-MM-DD' string (used to share streaks on the leaderboard)
  const dayNum = (ds) => { const [y, m, d] = ds.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 864e5); };
  function streakNow() {
    const d = save.daily, today = todayStr();
    const alive = d.last === today || d.last === yesterdayStr();
    return { n: alive ? d.streak : 0, today: d.last === today, alive, best: d.best || 0 };
  }
  // ---- winter holiday look: Auto (Nov 15 – Jan 6), On, or Off
  function holidayOn() {
    const h = save.settings.holiday || 'auto';
    if (h !== 'auto') return h === 'on';
    const d = new Date(), m = d.getMonth(), day = d.getDate();
    return m === 11 || (m === 10 && day >= 15) || (m === 0 && day <= 6);
  }
  function applyHoliday() {
    const on = holidayOn();
    document.body.classList.toggle('holiday', on);
    const d = new Date(), xmas = d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 25);
    const tag = document.querySelector('.tagline');
    if (tag) tag.textContent = !on ? 'A cozy logic puzzle' : xmas ? 'Meowy Christmas from Jasper' : 'A cozy winter logic puzzle';
    const snow = document.getElementById('snow');
    if (snow && on && !snow.childElementCount) {
      for (let k = 0; k < 26; k++) {
        const f = document.createElement('i');
        f.style.left = (k * 37 % 100) + '%';
        f.style.setProperty('--sz', (3 + (k * 7) % 5) + 'px');
        f.style.animationDuration = (9 + (k * 13) % 9) + 's';
        f.style.animationDelay = -((k * 17) % 14) + 's';
        f.style.setProperty('--drift', ((k % 2 ? 1 : -1) * (10 + k % 20)) + 'px');
        snow.appendChild(f);
      }
    }
  }
  // Ten puzzles a day, the same for everyone, getting bigger and trickier.
  const DAILY_LADDER = [
    { size: 5, maxTier: 3, minTier: 0 }, { size: 6, maxTier: 3, minTier: 1 }, { size: 6, maxTier: 4, minTier: 2 },
    { size: 7, maxTier: 3, minTier: 2 }, { size: 7, maxTier: 4, minTier: 3 }, { size: 8, maxTier: 4, minTier: 2 },
    { size: 8, maxTier: 4, minTier: 3 }, { size: 9, maxTier: 4, minTier: 3 }, { size: 9, maxTier: 4, minTier: 3 },
    { size: 10, maxTier: 4, minTier: 3 },
  ];
  const DAILY_COUNT = DAILY_LADDER.length;
  const HINT_PENALTY = 30; // seconds added to leaderboard time per hint
  function dailySpec(day, n) {
    day = day || todayStr(); n = n || 1;
    return Object.assign({ mode: 'daily', id: day + '#' + n, day, n, seed: 'daily-' + day + '-' + n }, DAILY_LADDER[n - 1]);
  }
  const dailyKey = (day, n) => day + '#' + n;
  function dailyDoneCount(day) { let c = 0; for (let n = 1; n <= DAILY_COUNT; n++) if (save.daily.done[dailyKey(day, n)]) c++; return c; }
  // next puzzle to play: the first fresh one (still counts), otherwise the first unsolved skipped one
  function nextDailyN(day) {
    for (let n = 1; n <= DAILY_COUNT; n++) { const k = dailyKey(day, n); if (!save.daily.done[k] && !save.daily.forfeit[k]) return n; }
    for (let n = 1; n <= DAILY_COUNT; n++) if (!save.daily.done[dailyKey(day, n)]) return n;
    return 0;
  }
  // A daily counts for the leaderboard only on its first, un-skipped attempt.
  // (forfeit only exists on puzzles skipped under the old rules)
  const dailyCounts = (spec) => spec.mode === 'daily' && !save.daily.done[spec.id] && !save.daily.forfeit[spec.id];
  const DIFFS = { easy: { maxTier: 2, minTier: 0 }, medium: { maxTier: 3, minTier: 2 }, hard: { maxTier: 4, minTier: 3 } };
  function freeSpec() {
    const s = save.settings, seed = 'free-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    return Object.assign({ mode: 'free', id: seed, seed, size: s.freeSize }, DIFFS[s.freeDiff] || DIFFS.medium);
  }
  const specKey = (spec) => spec.mode + ':' + spec.id;

  // ---------------------------------------------------------------- game state
  let G = null; // current game
  const $ = (sel) => document.querySelector(sel);
  const boardEl = $('#board');

  function startGame(spec) {
    showLoading(true);
    setTimeout(() => {
      const puzzle = E.generate({ size: spec.size, seed: spec.seed, maxTier: spec.maxTier, minTier: spec.minTier });
      const N = puzzle.size;
      const rng = E.mulberry32(puzzle.seed ^ 0x9e3779b9);
      const order = PALETTE.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      G = {
        spec, puzzle, N, reg: puzzle.regions,
        colors: order.slice(0, N).map((i) => PALETTE[i]),
        units: E.buildUnits(N, puzzle.regions),
        state: new Array(N * N).fill(OPEN),
        counts: dailyCounts(spec),
        // first try at a level: never finished, skipped or scored before
        firstRun: !firstDone(spec), // treats count on this puzzle's first completion
        history: [], elapsed: 0, hints: 0, wrongPlaced: 0, lives: spec.golden ? 1 : MAX_LIVES, maxLives: spec.golden ? 1 : MAX_LIVES, knownWrong: [], done: false,
      };
      // resume a half-finished board
      const cur = (save.progress || {})[specKey(spec)];
      if (cur && cur.state && cur.state.length === N * N) {
        G.state = cur.state.slice(); G.elapsed = cur.elapsed || 0; G.hints = cur.hints || 0; G.wrongPlaced = cur.wrongPlaced || 0; G.lives = cur.lives === undefined ? G.maxLives : Math.min(cur.lives, G.maxLives); G.knownWrong = cur.knownWrong || []; G.restarted = !!cur.restarted;
      }
      saveCurrent();
      buildBoard();
      renderHeader();
      showScreen('game');
      showLoading(false);

    }, 30);
  }

  function saveCurrent() {
    if (!G || G.done) return;
    save.progress = save.progress || {};
    const key = specKey(G.spec);
    delete save.progress[key]; // re-insert so it counts as most recent
    save.progress[key] = { state: G.state, elapsed: G.elapsed, hints: G.hints, wrongPlaced: G.wrongPlaced, lives: G.lives, knownWrong: G.knownWrong, restarted: !!G.restarted };
    const keys = Object.keys(save.progress);
    while (keys.length > 8) delete save.progress[keys.shift()]; // keep the 8 most recent boards
    persist();
  }
  function forgetProgress() {
    if (G && save.progress) delete save.progress[specKey(G.spec)];
  }

  function isSolution(i) { return G.puzzle.solution[(i / G.N) | 0] === i % G.N; }

  // ---------------------------------------------------------------- board drawing
  function styleCell(el, i, N, reg, colors, inner, tight) {
    const r = (i / N) | 0, c = i % N;
    el.style.background = colors[reg[i]].hex;
    el.style.border = '0 solid var(--board-bg)';
    el.style.borderWidth = inner + 'px';
    const rr = (tight + inner) + 'px';
    el.style.borderRadius = rr;
    void r; void c;
  }
  function buildBoard() {
    const { N, reg } = G;
    boardEl.style.setProperty('--n', N);
    boardEl.innerHTML = '';
    const inner = N >= 9 ? 0.75 : 1;          // half the small gap between every square
    const gap = inner;                        // same gap between patches - color tells them apart
    const tight = N >= 9 ? 4 : N >= 7 ? 5 : 6; // corner rounding on every square
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.i = i;
      el.style.background = G.colors[reg[i]].hex;
      // a side is a "boundary" if it's the board edge or the next square is another patch
      const top = r === 0 || reg[i - N] !== reg[i];
      const bottom = r === N - 1 || reg[i + N] !== reg[i];
      const left = c === 0 || reg[i - 1] !== reg[i];
      const right = c === N - 1 || reg[i + 1] !== reg[i];
      const w = (b) => (b ? gap : inner);
      const bt = w(top), bb = w(bottom), bl = w(left), br = w(right);
      el.style.border = '0 solid var(--board-bg)';
      el.style.borderWidth = bt + 'px ' + br + 'px ' + bb + 'px ' + bl + 'px';
      // every square gets the same small rounded corners on its colored part
      // (outer radius = tight + border so the visible color keeps an even curve)
      el.style.borderTopLeftRadius = (tight + bl) + 'px ' + (tight + bt) + 'px';
      el.style.borderTopRightRadius = (tight + br) + 'px ' + (tight + bt) + 'px';
      el.style.borderBottomRightRadius = (tight + br) + 'px ' + (tight + bb) + 'px';
      el.style.borderBottomLeftRadius = (tight + bl) + 'px ' + (tight + bb) + 'px';
      el.setAttribute('role', 'gridcell');
      boardEl.appendChild(el);
    }
    renderCells(true);
  }

  function renderCells(force) {
    if (!G) return;
    const { N, reg, state } = G;
    const bad = E.conflicts(N, reg, state);
    const auto = new Set();
    if (save.settings.autoX) {
      for (let q = 0; q < N * N; q++) if (state[q] === JASPER) E.attacked(N, reg, q).forEach((i) => auto.add(i));
    }
    const cells = boardEl.children;
    for (let i = 0; i < N * N; i++) {
      const el = cells[i];
      let kind = state[i] === JASPER ? 'j' : state[i] === OUT ? 'x' : auto.has(i) ? 'a' : 'o';
      const wrong = false;
      const key = kind + (bad.has(i) ? 'c' : '') + (wrong ? 'w' : '') + jasperSrc;
      if (!force && el._key === key) continue;
      const wasJ = el._key && el._key[0] === 'j';
      el._key = key;
      el.classList.toggle('conflict', bad.has(i));
      el.classList.toggle('wrong', wrong);
      el.classList.toggle('auto', kind === 'a');
      if (kind === 'j') {
        if (!wasJ || force) el.innerHTML = '<div class="piece"><img class="piece-img" alt="' + pieceName() + '" src="' + pieceSrc() + '"></div>';
      } else if (kind === 'x' || kind === 'a') {
        el.innerHTML = '<div class="mark"></div>';
      } else {
        el.innerHTML = '';
      }
      el.setAttribute('aria-label', 'Row ' + ((i / N | 0) + 1) + ', column ' + (i % N + 1) + ', ' + G.colors[reg[i]].name + (kind === 'j' ? ', Jasper' : kind === 'o' ? '' : ', crossed out'));
    }
  }

  function renderHeader() {
    const s = G.spec;
    $('#game-title').textContent = s.mode === 'level' ? (s.golden ? '✨ Golden Level ' + s.id : 'Level ' + s.id) : s.mode === 'daily' ? 'Daily #' + s.n + (s.day === todayStr() ? '' : ' · ' + shortDate(s.day)) : 'Free Play';
    const firstNote = G && (s.mode === 'level' || s.mode === 'daily') ? (G.firstRun ? ' · Treats count' : ' · Practice') : '';
    const diffWord = s.golden ? ' · One golden treat' : s.mode === 'level' ? firstNote : s.mode === 'free' ? ' · ' + cap(save.settings.freeDiff) : s.mode === 'daily' ? (G.counts ? ' · Counts for leaderboard' : ' · Practice') : '';
    $('#game-sub').textContent = G.N + ' × ' + G.N + diffWord;
    $('#timer').classList.toggle('hidden-timer', !save.settings.timer);
    renderTimer();
    renderLives();
    $('#screen-game').classList.toggle('golden', !!s.golden);
    $('.controls-tip').innerHTML = 'Tap&nbsp;=&nbsp;✕ &nbsp;·&nbsp; Double-tap&nbsp;=&nbsp;' + (s.golden ? 'Leo' : 'Jasper') + ' &nbsp;·&nbsp; Drag&nbsp;to&nbsp;✕&nbsp;many';
  }
  function renderTimer() { if (G) $('#timer').textContent = fmtTime(G.elapsed); }
  function fmtTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  setInterval(() => {
    if (!G || G.done || document.hidden || !$('#modal').hidden || !$('#screen-game').classList.contains('active')) return;
    G.elapsed++;
    renderTimer();
    if (G.elapsed % 5 === 0) saveCurrent();
  }, 1000);

  // ---------------------------------------------------------------- moves
  function setCells(changes) {
    // changes: [{i, to}] -> applied as one undo step
    const step = [];
    for (const ch of changes) {
      const from = G.state[ch.i];
      if (from === ch.to) continue;
      step.push({ i: ch.i, from, to: ch.to });
      G.state[ch.i] = ch.to;
      if (ch.to === JASPER && !isSolution(ch.i)) G.wrongPlaced++;
    }
    if (step.length) G.history.push(step);
    afterChange(step);
  }
  function afterChange(step) {
    clearHint();
    renderCells();
    const placed = step ? step.filter((s) => s.to === JASPER) : [];
    if (step && step.length) sfx(placed.length ? 'place' : step.some((s) => s.to === OUT) ? 'mark' : 'erase');
    if (placed.length && save.settings.vibrate && navigator.vibrate) navigator.vibrate(12);
    saveCurrent();
    checkWin();
  }
  const isLocked = (i) => G && G.state[i] === JASPER && isSolution(i);
  function lockedNudge(i) {
    const el = boardEl.children[i];
    if (el) { el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); }
    toast('🔒 ' + pieceName() + ' is locked in. Correct spots stay put.');
  }
  function undo() {
    if (!G || G.done) return;
    if (G.lives <= 0) return outOfTreats();
    const step = G.history.pop();
    if (!step) return toast('Nothing to undo');
    let kept = -1, changed = false;
    for (let k = step.length - 1; k >= 0; k--) {
      const c = step[k];
      if (c.to === JASPER && isSolution(c.i)) { kept = c.i; continue; } // never undo a correct Jasper/Leo
      G.state[c.i] = c.from; changed = true;
    }
    if (!changed && kept >= 0) return lockedNudge(kept);
    afterChange(null);
  }
  /*
   * Taps: ONE tap toggles ✕ (or removes a Jasper) - it can never place Jasper,
   * so a single tap can never cost a treat. A DOUBLE-tap places Jasper.
   * The first tap of a double-tap is undone so the square ends up as just "Jasper".
   */
  const DOUBLE_TAP_MS = 350;
  let lastTap = null;
  function tap(i) {
    const now = Date.now();
    if (lastTap && lastTap.i === i && now - lastTap.t < DOUBLE_TAP_MS) {
      // double-tap: take back the first tap, then place Jasper
      if (lastTap.changed) { G.history.pop(); G.state[i] = lastTap.from; }
      lastTap = null;
      if (G.state[i] === JASPER) return renderCells();
      if (!isSolution(i)) return wrongMove(i);
      setCells([{ i, to: JASPER }]);
      return;
    }
    const s = G.state[i];
    if (isLocked(i)) { lastTap = null; return lockedNudge(i); }
    const autoShown = s === OPEN && save.settings.autoX && boardEl.children[i].classList.contains('auto');
    const to = s === JASPER ? OPEN : s === OUT ? OPEN : autoShown ? OPEN : OUT;
    lastTap = { i, t: now, from: s, changed: to !== s };
    if (to !== s) setCells([{ i, to }]);
  }

  // ---------------------------------------------------------------- lives (treats)
  function treatSVG(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 40 36" aria-hidden="true"><path d="M20 33.5C8.5 26 2.5 19.5 2.5 11.5a8.7 8.7 0 0 1 17.5-3.3 8.7 8.7 0 0 1 17.5 3.3C37.5 19.5 31.5 26 20 33.5Z"/><circle cx="13" cy="13" r="1.8"/><circle cx="27" cy="13" r="1.8"/><circle cx="20" cy="20" r="1.8"/></svg>';
  }
  function renderLives() {
    if (!G) return;
    let html = '';
    for (let k = 0; k < G.maxLives; k++) html += '<span class="life' + (G.spec.golden ? ' golden' : '') + (k < G.lives ? '' : ' gone') + '">' + treatSVG('treat') + '</span>';
    $('#lives').innerHTML = html;
  }
  function wrongMove(i) {
    if (!G.knownWrong.includes(i)) sfx('wrong');
    if (G.knownWrong.includes(i)) {
      // already paid for this square - just remind, no treat lost
      const el = boardEl.children[i];
      G.state[i] = OUT;
      renderCells();
      el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge');
      toast('Already ruled out - no treat lost');
      return;
    }
    if (G.lives <= 0) return outOfTreats();
    G.knownWrong.push(i);
    G.lives--;
    G.wrongPlaced++;
    clearHint();
    const el = boardEl.children[i];
    // red flash + a red treat cracking in half on the square
    el.classList.remove('flash-red'); void el.offsetWidth; el.classList.add('flash-red');
    const fx = document.createElement('div');
    fx.className = 'break-fx';
    fx.innerHTML = treatSVG('half left') + treatSVG('half right');
    el.appendChild(fx);
    setTimeout(() => { fx.remove(); el.classList.remove('flash-red'); }, 900);
    // the square is now known to be wrong, so cross it out
    G.state[i] = OUT;
    renderCells();
    el.appendChild(fx);
    // break one treat in the counter
    const lifeEls = document.querySelectorAll('#lives .life');
    const lostEl = lifeEls[G.lives];
    if (lostEl) lostEl.classList.add('breaking');
    setTimeout(renderLives, 600);
    if (save.settings.vibrate && navigator.vibrate) navigator.vibrate([50, 40, 50]);
    saveCurrent();
    if (G.lives === 0) setTimeout(outOfTreats, 950);
  }
  function outOfTreats() {
    const gold = isGoldenGame();
    const face = gold ? 'assets/leo-full.webp' : jasperFullSrc;
    const msg = gold
      ? 'Golden levels only have one treat. Start over and try again. It\'s the same puzzle.'
      : 'That was the last treat on this board. Start over with a fresh board and ' + G.maxLives + ' new treats.' + (G.spec.mode === 'daily' ? ' Your timer keeps running.' : '');
    openModal('<div class="modal-face"><img class="jasper-img" alt="" src="' + face + '"></div><h2>' + (gold ? 'Leo ate the golden treat!' : 'Jasper ate all the treats!') + '</h2><p>' + msg + '</p>' +
      actions([['Start over', 'start-over', 'primary'], [G.spec.mode === 'daily' ? 'Leave puzzle' : 'Skip this level', 'confirm-skip', 'ghost']]));
  }

  // ---------------------------------------------------------------- touch / mouse input
  let drag = null;
  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest && el.closest('.cell');
    return cell && boardEl.contains(cell) ? +cell.dataset.i : -1;
  }
  boardEl.addEventListener('pointerdown', (e) => {
    if (!G || G.done) return;
    if (G.lives <= 0) { e.preventDefault(); return outOfTreats(); }
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    boardEl.setPointerCapture && boardEl.setPointerCapture(e.pointerId);
    const s = G.state[i];
    drag = { start: i, last: i, moved: false, mode: s === OPEN ? 'mark' : s === OUT ? 'erase' : null, changes: [] };
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || i === drag.last) return;
    const from = drag.last;
    drag.last = i;
    if (!drag.mode) return;
    if (!drag.moved) { drag.moved = true; dragPaint(drag.start); }
    // fill in every square between the last one and this one (fast swipes skip squares)
    const N = G.N, r0 = (from / N) | 0, c0 = from % N, r1 = (i / N) | 0, c1 = i % N;
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    for (let k = 1; k <= steps; k++) {
      dragPaint(Math.round(r0 + ((r1 - r0) * k) / steps) * N + Math.round(c0 + ((c1 - c0) * k) / steps));
    }
  });
  function dragPaint(i) {
    const s = G.state[i];
    if (drag.mode === 'mark' && s === OPEN) { G.state[i] = OUT; drag.changes.push({ i, from: OPEN, to: OUT }); }
    if (drag.mode === 'erase' && s === OUT) { G.state[i] = OPEN; drag.changes.push({ i, from: OUT, to: OPEN }); }
    renderCells();
  }
  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { tap(d.start); return; }
    lastTap = null;
    if (d.changes.length) G.history.push(d.changes);
    afterChange(d.changes);
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- hints
  let currentHint = null;
  const unitName = (u) => (u.kind === 'row' ? 'row ' + (u.idx + 1) : u.kind === 'col' ? 'column ' + (u.idx + 1) : 'the ' + patchName(u.idx) + ' patch');
  const patchName = (k) => '<b>' + G.colors[k].name + '</b>';
  function joinList(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  function findHint() {
    const { N, reg } = G;
    for (let i = 0; i < N * N; i++) {
      if (G.state[i] === JASPER && !isSolution(i)) {
        return { text: 'This ' + pieceName() + ' is in the wrong spot. Let\'s move them.', focus: [i], elim: [i], apply: [{ i, to: OPEN }] };
      }
    }
    for (let i = 0; i < N * N; i++) {
      if (G.state[i] === OUT && isSolution(i)) {
        return { text: 'One of your ✕ marks is covering a spot Jasper actually needs.', focus: [i], place: i, apply: [{ i, to: OPEN }] };
      }
    }
    const trusted = G.state.slice();
    let step;
    for (let guard = 0; guard < 500; guard++) {
      step = E.nextStep(N, reg, trusted, 4, G.units);
      // with auto-cross on, tidy-up steps are already visible, so skip past them
      if (step && step.type === 'tidy' && save.settings.autoX) { E.applyStep(trusted, step); continue; }
      break;
    }
    if (step && step.tier >= 0) return describe(step);
    // fallback (should not happen): reveal one answer cell
    const r = G.puzzle.solution.findIndex((c, row) => G.state[row * N + c] !== JASPER);
    const i = r * N + G.puzzle.solution[r];
    return { text: pieceName() + ' wants to sit right here.', focus: [i], place: i, apply: [{ i, to: JASPER }] };
  }

  function describe(st) {
    const apply = [];
    if (st.place !== undefined) apply.push({ i: st.place, to: JASPER });
    (st.eliminate || []).forEach((i) => apply.push({ i, to: OUT }));
    const base = { focus: st.focus || [], elim: st.eliminate || [], place: st.place, apply };
    const N = G.N;
    let text;
    switch (st.type) {
      case 'tidy': {
        const q = st.focus[0];
        text = 'This Jasper already claims their row, column and ' + patchName(G.reg[q]) + ' patch, and nobody can sit right next to them. Cross out the marked spots.';
        break;
      }
      case 'last':
        text = 'There\'s only one spot left in ' + unitName(st.unit) + '. Jasper goes there!';
        break;
      case 'patchInLine': {
        const lineWord = st.line.kind === 'row' ? 'row ' + (st.line.idx + 1) : 'column ' + (st.line.idx + 1);
        text = 'The ' + patchName(st.unit.idx) + ' patch only has room left in ' + lineWord + '. So its Jasper will use up ' + lineWord + ', and the other spots in that line can be crossed out.';
        break;
      }
      case 'lineInPatch':
        text = 'Every open spot in ' + unitName(st.unit) + ' is inside the ' + patchName(st.line.idx) + ' patch. That patch\'s Jasper must come from ' + unitName(st.unit) + ', so the rest of the patch can be crossed out.';
        break;
      case 'wouldBlock':
        text = 'If Jasper sat in the marked spot, ' + unitName(st.unit) + ' would have nowhere left to put its Jasper. So that spot can be crossed out.';
        break;
      case 'group': {
        const lineWord = (k) => (st.targetKind === 'row' ? 'row' : 'column');
        if (st.groupWord === 'patches') {
          const names = joinList(st.groups.map((u) => patchName(u.idx)));
          const lines = st.keys.slice().sort((a, b) => a - b).map((k) => k + 1);
          const lw = lineWord() + 's ' + joinList(lines.map(String));
          text = 'The ' + names + ' patches all fit inside ' + lw + ' - ' + st.groups.length + ' patches, ' + st.groups.length + ' lines. Those lines are full up, so anything else in ' + lw + ' can be crossed out.';
        } else {
          const lw = (st.groupWord === 'rows' ? 'Rows ' : 'Columns ') + joinList(st.groups.map((u) => String(u.idx + 1)));
          const names = joinList(st.keys.map((k) => patchName(k)));
          text = lw + ' can only use spots inside the ' + names + ' patches. Those patches get their Jaspers from these lines, so the rest of those patches can be crossed out.';
        }
        break;
      }
      default:
        text = 'Try the highlighted spots.';
    }
    void N;
    return Object.assign(base, { text: text.replace(/Jasper/g, pieceName()) });
  }

  function showHint() {
    if (!G || G.done) return;
    if (G.lives <= 0) return outOfTreats();
    sfx('hint');
    G.hints++;
    saveCurrent();
    currentHint = findHint();
    boardEl.classList.add('hinting');
    const cells = boardEl.children;
    currentHint.focus.forEach((i) => cells[i].classList.add('h-focus'));
    (currentHint.elim || []).forEach((i) => cells[i].classList.add('h-elim'));
    if (currentHint.place !== undefined) cells[currentHint.place].classList.add('h-place');
    $('#hint-text').innerHTML = currentHint.text;
    $('#hint-sheet').hidden = false;
  }
  function clearHint() {
    currentHint = null;
    $('#hint-sheet').hidden = true;
    boardEl.classList.remove('hinting');
    boardEl.querySelectorAll('.h-focus, .h-elim, .h-place').forEach((el) => el.classList.remove('h-focus', 'h-elim', 'h-place'));
  }
  function applyHint() {
    if (!currentHint) return;
    const changes = currentHint.apply;
    clearHint();
    setCells(changes);
  }

  // ---------------------------------------------------------------- winning
  function checkWin() {
    const { N, reg, state } = G;
    if (G.done) return;
    let count = 0;
    for (let i = 0; i < N * N; i++) if (state[i] === JASPER) count++;
    if (count !== N || E.conflicts(N, reg, state).size) return;
    G.done = true;
    const lost = G.wrongPlaced;
    const stars = lost === 0 ? 3 : lost === 1 ? 2 : 1;
    const spec = G.spec;
    let milestone = 0, streakUp = 0;
    if (spec.mode === 'level') {
      const prev = save.levels[spec.id] || {};
      const nextSize = baseSize(spec.id + 1);
      if (!prev.done && nextSize > baseSize(spec.id)) milestone = nextSize;
      save.levels[spec.id] = {
        done: true,
        stars: Math.max(stars, prev.stars || 0),
        best: prev.best ? Math.min(prev.best, G.elapsed) : G.elapsed,
      };
      save.level = Math.max(save.level, spec.id + 1);
      setTimeout(() => lbSync(), 600);
    } else if (spec.mode === 'daily') {
      if (!save.daily.done[spec.id]) {
        // the first daily solved today grows the streak; catch-up days don't
        if (spec.day === todayStr() && save.daily.last !== spec.day) {
          save.daily.streak = save.daily.last === yesterdayStr() ? save.daily.streak + 1 : 1;
          save.daily.last = spec.day;
          save.daily.best = Math.max(save.daily.best || 0, save.daily.streak);
          streakUp = save.daily.streak;
          setTimeout(() => lbSync(), 600);
        }
        save.daily.done[spec.id] = { time: G.elapsed, stars, hints: G.hints };
      } else if (G.elapsed < save.daily.done[spec.id].time) {
        save.daily.done[spec.id].time = G.elapsed;
      }
    }
    { const fk = firstKey(spec); if (fk && G.firstRun && !(fk in save.first)) save.first[fk] = G.lives; }
    const st = save.stats;
    st.wins++;
    if (G.hints === 0 && G.wrongPlaced === 0) st.flawless++;
    if (G.hints === 0) st.noHint++;
    if (spec.mode === 'free') st.free++;
    if (spec.mode === 'daily') st.daily++;
    if (G.restarted && !spec.golden) st.refillWins++; // golden levels have one treat, so restarts there don't count
    if (spec.golden) st.golden = (st.golden || 0) + 1;
    if (G.N === 10) st.big10++;
    const unlocked = checkAchievements({ N: G.N, elapsed: G.elapsed, hints: G.hints, flawless: G.hints === 0 && G.wrongPlaced === 0, golden: !!spec.golden, fullDay: spec.mode === 'daily' && dailyDoneCount(spec.day) === DAILY_COUNT });
    forgetProgress();
    persist();
    const puzzleKey = spec.mode === 'daily' ? 'daily:' + spec.id : null;
    if (puzzleKey && G.counts) lbQueue(puzzleKey, G.elapsed, G.wrongPlaced, G.hints);
    const myScore = G.elapsed + HINT_PENALTY * G.hints, counted = !!G.counts;
    setTimeout(() => { showWin(stars, { milestone, unlocked, streakUp }); if (puzzleKey) lbWinCompare(puzzleKey, myScore, counted); }, 450);
  }

  const FLAME = '<svg class="flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9Z" fill="currentColor"/></svg>';
  const WIN_TITLES = ['Jasper approves!', 'Purrfect!', 'Treats for everyone!', 'Nap spot secured!', 'Clever human!'];
  function showWin(stars, info) {
    info = info || {};
    sfx('win');
    const flawless = G.hints === 0 && G.wrongPlaced === 0;
    const titles = holidayOn() ? WIN_TITLES.concat(['Meowy Christmas!', 'Snow problem!', 'Fa la la la purr!']) : WIN_TITLES;
    $('#win-title').textContent = info.milestone ? 'Level up!' : flawless ? 'Flawless! Purrfect!' : titles[Math.floor(Math.random() * titles.length)];
    const ms = $('#win-milestone');
    ms.hidden = !info.milestone;
    if (info.milestone) ms.innerHTML = '<span class="ms-grid" style="--n:' + info.milestone + '"></span><div><b>' + info.milestone + ' × ' + info.milestone + ' boards unlocked</b><small>Bigger boards, trickier puzzles</small></div>';
    const wsk = $('#win-streak');
    wsk.hidden = !info.streakUp;
    if (info.streakUp) wsk.innerHTML = FLAME + '<b>' + info.streakUp + '-day streak!</b><small>' + (info.streakUp === 1 ? 'Come back tomorrow to make it 2' : 'Kept alive for today') + '</small>';
    const ub = $('#win-badges');
    $('#win-rival').innerHTML = '';
    ub.innerHTML = (info.unlocked || []).length ? '<small class="wb-label">New achievement' + (info.unlocked.length > 1 ? 's' : '') + '</small><div class="wb-chips">' + info.unlocked.map((a) => '<span class="win-badge"><i>' + a.icon + '</i><b>' + a.name + '</b></span>').join('') + '</div>' : '';
    $('#win').classList.toggle('busy', !!(info.milestone || (info.unlocked || []).length));
    $('#win-stars').innerHTML = [1, 2, 3].map((n) => '<span class="' + (n <= stars ? '' : 'off') + '">★</span>').join('');
    $('#win-time').textContent = fmtTime(G.elapsed);
    $('#win-hints').textContent = G.hints;
    const nd = G.spec.mode === 'daily' ? nextDailyN(G.spec.day) : 0;
    const nextLabel = G.spec.mode === 'level' ? (isGolden(G.spec.id + 1) ? '✨ Golden Level ' : 'Level ') + (G.spec.id + 1) : G.spec.mode === 'daily' ? (nd ? 'Daily #' + nd : 'All 10 done! See results') : 'Another one';
    $('#win-next').textContent = nextLabel;
    const conf = $('#confetti');
    conf.innerHTML = '';
    const bits = holidayOn() ? ['❄️', '🎄', '🎁', '⭐', '🐾'] : ['🐾', '✨', '🐟', '💛', '🧶'];
    for (let k = 0; k < 36; k++) {
      const s = document.createElement('span');
      s.textContent = bits[k % bits.length];
      s.style.left = Math.random() * 100 + '%';
      s.style.animationDuration = 2.2 + Math.random() * 2.5 + 's';
      s.style.animationDelay = Math.random() * 1.2 + 's';
      conf.appendChild(s);
    }
    paintJasperImages();
    if (G.spec.golden) { $('#win .win-face .jasper-img').src = 'assets/leo-full.webp'; $('#win-title').textContent = 'Golden level cleared!'; }
    $('#win').classList.toggle('golden', !!G.spec.golden);
    $('#win').hidden = false;
  }
  function winNext() {
    $('#win').hidden = true;
    const s = G.spec;
    if (s.mode === 'level') startGame(levelSpec(s.id + 1));
    else if (s.mode === 'daily') { const nd = nextDailyN(s.day); if (nd) startGame(dailySpec(s.day, nd)); else openDaily(s.day); }
    else startGame(freeSpec());
  }

  // ---------------------------------------------------------------- skip / restart
  function skip() {
    const s = G.spec;
    const msg = s.mode === 'level'
      ? 'Skip Level ' + s.id + '? Your board and treats are saved, so you can come back to it any time from All Levels.'
      : s.mode === 'daily' ? 'Skip Daily #' + s.n + ' for now? Your board, treats and time are saved for when you come back.' : 'Get a brand new puzzle?';
    openModal('<h2>Skip?</h2><p>' + msg + '</p>' + actions([['Skip it', 'confirm-skip', 'primary'], ['Keep playing', 'close-modal', 'ghost']]));
  }
  function confirmSkip() {
    closeModal();
    const s = G.spec;
    if (s.mode === 'free') { forgetProgress(); persist(); return startGame(freeSpec()); }
    saveCurrent(); // the board and treats wait for you; skipping doesn't use up the first try
    if (s.mode === 'level') {
      if (!save.levels[s.id]) save.levels[s.id] = { skipped: true };
      save.level = Math.max(save.level, s.id + 1);
      setTimeout(() => lbSync(), 600);
      persist();
      startGame(levelSpec(s.id + 1));
    } else {
      persist(); openDaily(s.day);
    }
  }
  // Clear button: wipe ✕ marks for free, or start the whole puzzle over
  function clearMenu() {
    if (!G || G.done) return;
    if (G.lives <= 0) return outOfTreats();
    openModal('<h2>Clear or start over?</h2><p>Clearing removes your ✕ marks and keeps placed ' + pieceName() + 's. Starting over resets the whole board and your treats.</p>' +
      actions([['Clear ✕ marks', 'clear-marks', 'primary'], ['Start over', 'start-over', 'danger'], ['Cancel', 'close-modal', 'ghost']]));
  }
  function puzzleTitle() { const s = G.spec; return s.mode === 'level' ? (s.golden ? 'Golden Level ' : 'Level ') + s.id : s.mode === 'daily' ? 'Daily #' + s.n : 'this puzzle'; }
  function askStartOver() {
    if (!G || G.done) return;
    const k = firstKey(G.spec);
    if (!k || !G.firstRun || k in save.first) return doStartOver(); // practice: no penalty, no question
    openModal('<h2>Are you sure?</h2><p>Starting over counts as finishing <b>' + puzzleTitle() + '</b> with <b>0 treats</b> on the leaderboard. Treats only count on a puzzle\'s first completion.</p>' +
      actions([['Start over · 0 treats', 'start-over-yes', 'danger'], ['Cancel', 'start-over-no', 'ghost']]));
  }
  function doStartOver(recordZero) {
    closeModal();
    const k = firstKey(G.spec);
    if (recordZero && k && !(k in save.first)) { save.first[k] = 0; G.firstRun = false; persist(); setTimeout(() => lbSync(), 400); }
    G.restarted = true; G.lives = G.maxLives; G.wrongPlaced = 0; G.knownWrong = []; G.history = []; G.state.fill(OPEN);
    if (G.spec.mode !== 'daily') { G.elapsed = 0; renderTimer(); } // dailies keep their clock so restarts can't help the time race
    clearHint(); renderCells(); renderLives(); renderHeader(); saveCurrent();
  }
  function restart() {
    if (!G || G.done) return;
    const changes = [];
    G.state.forEach((v, i) => { if (v !== OPEN && !isLocked(i)) changes.push({ i, to: OPEN }); });
    if (!changes.length) return toast('Nothing to clear. Placed ' + pieceName() + 's stay locked.');
    setCells(changes);
    toast('✕ marks cleared. ' + pieceName() + 's stay locked (Undo brings the marks back)');
  }

  // ---------------------------------------------------------------- screens
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    clearHint();
    window.scrollTo(0, 0);
  }
  function goHome() {
    $('#win').hidden = true;
    if (G && !G.done) saveCurrent();
    renderHome();
    showScreen('home');
  }
  function renderHome() {
    $('#home-level-label').textContent = (save.progress && save.progress['level:' + save.level] ? 'Continue' : 'Play') + (isGolden(save.level) ? ' ✨ Golden Level ' : ' Level ') + save.level;
    $('.play-btn').classList.toggle('golden', isGolden(save.level));
    const streakAlive = save.daily.last === todayStr() || save.daily.last === yesterdayStr();
    const todayCount = dailyDoneCount(todayStr());
    $('#home-streak').textContent = (streakAlive ? save.daily.streak : 0) + ' day' + ((streakAlive ? save.daily.streak : 0) === 1 ? '' : 's');
    {
      const sk = streakNow(), card = $('#streak-card');
      card.classList.toggle('lit', sk.today);
      card.classList.toggle('waiting', sk.alive && !sk.today);
      $('#sc-title').textContent = sk.n ? sk.n + '-day streak' : 'Start a streak';
      $('#sc-sub').textContent = sk.today ? 'Done for today · best ' + Math.max(sk.best, sk.n)
        : sk.alive ? 'Play a daily today to keep it'
        : 'One daily a day builds it' + (sk.best > 1 ? ' · best ' + sk.best : '');
      // last 7 days: which ones are part of the current streak
      let dots = '';
      const lastN = sk.alive ? dayNum(save.daily.last) : -1e9, firstN = lastN - sk.n + 1;
      for (let k = 6; k >= 0; k--) {
        const d = new Date(); d.setDate(d.getDate() - k);
        const n = dayNum(todayStr(d)), on = n >= firstN && n <= lastN;
        dots += '<i class="' + (on ? 'on' : '') + (k === 0 ? ' today' : '') + '" title="' + d.toLocaleDateString(undefined, { weekday: 'long' }) + '">' + d.toLocaleDateString(undefined, { weekday: 'narrow' }) + '</i>';
      }
      $('#sc-week').innerHTML = dots;
    }
    $('#home-daily-sub').textContent = todayCount === DAILY_COUNT ? 'All 10 solved today!' : 'Today: ' + todayCount + ' of ' + DAILY_COUNT + ' solved';
    // level progress card
    const recs = Object.values(save.levels);
    const solved = recs.filter((r) => r.done).length;
    const stars = recs.reduce((t, r) => t + (r.done ? r.stars || 0 : 0), 0);
    const skipped = recs.filter((r) => r.skipped && !r.done).length;
    $('#home-level-num').textContent = save.level;
    $('#home-solved').textContent = solved;
    $('#home-stars').textContent = stars;
    // progress through the current board size
    const size = baseSize(save.level);
    let first = save.level, last = save.level;
    while (first > 1 && baseSize(first - 1) === size) first--;
    while (baseSize(last + 1) === size && last < 400) last++;
    const pct = size === 10 ? 100 : Math.round(((save.level - first) / (last - first + 1)) * 100);
    $('#home-bar').style.width = Math.max(4, pct) + '%';
    $('#home-next').textContent = size === 10
      ? 'Biggest boards: 10 × 10' + (skipped ? ' · ' + skipped + ' skipped to revisit' : '')
      : (last - save.level + 1) + ' more until ' + (size + 1) + ' × ' + (size + 1) + ' boards' + (skipped ? ' · ' + skipped + ' skipped' : '');
    $('#home-size').textContent = size + ' × ' + size;
    $('#home-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#home-lb-sub').textContent = homeLbSub();
    $('#home-ach-sub').textContent = Object.keys(save.achievements).length + ' of ' + ACHIEVEMENTS.length + ' unlocked';
  }
  function renderLevels() {
    const grid = $('#level-grid');
    const max = Math.max(30, Math.ceil((save.level + 10) / 5) * 5);
    let html = '', lastSize = 0;
    for (let n = 1; n <= max; n++) {
      const size = baseSize(n);
      if (size !== lastSize) { html += '<div class="level-size">' + size + ' × ' + size + '</div>'; lastSize = size; }
      const rec = save.levels[n] || {};
      const locked = n > save.level;
      const cls = 'level-tile' + (isGolden(n) ? ' golden' : '') + (n === save.level ? ' current' : '') + (locked ? ' locked' : '') + (rec.skipped && !rec.done ? ' skipped' : '');
      const starHtml = rec.done ? '<span class="tile-stars">' + [1, 2, 3].map((k) => '<i class="' + (k <= (rec.stars || 1) ? 'on' : '') + '">★</i>').join('') + '</span>' : '';
      const sub = rec.done ? fmtTime(rec.best || 0) : rec.skipped ? 'Skipped' : n === save.level ? 'Up next' : isGolden(n) ? '✨ Golden' : '';
      const label = (isGolden(n) ? 'Golden level ' : 'Level ') + n + (rec.done ? ', ' + rec.stars + ' stars, best time ' + fmtTime(rec.best || 0) : rec.skipped ? ', skipped' : locked ? ', locked' : '');
      html += '<button class="' + cls + (rec.done ? ' done' : '') + '" data-level="' + n + '"' + (locked ? ' disabled' : '') + ' aria-label="' + label + '">' + starHtml + '<b>' + n + '</b><small>' + sub + '</small></button>';
    }
    grid.innerHTML = html;
    const recs = Object.values(save.levels);
    $('#levels-sub').textContent = recs.filter((r) => r.done).length + ' solved · ' + recs.reduce((t, r) => t + (r.done ? r.stars || 0 : 0), 0) + ' ★';
    showScreen('levels');
    const cur = grid.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  // ---------------------------------------------------------------- modals
  function actions(list) {
    return '<div class="modal-actions">' + list.map(([label, act, kind]) => '<button class="btn ' + kind + '" data-action="' + act + '">' + label + '</button>').join('') + '</div>';
  }
  function openModal(html, wide) { const c = $('#modal-card'); c.innerHTML = html; c.classList.toggle('wide', !!wide); $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; }

  function openHowTo() {
    openModal(
      '<h2>How to play</h2>' +
      '<div class="howto-step"><div class="num">1</div><p>Put <b>one Jasper</b> in every <b>color patch</b>.</p></div>' +
      '<div class="howto-step"><div class="num">2</div><p>Put <b>one Jasper</b> in every <b>row</b> and every <b>column</b>.</p></div>' +
      '<div class="howto-step"><div class="num">3</div><p>Jaspers <b>never touch</b> each other, not even corner to corner.</p></div>' +
      '<p><b>Tap</b> a square once to cross it out ✕ (tap again to clear it). <b>Double-tap</b> to place Jasper. Once Jasper is placed in a correct spot, they are <b>locked</b> so they cannot be removed by accident. <b>Drag</b> your finger to cross out lots of squares at once.</p>' +
      '<p>You have <b>3 treats</b>. Put Jasper on a wrong square and a treat breaks. Run out? Start the puzzle over.</p>' +
      '<p>Every 7 to 15 levels there\'s a <b>golden treat level</b> starring <b>Leo</b>: an 8 × 8 board with just <b>one</b> treat.</p>' +
      '<p>Stuck? Hints are free and unlimited. They explain <i>why</i>, and can do the move for you.</p>' +
      actions([["Got it", 'close-modal', 'primary'], ['Play the tutorial', 'tutorial', 'ghost']]), true
    );
  }

  function openSettings() {
    const s = save.settings;
    const sw = (key, title, desc) => '<div class="set-row"><div class="label">' + title + (desc ? '<small>' + desc + '</small>' : '') + '</div><button class="switch' + (s[key] ? ' on' : '') + '" data-toggle="' + key + '" role="switch" aria-checked="' + !!s[key] + '" aria-label="' + title + '"></button></div>';
    const quiet = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/></svg>';
    const loud = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
    const slider = (key, title, desc) => '<div class="set-row slider-row"><div class="label">' + title + '<small>' + desc + '</small></div><div class="vol-wrap">' + quiet +
      '<input type="range" min="0" max="100" step="1" value="' + Math.round(s[key] * 100) + '" data-volume="' + key + '" aria-label="' + title + '" style="--pct:' + Math.round(s[key] * 100) + '%"' + (s.sound ? '' : ' disabled') + '>' + loud + '</div></div>';
    $('#settings-body').innerHTML =
      '<div class="group-label">Appearance</div>' +
      '<div class="group"><div class="set-row"><div class="choice-grid">' +
      ['auto', 'light', 'dark'].map((t) => '<button class="choice' + (s.theme === t ? ' on' : '') + '" data-theme-pick="' + t + '">' + cap(t) + '</button>').join('') +
      '</div></div></div>' +
      '<div class="group-foot">Auto matches your phone\'s light or dark setting.</div>' +
      '<div class="group-label">Winter look</div>' +
      '<div class="group"><div class="set-row"><div class="choice-grid">' +
      ['auto', 'on', 'off'].map((t) => '<button class="choice' + ((s.holiday || 'auto') === t ? ' on' : '') + '" data-holiday-pick="' + t + '">' + cap(t) + '</button>').join('') +
      '</div></div></div>' +
      '<div class="group-foot">Snow, a Santa hat for Jasper and winter treats. Auto shows it from Nov 15 to Jan 6.</div>' +

      '<div class="group-label">Sound</div>' +
      '<div class="group">' + sw('sound', 'Sounds') +
      slider('fxVol', 'Game sounds', 'Taps, placing Jasper, broken treats') +
      slider('winVol', 'Celebrations', 'Hints and the winning chime') + '</div>' +
      '<div class="group-label">Gameplay</div>' +
      '<div class="group">' +
      sw('autoX', 'Auto-cross', 'Lightly cross out squares a Jasper rules out') +
      sw('timer', 'Show timer') +
      (canVibrate ? sw('vibrate', 'Vibration') : '') + '</div>' +

      '<div class="group-label">Leaderboard</div>' +
      '<div class="group">' +
      '<label class="set-row input-row"><span class="label">Your name</span><input id="lb-name" maxlength="24" placeholder="Your name" value="' + escapeHtml(save.lb.name) + '" autocomplete="off"></label>' +
      '<label class="set-row input-row"><span class="label">Family code</span><input id="lb-room" maxlength="40" placeholder="jasper-…" value="' + escapeHtml(save.lb.room) + '" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
      '<button class="set-row link-row" data-action="lb-join"><span class="label">' + (lbReady() ? 'Save & Sync' : 'Join Leaderboard') + '</span><span class="lb-status" id="lb-status">' + lbStatusText() + '</span></button>' +
      '</div>' +
      '<div class="group-foot">Use the same family code on both phones. Only your name and puzzle times are shared.</div>' +
      '<div class="group-label">Progress</div>' +
      '<div class="group">' +
      '<button class="set-row link-row" data-action="backup-copy"><span class="label">Copy Backup Code</span><svg class="chev" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<button class="set-row link-row" data-action="backup-restore"><span class="label">Restore From Code</span><svg class="chev" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '</div>' +
      '<div class="group-foot">Progress is saved on this device. A backup code lets you move it to a new phone. Add JasperDoku to your Home Screen so it\'s never cleared.</div>' +
      '<div class="group" style="margin-top:22px"><button class="set-row danger-row" data-action="reset-ask">Reset All Progress</button></div>' +
      '<div class="group-foot" style="margin-bottom:8px">' +
      '<a href="#" data-action="tutorial" class="foot-link">Replay the tutorial</a></div>';
    showScreen('settings');
  }
  function openFreePlay() {
    const s = save.settings;
    const sizes = [5, 6, 7, 8, 9, 10].map((n) => '<button class="choice' + (s.freeSize === n ? ' on' : '') + '" data-free-size="' + n + '">' + n + '×' + n + '</button>').join('');
    const diffs = ['easy', 'medium', 'hard'].map((d) => '<button class="choice' + (s.freeDiff === d ? ' on' : '') + '" data-free-diff="' + d + '">' + cap(d) + '</button>').join('');
    openModal('<h2>Free Play</h2><p>Endless random puzzles. Pick a size and how tricky.</p><strong>Board size</strong><div class="choice-grid">' + sizes + '</div><strong>Difficulty</strong><div class="choice-grid">' + diffs + '</div>' + actions([['Start', 'free-start', 'primary'], ['Cancel', 'close-modal', 'ghost']]), true);
  }

  // ---------------------------------------------------------------- achievements
  const ACHIEVEMENTS = [
    { id: 'first', icon: '🐾', c: '#7ECFA0', name: 'First Pounce', desc: 'Solve your first puzzle', test: (x) => x.st.wins >= 1 },
    { id: 'flawless', icon: '💎', c: '#8CB8F5', name: 'Purrfect', desc: 'Solve a puzzle with no mistakes and no hints', test: (x) => x.st.flawless >= 1 },
    { id: 'flawless10', icon: '👑', c: '#FFC245', name: "The Cat's Whiskers", desc: '10 flawless solves', test: (x) => x.st.flawless >= 10 },
    { id: 'nohint10', icon: '🧠', c: '#B79BF2', name: 'Independent Kitty', desc: 'Solve 10 puzzles without a hint', test: (x) => x.st.noHint >= 10 },
    { id: 'lv10', icon: '🐱', c: '#FF9F94', name: 'Kitten', desc: 'Finish level 10', test: (x) => x.sv.level > 10 },
    { id: 'size7', icon: '🧩', c: '#7FD3CC', name: 'Growing Up', desc: 'Unlock 7 × 7 boards', test: (x) => baseSize(x.sv.level) >= 7 },
    { id: 'lv25', icon: '🐈', c: '#FFB861', name: 'Alley Cat', desc: 'Finish level 25', test: (x) => x.sv.level > 25 },
    { id: 'lv50', icon: '🦁', c: '#F2A93B', name: 'Lion Heart', desc: 'Finish level 50', test: (x) => x.sv.level > 50 },
    { id: 'lv100', icon: '🏆', c: '#FFC245', name: 'Legend of the Litter', desc: 'Finish level 100', test: (x) => x.sv.level > 100 },
    { id: 'big10', icon: '🐯', c: '#E8A06A', name: 'Big Cat', desc: 'Solve a 10 × 10 puzzle', test: (x) => x.st.big10 >= 1 },
    { id: 'speed6', icon: '⚡️', c: '#FFD45C', name: 'Quick Paws', desc: 'Solve a 6 × 6 in under 45 seconds, no hints', test: (x) => x.N === 6 && x.elapsed < 45 && x.hints === 0 },
    { id: 'speed8', icon: '💨', c: '#8ECDF7', name: 'Zoomies', desc: 'Solve an 8 × 8 in under 2 minutes, no hints', test: (x) => x.N === 8 && x.elapsed < 120 && x.hints === 0 },
    { id: 'daily1', icon: '☀️', c: '#FFB861', name: 'Morning Routine', desc: 'Solve a daily puzzle', test: (x) => x.st.daily >= 1 },
    { id: 'daily10', icon: '🔟', c: '#2A9D96', name: 'Perfect Ten', desc: 'Solve all 10 daily puzzles in one day', test: (x) => !!x.fullDay },
    { id: 'streak3', icon: '🔥', c: '#FF8E80', name: 'Creature of Habit', desc: 'Reach a 3-day daily streak', test: (x) => (x.sv.daily.best || 0) >= 3 },
    { id: 'streak7', icon: '📅', c: '#FF9F94', name: 'Weekly Whiskers', desc: 'Reach a 7-day daily streak', test: (x) => (x.sv.daily.best || 0) >= 7 },
    { id: 'streak30', icon: '🌙', c: '#B79BF2', name: 'Devoted', desc: 'Reach a 30-day daily streak', test: (x) => (x.sv.daily.best || 0) >= 30 },
    { id: 'stars50', icon: '⭐️', c: '#FFC245', name: 'Star Gazer', desc: 'Earn 50 stars on levels', test: (x) => x.stars >= 50 },
    { id: 'refill', icon: '🍪', c: '#E9A85E', name: 'Nine Lives', desc: 'Win a puzzle after starting over', test: (x) => x.st.refillWins >= 1 },
    { id: 'golden1', icon: '🌟', c: '#FFC245', name: 'Golden Touch', desc: 'Clear a golden treat level', test: (x) => (x.st.golden || 0) >= 1 },
    { id: 'golden5', icon: '🐶', c: '#F2C14E', name: "Leo's Best Friend", desc: 'Clear 5 golden treat levels', test: (x) => (x.st.golden || 0) >= 5 },
    { id: 'night', icon: '🦉', c: '#8F93E2', name: 'Night Owl', desc: 'Solve a puzzle between midnight and 4 AM', test: (x) => x.hour !== undefined && x.hour < 4 },
    { id: 'early', icon: '🌅', c: '#FFB861', name: 'Early Bird', desc: 'Solve a puzzle between 4 and 7 AM', test: (x) => x.hour !== undefined && x.hour >= 4 && x.hour < 7 },
    { id: 'free10', icon: '🎲', c: '#9BDDB0', name: 'Free Spirit', desc: 'Win 10 Free Play puzzles', test: (x) => x.st.free >= 10 },
  ];
  ACHIEVEMENTS.push(
    // Levels
    { id: 'lv5', icon: '🐾', c: '#9BDDB0', name: 'Paw Prints', desc: 'Finish level 5', test: (x) => x.sv.level > 5 },
    { id: 'lv75', icon: '😼', c: '#F2A93B', name: 'Top Cat', desc: 'Finish level 75', test: (x) => x.sv.level > 75 },
    { id: 'size8', icon: '🔲', c: '#8ECDF7', name: 'Eight Is Great', desc: 'Unlock 8 × 8 boards', test: (x) => baseSize(x.sv.level) >= 8 },
    { id: 'size9', icon: '🧱', c: '#959AE6', name: 'Nine Squared', desc: 'Unlock 9 × 9 boards', test: (x) => baseSize(x.sv.level) >= 9 },
    { id: 'size10', icon: '🏰', c: '#B79BF2', name: 'Full House', desc: 'Unlock 10 × 10 boards', test: (x) => baseSize(x.sv.level) >= 10 },
    { id: 'stars10', icon: '✨', c: '#FFD45C', name: 'Rising Star', desc: 'Earn 10 stars on levels', test: (x) => x.stars >= 10 },
    { id: 'stars150', icon: '🌌', c: '#8F93E2', name: 'Constellation', desc: 'Earn 150 stars on levels', test: (x) => x.stars >= 150 },
    { id: 'three10', icon: '🥇', c: '#FFC245', name: 'Triple Threat', desc: 'Get 3 stars on 10 different levels', test: (x) => Object.values(x.sv.levels).filter((r) => r.done && r.stars === 3).length >= 10 },
    // Skill
    { id: 'flawless25', icon: '🛡️', c: '#7FD3CC', name: 'Untouchable', desc: '25 flawless solves', test: (x) => x.st.flawless >= 25 },
    { id: 'nohint50', icon: '🎓', c: '#B79BF2', name: 'Big Brain', desc: 'Solve 50 puzzles without a hint', test: (x) => x.st.noHint >= 50 },
    { id: 'sharp8', icon: '👀', c: '#8CB8F5', name: 'Sharp Eyes', desc: 'Flawless on an 8 × 8 or bigger', test: (x) => !!x.flawless && x.N >= 8 },
    { id: 'perfect10', icon: '💯', c: '#FF8E80', name: 'Perfect Pounce', desc: 'Flawless on a 10 × 10', test: (x) => !!x.flawless && x.N === 10 },
    // Speed
    { id: 'speed5', icon: '⚡️', c: '#FFD45C', name: 'Lightning Paws', desc: 'Solve a 5 × 5 in under 15 seconds, no hints', test: (x) => x.N === 5 && x.elapsed < 15 && x.hints === 0 },
    { id: 'speed7', icon: '🏃', c: '#FFB861', name: 'Speedy Whiskers', desc: 'Solve a 7 × 7 in under 1 minute, no hints', test: (x) => x.N === 7 && x.elapsed < 60 && x.hints === 0 },
    { id: 'speed10', icon: '🚀', c: '#8ECDF7', name: 'Rocket Cat', desc: 'Solve a 10 × 10 in under 5 minutes, no hints', test: (x) => x.N === 10 && x.elapsed < 300 && x.hints === 0 },
    // Daily
    { id: 'daily25', icon: '🗓️', c: '#7FD3CC', name: 'Regular', desc: 'Solve 25 daily puzzles', test: (x) => x.st.daily >= 25 },
    { id: 'daily100', icon: '📆', c: '#2A9D96', name: 'Daily Devotee', desc: 'Solve 100 daily puzzles', test: (x) => x.st.daily >= 100 },
    { id: 'hattrick', icon: '🎩', c: '#959AE6', name: 'Hat Trick', desc: 'Solve all 10 dailies on 3 different days', test: (x) => fullDailyDays() >= 3 },
    { id: 'streak14', icon: '🔥', c: '#FF6B5B', name: 'Fortnight Feline', desc: 'Reach a 14-day daily streak', test: (x) => (x.sv.daily.best || 0) >= 14 },
    // Golden
    { id: 'golden10', icon: '🏅', c: '#F2C14E', name: 'Golden Era', desc: 'Clear 10 golden treat levels', test: (x) => (x.st.golden || 0) >= 10 },
    { id: 'puregold', icon: '🪙', c: '#FFC245', name: 'Pure Gold', desc: 'Clear a golden level without a hint', test: (x) => !!x.golden && x.hints === 0 },
    // Rivals
    { id: 'rivals', icon: '🤝', c: '#F58BB4', name: 'Friendly Rivals', desc: 'Join the leaderboard with someone else', test: (x) => x.lb && x.lb.players >= 2 },
    { id: 'beatrival', icon: '😎', c: '#F58BB4', name: 'Bragging Rights', desc: 'Beat your rival on a daily puzzle', test: (x) => x.lb && x.lb.wins >= 1 },
    { id: 'champion', icon: '🏆', c: '#FFC245', name: 'Daily Champion', desc: 'Win a whole day against your rival', test: (x) => x.lb && x.lb.dayWins >= 1 },
  );
  const ACH_CATS = [
    ['Levels', ['first', 'lv5', 'lv10', 'size7', 'lv25', 'size8', 'lv50', 'size9', 'lv75', 'size10', 'lv100', 'big10', 'stars10', 'stars50', 'stars150', 'three10']],
    ['Skill', ['flawless', 'flawless10', 'flawless25', 'nohint10', 'nohint50', 'sharp8', 'perfect10']],
    ['Speed', ['speed5', 'speed6', 'speed7', 'speed8', 'speed10']],
    ['Daily', ['daily1', 'daily25', 'daily100', 'daily10', 'hattrick', 'streak3', 'streak7', 'streak14', 'streak30']],
    ['Golden', ['golden1', 'golden5', 'golden10', 'puregold']],
    ['Rivals', ['rivals', 'beatrival', 'champion']],
    ['Just for Fun', ['refill', 'night', 'early', 'free10']],
  ];
  function fullDailyDays() {
    const per = {};
    for (const k of Object.keys(save.daily.done)) { const d = k.split('#')[0]; if (k.includes('#')) per[d] = (per[d] || 0) + 1; }
    return Object.values(per).filter((n) => n >= DAILY_COUNT).length;
  }
  // leaderboard facts for the Rivals achievements
  function lbFacts() {
    if (!lbReady()) return null;
    const h = headToHead(), me = save.lb.name;
    return { players: h.players.length, wins: h.wins[me] || 0, dayWins: h.dayWins[me] || 0 };
  }
  // achievements earned outside a win (e.g. after syncing the leaderboard) show as a toast
  function checkAchievementsQuietly() {
    const fresh = checkAchievements();
    if (fresh.length) { persist(); toast('🏆 Achievement unlocked: ' + fresh.map((a) => a.name).join(', ')); if ($('#screen-home').classList.contains('active')) renderHome(); }
  }
  // Treats saved on first tries. Levels finished before this feature: estimated from stars.
  function treatTotals() {
    let levels = 0, dailies = 0;
    for (const [k, v] of Object.entries(save.first)) { if (k.startsWith('level:')) levels += v; else if (k.startsWith('daily:')) dailies += v; }
    // levels finished before treats were tracked: estimate from stars
    for (const [n, r] of Object.entries(save.levels)) {
      if (r.done && !('level:' + n in save.first)) levels += isGolden(+n) ? (r.stars === 3 ? 1 : 0) : Math.min(3, r.stars || 0);
    }
    return { levels, dailies, total: levels + dailies };
  }
  function totalStars() { return Object.values(save.levels).reduce((t, r) => t + (r.done ? r.stars || 0 : 0), 0); }
  function checkAchievements(ctx) {
    const x = Object.assign({ st: save.stats, sv: save, stars: totalStars(), hour: new Date().getHours(), lb: lbFacts() }, ctx || {});
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (save.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.test(x); } catch (e) { ok = false; }
      if (ok) { save.achievements[a.id] = todayStr(); fresh.push(a); }
    }
    return fresh;
  }
  function openAchievements() {
    const got = ACHIEVEMENTS.filter((a) => save.achievements[a.id]).length;
    const row = (a) => {
      const when = save.achievements[a.id];
      return '<div class="ach-row' + (when ? '' : ' locked') + '"><span class="ach-icon" style="--c:' + a.c + '">' + (when ? a.icon : '🔒') + '</span>' +
        '<div class="label">' + a.name + '<small>' + a.desc + '</small></div>' + (when ? '<span class="ach-date">' + shortDate(when) + '</span>' : '') + '</div>';
    };
    const byId = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
    const placed = new Set(ACH_CATS.flatMap(([, ids]) => ids));
    const cats = ACH_CATS.concat([['More', ACHIEVEMENTS.filter((a) => !placed.has(a.id)).map((a) => a.id)]]);
    let sections = '';
    for (const [title, ids] of cats) {
      const list = ids.map((id) => byId[id]).filter(Boolean);
      if (!list.length) continue;
      // unlocked first, keeping the natural order within each part
      const ordered = list.filter((a) => save.achievements[a.id]).concat(list.filter((a) => !save.achievements[a.id]));
      const n = list.filter((a) => save.achievements[a.id]).length;
      sections += '<div class="group-label ach-cat"><span>' + title + '</span><span>' + n + ' / ' + list.length + '</span></div><div class="group">' + ordered.map(row).join('') + '</div>';
    }
    $('#ach-body').innerHTML =
      '<div class="ach-summary"><div class="ring" style="--p:' + Math.round((got / ACHIEVEMENTS.length) * 100) + '"><span>' + got + '</span></div><div><b>' + got + ' of ' + ACHIEVEMENTS.length + ' unlocked</b><small>Keep solving to collect them all</small></div></div>' + sections;
    showScreen('achievements');
  }
  function shortDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ---------------------------------------------------------------- daily calendar
  let calMonth = new Date(); calMonth.setDate(1);
  let dailyDay = todayStr();
  function openDaily(day) {
    dailyDay = day || todayStr();
    const [y, m] = dailyDay.split('-').map(Number);
    calMonth = new Date(y, m - 1, 1);
    renderDaily(); showScreen('daily');
    lbSync().then((ok) => { if (ok && $('#screen-daily').classList.contains('active')) renderDaily(); });
  }
  function renderDaily() {
    const today = todayStr();
    const streakAlive = save.daily.last === today || save.daily.last === yesterdayStr();
    const streak = streakAlive ? save.daily.streak : 0;
    $('#daily-stats').innerHTML =
      '<div><strong>' + streak + '</strong><small>day streak</small></div>' +
      '<div><strong>' + (save.daily.best || 0) + '</strong><small>best streak</small></div>' +
      '<div><strong>' + dailyDoneCount(today) + '/' + DAILY_COUNT + '</strong><small>today</small></div>';
    // the selected day's ten puzzles
    const done = dailyDoneCount(dailyDay), nd = nextDailyN(dailyDay);
    $('#daily-day-title').textContent = dailyDay === today ? 'Today' : new Date(dailyDay + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('#daily-day-sub').textContent = done + ' of ' + DAILY_COUNT + ' solved';
    const best = lbReady() ? lbBest() : {};
    const me = save.lb.name;
    let cards = '';
    for (let n = 1; n <= DAILY_COUNT; n++) {
      const key = dailyKey(dailyDay, n), rec = save.daily.done[key], cfg = DAILY_LADDER[n - 1];
      const rivals = Object.entries(best['daily:' + key] || {}).filter(([p]) => p !== me);
      const rival = rivals.length ? '<span class="dc-rival">' + avatar(rivals[0][0], 1) + fmtTime(rivals[0][1].t) + '</span>' : '';
      const status = rec ? '<span class="dc-time">✓ ' + fmtTime(rec.time) + '</span>' : save.daily.forfeit[key] ? '<span class="dc-play muted">Skipped</span>' : '<span class="dc-play">' + (n === nd ? 'Play' : '') + '</span>';
      cards += '<button class="daily-card' + (rec ? ' done' : '') + (n === nd ? ' next' : '') + '" data-daily-n="' + n + '" aria-label="Daily ' + n + ', ' + cfg.size + ' by ' + cfg.size + (rec ? ', solved in ' + fmtTime(rec.time) : '') + '">' +
        '<span class="dc-n">#' + n + '</span><span class="dc-size">' + cfg.size + ' × ' + cfg.size + '</span>' + status + rival + '</button>';
    }
    $('#daily-cards').innerHTML = cards;
    const play = $('#daily-play');
    play.hidden = !nd;
    if (nd) play.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg><span>' + (done ? 'Continue · Daily #' + nd : 'Start Daily #1') + '</span>';
    // month grid
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    $('#cal-title').textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const now = new Date();
    $('#cal-next').disabled = y > now.getFullYear() || (y === now.getFullYear() && m >= now.getMonth());
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => '<span class="cal-wd">' + d + '</span>').join('');
    for (let k = 0; k < first; k++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const ds = todayStr(new Date(y, m, d));
      const c = dailyDoneCount(ds);
      const future = ds > today;
      const cls = 'cal-day' + (c === DAILY_COUNT ? ' solved' : c ? ' partial' : '') + (ds === today ? ' today' : '') + (ds === dailyDay ? ' selected' : '') + (future ? ' future' : '');
      html += '<button class="' + cls + '" data-day="' + ds + '"' + (future ? ' disabled' : '') + ' aria-label="' + shortDate(ds) + ', ' + c + ' of ' + DAILY_COUNT + ' solved" style="--p:' + Math.round((c / DAILY_COUNT) * 100) + '"><span>' + d + '</span></button>';
    }
    $('#cal-grid').innerHTML = html;
  }

  // ---------------------------------------------------------------- tutorial (4 × 4, guided)
  const TUT = {
    N: 4,
    reg: [2, 0, 1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3],
    colors: [PALETTE[3], PALETTE[2], PALETTE[8], PALETTE[5]], // Mint, Lemon, Pink, Sky
    steps: [
      { target: 1, text: 'Every <b>color</b> needs exactly one Jasper. The <b>green</b> patch has only one square, so Jasper must go there. <b>Double-tap</b> it!' },
      { info: 'Nice! Jasper now owns his <b>row</b> and <b>column</b>, and no other Jasper can <b>touch</b> him, not even corner to corner. Those squares are crossed out.' },
      { target: 7, text: 'Look at the <b>yellow</b> patch: only one square is still open. <b>Double-tap</b> it.' },
      { target: 14, text: 'Now <b>blue</b> has just one open square left. Place Jasper there.' },
      { target: 8, text: 'Last one! Only one <b>pink</b> square is still open.' },
      { done: true, text: 'You solved it! In real puzzles, <b>tap once</b> to cross out squares you rule out yourself, and <b>double-tap</b> to place Jasper. A wrong spot costs one of your <b>3 treats</b>, and hints are always free.' },
    ],
  };
  let tut = null;
  function openTutorial(thenPlay) {
    tut = { step: 0, state: new Array(16).fill(OPEN), thenPlay, lastTap: null };
    const b = $('#tut-board');
    b.style.setProperty('--n', 4);
    b.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.t = i;
      styleCell(el, i, 4, TUT.reg, TUT.colors, 1, 8);
      b.appendChild(el);
    }
    showScreen('tutorial');
    tutRender();
  }
  function tutRender() {
    const st = TUT.steps[tut.step];
    const cells = $('#tut-board').children;
    for (let i = 0; i < 16; i++) {
      const el = cells[i], v = tut.state[i];
      el.classList.toggle('h-place', st.target === i);
      const want = v === JASPER ? 'j' : v === OUT ? 'x' : 'o';
      if (el._k === want) continue;
      el._k = want;
      el.innerHTML = want === 'j' ? '<div class="piece"><img class="jasper-img" alt="Jasper" src="' + jasperSrc + '"></div>' : want === 'x' ? '<div class="mark"></div>' : '';
    }
    $('#tut-text').innerHTML = st.text || st.info;
    $('#tut-dots').innerHTML = TUT.steps.map((_, k) => '<i class="' + (k === tut.step ? 'on' : k < tut.step ? 'past' : '') + '"></i>').join('');
    $('#tut-next').hidden = !(st.info || st.done);
    $('#tut-next').textContent = st.done ? (tut.thenPlay ? 'Start Level 1' : 'Done') : 'Next';
    $('#tut-skip').hidden = !!st.done;
  }
  function tutTap(i) {
    const st = TUT.steps[tut.step];
    if (st.target === undefined) return;
    const now = Date.now();
    const dbl = tut.lastTap && tut.lastTap.i === i && now - tut.lastTap.t < DOUBLE_TAP_MS;
    tut.lastTap = { i, t: now };
    const el = $('#tut-board').children[i];
    if (i !== st.target) { el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); return; }
    if (!dbl) { $('#tut-text').innerHTML = 'Almost! <b>Double-tap</b>: two quick taps on the glowing square.'; sfx('mark'); return; }
    tut.state[i] = JASPER;
    sfx('place');
    // cross out everything this Jasper rules out, one square at a time
    const ruled = E.attacked(4, TUT.reg, i).filter((k) => tut.state[k] === OPEN);
    ruled.forEach((k, n) => setTimeout(() => { tut.state[k] = OUT; tutRender(); }, 120 + n * 45));
    tut.step++;
    setTimeout(tutRender, 0);
    if (TUT.steps[tut.step].done) setTimeout(() => sfx('win'), 300);
  }
  function tutNext() { if (TUT.steps[tut.step].done) return tutFinish(); tut.step++; tutRender(); }
  function tutFinish() {
    save.seenTutorial = true; save.seenHowTo = true; persist();
    const play = tut && tut.thenPlay;
    tut = null;
    if (play) startGame(levelSpec(save.level)); else goHome();
  }
  $('#tut-board').addEventListener('pointerup', (e) => {
    const el = e.target.closest('.cell');
    if (el && tut) tutTap(+el.dataset.t);
  });

  // ---------------------------------------------------------------- backup / restore
  function backupCode() {
    const data = { v: 1, level: save.level, levels: save.levels, daily: save.daily, stats: save.stats, achievements: save.achievements, settings: save.settings, seenTutorial: true };
    return 'JDK1-' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  }
  function backupCopy() {
    const code = backupCode();
    const show = (copied) => openModal('<h2>' + (copied ? 'Backup code copied' : 'Your backup code') + '</h2><p>' +
      (copied ? 'Paste it somewhere safe, like a note or a text to yourself. To restore, open Settings on any phone and tap <b>Restore From Code</b>.' : 'Select and copy this code, then keep it somewhere safe.') +
      '</p><textarea class="code-box" readonly rows="4">' + code + '</textarea>' + actions([['Done', 'close-modal', 'primary']]));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => show(true), () => show(false));
    else show(false);
  }
  function backupRestoreAsk() {
    openModal('<h2>Restore progress</h2><p>Paste a backup code. This <b>replaces</b> the levels, stars, streak and achievements on this phone.</p>' +
      '<textarea class="code-box" id="restore-code" rows="4" placeholder="JDK1-…"></textarea><p class="restore-err" id="restore-err" hidden></p>' +
      actions([['Restore', 'backup-do', 'primary'], ['Cancel', 'close-modal', 'ghost']]));
  }
  function backupRestoreDo() {
    const raw = ($('#restore-code').value || '').trim();
    try {
      if (!raw.startsWith('JDK1-')) throw new Error('bad');
      const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(5)))));
      if (!data || typeof data.level !== 'number' || !data.levels) throw new Error('bad');
      const d = defaults();
      save = Object.assign(d, {
        level: data.level, levels: data.levels, daily: Object.assign(d.daily, data.daily || {}),
        stats: Object.assign(d.stats, data.stats || {}), achievements: data.achievements || {},
        settings: Object.assign(d.settings, data.settings || {}), seenTutorial: true, seenHowTo: true,
      });
      persist(); applyTheme(); closeModal(); G = null; goHome(); toast('Progress restored');
    } catch (err) {
      const el = $('#restore-err'); el.hidden = false; el.textContent = 'That code doesn\'t look right. Check that the whole code was pasted.';
    }
  }

  // ---------------------------------------------------------------- leaderboard (Supabase)
  const CFG = window.JASPER_CONFIG || {};
  const lbConfigured = () => !!(CFG.supabaseUrl && CFG.supabaseKey);
  const lbReady = () => lbConfigured() && !!save.lb.name && !!save.lb.room;
  function escapeHtml(t) { return String(t || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function lbStatusText() {
    if (!lbConfigured()) return 'Not set up yet';
    if (!lbReady()) return '';
    return save.lb.lastSync ? 'Synced ' + new Date(save.lb.lastSync).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'Connected';
  }
  async function rpc(fn, body) {
    const headers = { 'Content-Type': 'application/json', apikey: CFG.supabaseKey };
    if (!/^sb_/.test(CFG.supabaseKey)) headers.Authorization = 'Bearer ' + CFG.supabaseKey; // older "anon" keys
    const res = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.status);
    return text ? JSON.parse(text) : null;
  }
  function lbQueue(puzzle, time, mistakes, hints) {
    if (!save.lb.room || !save.lb.name) return;
    save.lb.pending.push({ puzzle, time: Math.max(1, time), mistakes, hints });
    persist();
    lbSync();
  }
  let lbBusy = null;
  function lbSync(force) {
    if (!lbReady()) return Promise.resolve(false);
    if (lbBusy && !force) return lbBusy;
    lbBusy = (async () => {
      try {
        // share level progress when it changed since last time
        const solvedN = Object.values(save.levels).filter((r) => r.done).length;
        const progKey = save.level + '/' + solvedN + '/' + totalStars();
        if (save.lb.sentProgress !== progKey) {
          save.lb.pending = save.lb.pending.filter((p) => p.puzzle !== 'progress:level');
          save.lb.pending.push({ puzzle: 'progress:level', time: save.level, mistakes: Math.min(999, solvedN), hints: Math.min(999, totalStars()), progKey });
          persist();
        }
        const tt = treatTotals(), treatKey = tt.levels + '/' + tt.dailies;
        if (save.lb.sentTreats !== treatKey) {
          save.lb.pending = save.lb.pending.filter((p) => p.puzzle !== 'progress:treats');
          save.lb.pending.push({ puzzle: 'progress:treats', time: Math.min(86400, tt.total + 1), mistakes: Math.min(999, tt.levels), hints: Math.min(999, tt.dailies), treatKey });
          persist();
        }
        const sk = streakNow(), streakKey = save.daily.streak + '/' + (save.daily.best || 0) + '/' + save.daily.last;
        if (save.daily.last && save.lb.sentStreak !== streakKey) {
          save.lb.pending = save.lb.pending.filter((p) => p.puzzle !== 'progress:streak');
          save.lb.pending.push({ puzzle: 'progress:streak', time: Math.min(86400, save.daily.streak + 1), mistakes: Math.min(999, sk.best), hints: ((dayNum(save.daily.last) % 1000) + 1000) % 1000, streakKey });
          persist();
        }
        // send anything waiting (works later if the phone was offline)
        while (save.lb.pending.length) {
          const p = save.lb.pending[0];
          await rpc('submit_score', { p_room: save.lb.room, p_player: save.lb.name, p_puzzle: p.puzzle, p_time: p.time, p_mistakes: p.mistakes, p_hints: p.hints });
          if (p.progKey) save.lb.sentProgress = p.progKey;
          if (p.treatKey) save.lb.sentTreats = p.treatKey;
          if (p.streakKey) save.lb.sentStreak = p.streakKey;
          save.lb.pending.shift(); persist();
        }
        const rows = await rpc('get_scores', { p_room: save.lb.room, p_since: save.lb.since || '1970-01-01T00:00:00Z' });
        if (rows && rows.length) {
          save.lb.rows = save.lb.rows.concat(rows.map((r) => [r.player, r.puzzle, r.time_sec, r.mistakes, r.hints, r.created_at]));
          save.lb.since = rows[rows.length - 1].created_at;
        }
        save.lb.lastSync = Date.now();
        setTimeout(checkAchievementsQuietly, 0);
        persist();
        return true;
      } catch (e) { return false; } finally { lbBusy = null; }
    })();
    return lbBusy;
  }
  async function lbJoin() {
    const name = ($('#lb-name').value || '').trim(), room = ($('#lb-room').value || '').trim();
    const st = $('#lb-status');
    if (!lbConfigured()) { st.textContent = 'Not set up yet'; return; }
    if (!name || !room) { st.textContent = 'Enter both'; return; }
    st.textContent = 'Checking…';
    try {
      const ok = await rpc('check_room', { p_room: room });
      if (!ok) { st.textContent = 'Code not found'; return; }
      const changedRoom = room !== save.lb.room;
      save.lb.name = name; save.lb.room = room;
      if (changedRoom) { save.lb.rows = []; save.lb.since = null; }
      persist();
      await lbSync(true);
      st.textContent = 'Connected ✓';
      toast('Leaderboard connected');
    } catch (e) { st.textContent = 'No connection'; }
  }

  // Each player's counted result per daily puzzle: their FIRST attempt, scored as time + 30 s per hint.
  function lbBest() {
    const best = {}; // 'daily:YYYY-MM-DD#n' -> player -> { t: score, raw, hints, at }
    for (const [player, puzzle, time, , hints, at] of save.lb.rows) {
      if (!/^daily:\d{4}-\d{2}-\d{2}#\d+$/.test(puzzle)) continue; // only the 10-a-day puzzles
      const p = (best[puzzle] = best[puzzle] || {});
      if (!p[player] || at < p[player].at) p[player] = { t: time + HINT_PENALTY * (hints || 0), raw: time, hints: hints || 0, at };
    }
    return best;
  }
  function lbPlayers() {
    const set = new Set(save.lb.rows.filter((r) => /^(daily:|progress:(level|treats)$)/.test(r[1])).map((r) => r[0]));
    if (save.lb.name) set.add(save.lb.name);
    const me = save.lb.name;
    return [...set].sort((a, b) => (a === me ? -1 : b === me ? 1 : a.localeCompare(b)));
  }
  // each player's latest level progress
  function lbLevels() {
    const out = {};
    for (const [player, puzzle, level, solved, stars, at] of save.lb.rows) {
      if (puzzle !== 'progress:level') continue;
      if (!out[player] || at > out[player].at) out[player] = { level, solved, stars, at };
    }
    // show this phone's own progress immediately, even before it syncs
    if (save.lb.name) out[save.lb.name] = { level: save.level, solved: Object.values(save.levels).filter((r) => r.done).length, stars: totalStars(), at: new Date().toISOString() };
    return out;
  }
  // each player's daily streak (only counts if their last daily was today or yesterday)
  function lbStreaks() {
    const out = {}, latest = {};
    for (const [player, puzzle, t, best, last, at] of save.lb.rows) {
      if (puzzle !== 'progress:streak') continue;
      if (!latest[player] || at > latest[player].at) latest[player] = { t, best, last, at };
    }
    const tn = ((dayNum(todayStr()) % 1000) + 1000) % 1000, yn = ((dayNum(yesterdayStr()) % 1000) + 1000) % 1000;
    for (const [p, r] of Object.entries(latest)) out[p] = (r.last === tn || r.last === yn) ? r.t - 1 : 0;
    if (save.lb.name) out[save.lb.name] = streakNow().n;
    return out;
  }
  function lbTreats() {
    const out = {};
    for (const [player, puzzle, t, lv, dy, at] of save.lb.rows) {
      if (puzzle !== 'progress:treats') continue;
      if (!out[player] || at > out[player].at) out[player] = { total: t - 1, levels: lv, dailies: dy, at };
    }
    if (save.lb.name) { const m = treatTotals(); out[save.lb.name] = { total: m.total, levels: m.levels, dailies: m.dailies, at: new Date().toISOString() }; }
    return out;
  }
  // who won each puzzle / day
  function lbWinner(entry) {
    const ps = Object.keys(entry || {});
    if (ps.length < 2) return null;
    const min = Math.min(...ps.map((p) => entry[p].t));
    const top = ps.filter((p) => entry[p].t === min);
    return top.length === 1 ? top[0] : 'tie';
  }
  function dayResult(day, best) {
    const wins = {};
    let shared = 0;
    for (let n = 1; n <= DAILY_COUNT; n++) {
      const w = lbWinner(best['daily:' + dailyKey(day, n)]);
      if (!w) continue;
      shared++;
      if (w !== 'tie') wins[w] = (wins[w] || 0) + 1;
    }
    return { wins, shared };
  }
  function headToHead() {
    const best = lbBest(), players = lbPlayers(), wins = {}, dayWins = {};
    players.forEach((p) => { wins[p] = 0; dayWins[p] = 0; });
    let shared = 0;
    const days = new Set();
    for (const key in best) {
      const w = lbWinner(best[key]);
      if (!w) continue;
      shared++;
      days.add(key.slice(6, 16));
      if (w !== 'tie') wins[w] = (wins[w] || 0) + 1;
    }
    days.forEach((d) => {
      const r = dayResult(d, best);
      const ps = Object.keys(r.wins).sort((a, b) => r.wins[b] - r.wins[a]);
      if (ps.length && (ps.length === 1 || r.wins[ps[0]] > r.wins[ps[1]])) dayWins[ps[0]] = (dayWins[ps[0]] || 0) + 1;
    });
    return { wins, dayWins, shared, players, best };
  }
  const avatar = (name, k) => '<span class="lb-av" style="--c:' + ['#2A9D96', '#F58BB4', '#8CB8F5', '#FFB938'][k % 4] + '">' + escapeHtml((name || '?').charAt(0).toUpperCase()) + '</span>';

  let lbDay = todayStr();
  function openLeaderboard() { lbDay = todayStr(); renderLeaderboard(); showScreen('leaderboard'); lbSync().then((ok) => { if (ok) renderLeaderboard(); }); }
  function renderLeaderboard() {
    const body = $('#lb-body');
    if (!lbReady()) {
      body.innerHTML = '<div class="lb-empty"><div class="lb-empty-icon">🏆</div><b>Race each other</b><p>Add your name and family code in Settings on both phones. Your first try at each of the 10 daily puzzles is raced against each other.</p><button class="btn primary" data-action="settings">Open Settings</button></div>';
      return;
    }
    const { wins, dayWins, shared, players, best } = headToHead();
    const me = save.lb.name;
    const two = players.slice(0, 2);
    const tab = save.lb.tab === 'levels' ? 'levels' : 'daily';
    const tr = lbTreats(), lv = lbLevels();
    const crownOf = (vals) => { const ps = two.filter((p) => vals[p] !== undefined); if (ps.length < 2 || vals[ps[0]] === vals[ps[1]]) return null; return vals[ps[0]] > vals[ps[1]] ? ps[0] : ps[1]; };
    const scoreCard = (val, sub, crown) => '<div class="lb-score">' + two.map((p, k) =>
      '<div class="lb-player">' + avatar(p, k) + '<b>' + (crown === p ? '👑 ' : '') + escapeHtml(p) + (p === me ? ' <small>(you)</small>' : '') + '</b><strong>' + val(p) + '</strong><small>' + sub(p) + '</small></div>').join('<div class="lb-vs">vs</div>') +
      (players.length < 2 ? '<div class="lb-vs">vs</div><div class="lb-player waiting">' + avatar('?', 1) + '<b>Waiting…</b><small>Join with the same family code</small></div>' : '') + '</div>';
    const chipRow = (label, vals, fmt) => {
      const c = crownOf(vals);
      return '<div class="lb-row"><span class="label">' + label + '</span><div class="lb-times">' + two.map((p, k) =>
        '<span class="lb-chip' + (c === p ? ' fastest' : '') + (vals[p] === undefined ? ' none' : '') + '">' + avatar(p, k) + (vals[p] === undefined ? '–' : fmt(vals[p])) + '</span>').join('') + '</div></div>';
    };
    const pick = (obj, f) => Object.fromEntries(two.filter((p) => obj[p]).map((p) => [p, f(obj[p])]));
    let html = '<div class="choice-grid lb-tabs"><button class="choice' + (tab === 'daily' ? ' on' : '') + '" data-lb-tab="daily">Daily</button><button class="choice' + (tab === 'levels' ? ' on' : '') + '" data-lb-tab="levels">Levels</button></div>';
    if (tab === 'daily') {
      const winVals = Object.fromEntries(two.map((p) => [p, wins[p] || 0]));
      html += scoreCard((p) => wins[p] || 0, (p) => 'puzzles won · ' + (dayWins[p] || 0) + ' days', crownOf(winVals));
      html += '<div class="group-foot center">' + shared + ' daily puzzle' + (shared === 1 ? '' : 's') + ' raced · first completion only · hints add ' + HINT_PENALTY + 's</div>';
      const stk = lbStreaks();
      html += '<div class="group">' + chipRow('Days won', Object.fromEntries(two.map((p) => [p, dayWins[p] || 0])), (v) => v) +
        chipRow('Daily streak', Object.fromEntries(two.filter((p) => stk[p] !== undefined).map((p) => [p, stk[p]])), (v) => v + (v === 1 ? ' day' : ' days')) +
        chipRow('Treats saved', pick(tr, (r) => r.dailies), (v) => v + ' ' + treatSVG('treat inline-treat')) + '</div>';
      // one day, puzzle by puzzle
      const dr = dayResult(lbDay, best);
      const dayTitle = lbDay === todayStr() ? 'Today' : shortDate(lbDay);
      const score = two.length === 2 ? ' · ' + two.map((p) => escapeHtml(p === me ? 'You' : p) + ' ' + (dr.wins[p] || 0)).join(' – ') : '';
      html += '<div class="group-label lb-day-head"><button class="icon-btn small" data-action="lb-day-prev" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span>' + dayTitle + score + '</span><button class="icon-btn small" data-action="lb-day-next" aria-label="Next day"' + (lbDay >= todayStr() ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>';
      html += '<div class="group">';
      for (let n = 1; n <= DAILY_COUNT; n++) {
        const entry = best['daily:' + dailyKey(lbDay, n)] || {};
        const w = lbWinner(entry);
        html += '<div class="lb-row"><span class="label">#' + n + ' <small>' + DAILY_LADDER[n - 1].size + '×' + DAILY_LADDER[n - 1].size + '</small></span><div class="lb-times">' + two.map((p, k) => {
          const r = entry[p];
          const t = r ? fmtTime(r.t) + (r.hints ? '<i class="lb-hint">💡' + r.hints + '</i>' : '') : '–';
          return '<span class="lb-chip' + (r && w === p ? ' fastest' : '') + (r ? '' : ' none') + '">' + avatar(p, k) + t + '</span>';
        }).join('') + '</div></div>';
      }
      html += '</div>';
      const days = [...new Set(Object.keys(best).map((k) => k.slice(6, 16)))].sort().reverse().slice(0, 14);
      if (days.length) {
        html += '<div class="group-label">Recent Days</div><div class="group">' + days.map((d) => {
          const r = dayResult(d, best);
          const ps = two.map((p) => r.wins[p] || 0);
          const lead = ps.length === 2 && ps[0] !== ps[1];
          return '<button class="lb-row lb-day-row" data-lb-day="' + d + '"><span class="label">' + (d === todayStr() ? 'Today' : shortDate(d)) + ' <small>' + r.shared + ' raced</small></span><span class="lb-day-score">' +
            two.map((p, k) => avatar(p, k) + '<b>' + (r.wins[p] || 0) + '</b>').join('<i>–</i>') + (lead ? ' 👑' : '') + '</span></button>';
        }).join('') + '</div>';
      }
    } else {
      const lvVals = pick(lv, (r) => r.level);
      html += scoreCard((p) => (lv[p] ? lv[p].level : '–'), (p) => (lv[p] ? 'current level · ' + baseSize(lv[p].level) + '×' + baseSize(lv[p].level) : 'not shared yet'), crownOf(lvVals));
      html += '<div class="group">' +
        chipRow('Treats saved', pick(tr, (r) => r.levels), (v) => v + ' ' + treatSVG('treat inline-treat')) +
        chipRow('Levels solved', pick(lv, (r) => r.solved), (v) => v) +
        chipRow('Stars', pick(lv, (r) => r.stars), (v) => v + ' ★') + '</div>';
    }
    html += '<div class="group-foot">Treats are counted on each puzzle\'s first completion: finishing it, or starting it over (which counts as 0). Skipping or leaving doesn\'t use it up, and replays never add more.</div>';
    html += '<button class="btn ghost lb-refresh" data-action="lb-refresh">Refresh</button>';
    html += '<div class="group-foot center">' + lbStatusText() + (save.lb.pending.length ? ' · ' + save.lb.pending.length + ' update(s) waiting to send' : '') + '</div>';
    body.innerHTML = html;
  }
  async function lbWinCompare(key, myScore, counted) {
    if (!lbReady()) { if (!counted && G && G.spec.mode === 'daily') $('#win-rival').innerHTML = '<div class="rival-row">Practice round</div>'; return; }
    await lbSync();
    const best = lbBest()[key] || {};
    const me = save.lb.name;
    const others = Object.keys(best).filter((p) => p !== me);
    if ($('#win').hidden) return;
    let html = counted ? '' : '<div class="rival-row">Practice round · doesn\'t count for the leaderboard</div>';
    const mine = best[me] ? best[me].t : myScore;
    html += others.slice(0, 2).map((p) => {
      const d = best[p].t - mine;
      const msg = d > 0 ? 'You beat ' + escapeHtml(p) + ' by ' + fmtTime(d) + '! 🏆' : d < 0 ? escapeHtml(p) + ' was faster by ' + fmtTime(-d) : 'Tied with ' + escapeHtml(p) + '!';
      return '<div class="rival-row">' + escapeHtml(p) + ': ' + fmtTime(best[p].t) + ' · <b>' + msg + '</b></div>';
    }).join('');
    $('#win-rival').innerHTML = html;
  }
  function homeLbSub() {
    if (!lbReady()) return 'Race each other on the dailies';
    const { wins, players } = headToHead();
    if (players.length < 2) return 'Waiting for a rival to join';
    const lv = lbLevels(), rival = players.find((p) => p !== save.lb.name);
    return players.slice(0, 2).map((p) => (p === save.lb.name ? 'You' : p) + ' ' + (wins[p] || 0)).join(' – ') + ' puzzles' + (rival && lv[rival] ? ' · ' + rival + ' on Level ' + lv[rival].level : '');
  }

  // ---------------------------------------------------------------- misc UI
  function showLoading(on) { $('#loading').hidden = !on; }
  let toastTimer = null;
  function toast(msg, warn) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);background:#3B2F45;color:#fff;padding:10px 18px;border-radius:99px;font-weight:800;z-index:60;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:opacity .3s;max-width:90%;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    t.style.background = warn ? '#D9485F' : '#3B2F45';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
  }

  // ---------------------------------------------------------------- button wiring
  document.addEventListener('click', (e) => {
    const cd = e.target.closest('[data-day]');
    if (cd && !cd.disabled) { dailyDay = cd.dataset.day; return renderDaily(); }
    const lt = e.target.closest('[data-lb-tab]');
    if (lt) { save.lb.tab = lt.dataset.lbTab; persist(); return renderLeaderboard(); }
    const ld = e.target.closest('[data-lb-day]');
    if (ld) { lbDay = ld.dataset.lbDay; renderLeaderboard(); return window.scrollTo(0, 0); }
    const dn = e.target.closest('[data-daily-n]');
    if (dn) return startGame(dailySpec(dailyDay, +dn.dataset.dailyN));
    const lvl = e.target.closest('[data-level]');
    if (lvl && !lvl.disabled) return startGame(levelSpec(+lvl.dataset.level));
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const k = tog.dataset.toggle;
      save.settings[k] = !save.settings[k];
      tog.classList.toggle('on', save.settings[k]);
      persist();
      if (G) { renderCells(true); renderHeader(); }
      if (k === 'sound') { openSettings(); if (save.settings.sound) sfx('place'); }
      return;
    }
    const hp = e.target.closest('[data-holiday-pick]');
    if (hp) { save.settings.holiday = hp.dataset.holidayPick; persist(); applyHoliday(); document.querySelectorAll('[data-holiday-pick]').forEach((b) => b.classList.toggle('on', b === hp)); return; }
    const tp = e.target.closest('[data-theme-pick]');
    if (tp) { save.settings.theme = tp.dataset.themePick; persist(); applyTheme(); document.querySelectorAll('[data-theme-pick]').forEach((b) => b.classList.toggle('on', b === tp)); return; }
    const fs = e.target.closest('[data-free-size]');
    if (fs) { save.settings.freeSize = +fs.dataset.freeSize; persist(); return openFreePlay(); }
    const fd = e.target.closest('[data-free-diff]');
    if (fd) { save.settings.freeDiff = fd.dataset.freeDiff; persist(); return openFreePlay(); }
    if (e.target === $('#modal')) { if (G && !G.done && G.lives <= 0 && $('#screen-game').classList.contains('active')) return; return closeModal(); }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'continue': if (!save.seenTutorial) return openTutorial(true); return startGame(levelSpec(save.level));
      case 'tutorial': e.preventDefault(); closeModal(); return openTutorial(false);
      case 'tut-next': return tutNext();
      case 'tut-skip': return tutFinish();
      case 'achievements': return openAchievements();
      case 'daily-today': { const nd = nextDailyN(dailyDay); return nd ? startGame(dailySpec(dailyDay, nd)) : undefined; }
      case 'cal-prev': calMonth.setMonth(calMonth.getMonth() - 1); return renderDaily();
      case 'cal-next': calMonth.setMonth(calMonth.getMonth() + 1); return renderDaily();
      case 'backup-copy': return backupCopy();
      case 'backup-restore': return backupRestoreAsk();
      case 'backup-do': return backupRestoreDo();
      case 'leaderboard': return openLeaderboard();
      case 'lb-join': return lbJoin();
      case 'lb-day-prev': { const d = new Date(lbDay + 'T12:00'); d.setDate(d.getDate() - 1); lbDay = todayStr(d); return renderLeaderboard(); }
      case 'lb-day-next': { const d = new Date(lbDay + 'T12:00'); d.setDate(d.getDate() + 1); lbDay = todayStr(d) > todayStr() ? todayStr() : todayStr(d); return renderLeaderboard(); }
      case 'lb-refresh': return lbSync(true).then(renderLeaderboard);
      case 'daily': return openDaily();
      case 'free': return openFreePlay();
      case 'free-start': closeModal(); return startGame(freeSpec());
      case 'levels': return renderLevels();
      case 'howto': return openHowTo();
      case 'settings': return openSettings();
      case 'home': return goHome();
      case 'undo': return undo();
      case 'hint': return showHint();
      case 'hint-close': return clearHint();
      case 'hint-apply': return applyHint();
      case 'restart': return clearMenu();
      case 'skip': return skip();
      case 'confirm-skip': return confirmSkip();
      case 'start-over': return askStartOver();
      case 'start-over-yes': return doStartOver(true);
      case 'start-over-no': closeModal(); if (G && G.lives <= 0) outOfTreats(); return;
      case 'clear-marks': closeModal(); return restart();
      case 'close-modal': return closeModal();
      case 'win-next': return winNext();
      case 'reset-ask':
        return openModal('<h2>Reset everything?</h2><p>This erases all level progress, stars, and your daily streak on this device. It can\'t be undone.</p>' + actions([['Yes, reset', 'reset-do', 'danger'], ['Cancel', 'close-modal', 'ghost']]));
      case 'reset-do':
        save = defaults(); save.seenHowTo = true; persist(); closeModal(); G = null; goHome(); return toast('Progress reset');
    }
  });

  document.addEventListener('input', (e) => {
    const r = e.target.closest && e.target.closest('[data-volume]');
    if (!r) return;
    save.settings[r.dataset.volume] = r.value / 100;
    r.style.setProperty('--pct', r.value + '%');
    persist();
  });
  document.addEventListener('change', (e) => {
    const r = e.target.closest && e.target.closest('[data-volume]');
    if (r) sfx(r.dataset.volume === 'winVol' ? 'win' : 'place'); // preview the new level
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Escape') { closeModal(); clearHint(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveCurrent(); });

  // ---------------------------------------------------------------- boot
  // ---------------------------------------------------------------- sounds (made in code, no files)
  let audio = null;
  function sfx(kind) {
    if (!save.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime;
      const level = (kind === 'win' || kind === 'hint') ? save.settings.winVol : save.settings.fxVol;
      if (!(level > 0)) return;
      const note = (freq, start, dur, vol, type, slideTo) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t + start);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + start + dur);
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * level * 1.6), t + start + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(audio.destination);
        o.start(t + start); o.stop(t + start + dur + 0.02);
      };
      if (kind === 'mark') note(520, 0, 0.06, 0.05, 'triangle');
      else if (kind === 'erase') note(380, 0, 0.05, 0.035, 'triangle');
      else if (kind === 'place') { note(660, 0, 0.09, 0.08); note(990, 0.06, 0.14, 0.07); }
      else if (kind === 'wrong') { note(220, 0, 0.18, 0.09, 'triangle', 140); note(1800, 0.02, 0.05, 0.03, 'square'); }
      else if (kind === 'hint') { note(880, 0, 0.12, 0.05); note(1320, 0.08, 0.18, 0.04); }
      else if (kind === 'win') [523, 659, 784, 1047].forEach((fq, k) => note(fq, k * 0.11, 0.35, 0.07));
    } catch (e) { /* sound not available - ignore */ }
  }

  // ---------------------------------------------------------------- light / dark
  function applyTheme() {
    const th = save.settings.theme || 'auto';
    if (th === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
    const dark = th === 'dark' || (th === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = dark ? '#16151B' : '#F3EFF8';
    document.documentElement.classList.toggle('dark', dark);
  }
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* old browser */ } }

  applyTheme();
  applyHoliday();
  lbSync().then((ok) => { if (ok) renderHome(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lbSync().then((ok) => { if (ok && $('#screen-home').classList.contains('active')) renderHome(); }); });
  paintJasperImages();
  document.body.classList.add('has-photo');
  findJasperPhoto();
  renderHome();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // expose for debugging/tests
  window.JasperDoku = { get game() { return G; }, startGame, levelSpec, findHint, save: () => save };
})();
