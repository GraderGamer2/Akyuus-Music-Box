'use strict';
const $ = (s) => document.querySelector(s);
const rand = (n) => Math.floor(Math.random() * n);

const GENRES = [...new Set(GENRE_GROUPS.flatMap((g) => g[1]))];
const CHARS = [...new Set(GAMES.flatMap((g) => g[2]))];
const OPT = Object.fromEntries(OPTIONS.map(([k, label, short, group]) => [k, { label, short, group }]));
const APP_TITLE = 'Akyuu\u2019s Music Box';
const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Different phrasings surface different uploads (English and Japanese circles).
const VARIANTS = [
  (s) => `touhou ${s} arrangement`,
  (s) => `東方 ${s} アレンジ`,
  (s) => `touhou ${s} remix`,
  (s) => `touhou project ${s} cover`,
  (s) => `東方project ${s} arrange`,
  (s) => `touhou ${s} album xfade`,
];
const JP_VARIANTS = [1, 4];
const SKIP_TITLE = /\b(reaction|tutorial|gameplay|playthrough|no ?miss|speed ?run|mmd|let'?s play|karaoke|compilation|1 ?hour|10 ?hours?)\b/i;
const GFX_LABEL = { software: 'Software', 'opengl-egl': 'OpenGL (EGL)', opengl: 'OpenGL (desktop)', vulkan: 'Vulkan' };

const S = {
  genre: null, theme: null, text: '', opts: [], autoplay: true,
  pool: [], seen: new Set(), history: [], hIndex: -1, current: null, favs: [],
  variantsUsed: {}, epoch: 0, busy: false, errorStreak: 0, autoSubject: '',
  tab: 'queue', libraryOpen: true, plMode: false, plShuffle: false, plQuery: '', histQuery: '',
  selecting: false, sel: new Set(), clearArmed: false,
  hi: -1, sugItems: [], openGenre: 'Popular', openGame: null,
  settings: { mode: 'dark', palette: 'sakura', engine: 'embed', gfx: 'software', display: 'auto', hwVideo: false, font: '', dynamicTitle: false, blockTracking: false },
  effectiveGfx: 'software', session: '', needsRestart: false, fonts: null,
  forceWatch: false, watchActive: false, triedWatch: null, dataDir: '~/.akyuus-music-box',
};
const has = (k) => S.opts.includes(k);
const inSettings = () => document.body.dataset.view === 'settings';

// ---------- themes: pastel palettes generated from one hue, in dark and light ----------
const PALETTES = { sakura: ['Sakura', 340], peach: ['Peach', 18], lemon: ['Lemon', 46], mint: ['Mint', 150], sky: ['Sky', 205], lavender: ['Lavender', 262] };
function applyTheme() {
  const { mode, palette } = S.settings;
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const h = (PALETTES[palette] || PALETTES.sakura)[1];
  const t = dark ? {
    night: `hsl(${h} 18% 14%)`, deep: `hsl(${h} 18% 18%)`, panel: `hsl(${h} 18% 23%)`, line: `hsl(${h} 15% 32%)`,
    text: `hsl(${h} 35% 94%)`, muted: `hsl(${h} 18% 72%)`,
    accent: `hsl(${h} 72% 80%)`, accent2: `hsl(${(h + 45) % 360} 75% 82%)`, accent3: `hsl(${(h + 150) % 360} 55% 80%)`,
    'accent-ink': `hsl(${h} 72% 82%)`, 'on-accent': `hsl(${h} 40% 16%)`,
  } : {
    night: `hsl(${h} 55% 96%)`, deep: `hsl(${h} 60% 99%)`, panel: `hsl(${h} 45% 93%)`, line: `hsl(${h} 30% 84%)`,
    text: `hsl(${h} 25% 22%)`, muted: `hsl(${h} 12% 42%)`,
    accent: `hsl(${h} 75% 78%)`, accent2: `hsl(${(h + 45) % 360} 80% 78%)`, accent3: `hsl(${(h + 150) % 360} 55% 76%)`,
    'accent-ink': `hsl(${h} 45% 36%)`, 'on-accent': `hsl(${h} 45% 15%)`,
  };
  const root = document.documentElement;
  Object.entries(t).forEach(([k, v]) => root.style.setProperty('--' + k, v));
  root.dataset.theme = dark ? 'dark' : 'light';
  document.querySelectorAll('#modeSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.palette === palette)));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.settings.mode === 'system') applyTheme(); });
function applyFont() {
  const f = (S.settings.font || '').replace(/["\\]/g, '');
  document.documentElement.style.setProperty('--font', f ? `"${f}", system-ui, sans-serif` : 'system-ui, sans-serif');
  $('#fontNow').textContent = f || 'System default';
}
function applyTitle() { document.title = S.settings.dynamicTitle && S.current ? `${S.current.title} - ${APP_TITLE}` : APP_TITLE; }

// ---------- persistence ----------
let saveTimer;
const snapshot = () => ({
  favs: S.favs, seen: [...S.seen].slice(-400), history: S.history.slice(-60),
  prefs: { genre: S.genre, theme: S.theme, opts: S.opts, autoplay: S.autoplay },
  settings: S.settings,
});
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => window.api.saveStore(snapshot()), 300); }

// ---------- ui helpers ----------
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3000);
}
function setStatus(msg, err = false) { const s = $('#status'); s.textContent = msg; s.classList.toggle('err', err); }
const thumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
const fmtViews = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M views' : n >= 1e3 ? Math.round(n / 1e3) + 'K views' : n + ' views';
function ageDays(t) {
  const m = /(\d+)\s*(second|minute|hour|day|week|month|year)/i.exec(t || '');
  return m ? +m[1] * ({ second: 0, minute: 0, hour: 0, day: 1, week: 7, month: 30, year: 365 }[m[2].toLowerCase()]) : Infinity;
}

// ---------- omnibar: genre, character/game/song, options and free text live in the search field ----------
const $in = () => $('#searchInput');
function toggleOpt(k, on) {
  const want = on === undefined ? !has(k) : on;
  S.opts = S.opts.filter((x) => x !== k && !(want && OPT[k].group && OPT[x].group === OPT[k].group));
  if (want) S.opts.push(k);
}
function tokenList() {
  const t = [];
  if (S.genre) t.push({ cls: 'genre', label: S.genre, clear: () => { S.genre = null; } });
  if (S.theme) t.push({ cls: 'theme', label: S.theme, clear: () => { S.theme = null; } });
  if (S.text) t.push({ cls: 'text', label: `\u201c${S.text}\u201d`, clear: () => { S.text = ''; } });
  S.opts.forEach((k) => t.push({ cls: 'opt', label: OPT[k].short, clear: () => toggleOpt(k, false) }));
  return t;
}
function renderTokens() {
  const box = $('#tokens'); box.innerHTML = '';
  const list = tokenList();
  list.forEach((tk) => {
    const t = document.createElement('span'); t.className = 'tok ' + tk.cls; t.append(document.createTextNode(tk.label));
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '\u00d7'; x.setAttribute('aria-label', `Remove ${tk.label}`);
    x.addEventListener('mousedown', (e) => e.preventDefault());
    x.addEventListener('click', () => { tk.clear(); changed(); });
    t.appendChild(x); box.appendChild(t);
  });
  $in().placeholder = list.length ? 'Add more, or press Enter' : 'Search a genre, character, or song';
}
// any change to the search: refresh the queue, never start playing by itself
function changed() { renderTokens(); renderSuggest(); save(); newSelection(false); }

function renderSuggest() {
  const box = $('#suggest'); if (box.hidden) return;
  const keep = box.scrollTop;
  const q = $in().value.trim(), ql = q.toLowerCase();
  const items = []; box.innerHTML = '';
  const title = (txt) => { const p = document.createElement('p'); p.className = 'sg-title'; p.textContent = txt; box.appendChild(p); };
  const register = (btn, it) => { btn.id = 'sg' + items.length; btn.dataset.i = items.length; btn.addEventListener('mousedown', (e) => e.preventDefault()); items.push(it); };
  const pills = (parent, list) => {
    const wrap = document.createElement('div'); wrap.className = 'sg-items'; parent.appendChild(wrap);
    list.forEach((it) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sg ' + (it.cls || ''); b.textContent = it.label; b.setAttribute('role', 'option');
      if (it.pressed !== undefined) b.setAttribute('aria-pressed', String(it.pressed));
      register(b, it); b.addEventListener('click', it.run); wrap.appendChild(b);
    });
  };
  const accordion = (n, t, open, toggle, list) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'acc'; b.setAttribute('aria-expanded', String(open));
    const sn = document.createElement('span'); sn.className = 'n'; sn.textContent = n;
    const st = document.createElement('span'); st.className = 't'; st.textContent = t;
    b.append(sn, st); b.insertAdjacentHTML('beforeend', CHEV);
    register(b, { run: toggle }); b.addEventListener('click', toggle); box.appendChild(b);
    if (open) { const body = document.createElement('div'); body.className = 'acc-body'; box.appendChild(body); pills(body, list); }
  };
  const pickKind = (kind, name) => () => { S[kind] = S[kind] === name ? null : name; $in().value = ''; changed(); };
  const genreIt = (g) => ({ label: g, cls: 'genre', pressed: S.genre === g, run: pickKind('genre', g) });
  const themeIt = (t) => ({ label: t, cls: 'theme', pressed: S.theme === t, run: pickKind('theme', t) });

  if (q) {
    const exactG = GENRES.find((g) => g.toLowerCase() === ql);
    const exactT = [...CHARS, ...SONGS, ...GAMES.map((g) => g[1])].find((t) => t.toLowerCase() === ql);
    const top = exactG ? { label: `Genre: ${exactG}`, cls: 'wide', run: pickKind('genre', exactG) }
      : exactT ? { label: `Character, game or song: ${exactT}`, cls: 'wide', run: pickKind('theme', exactT) }
      : { label: `Search YouTube for \u201c${q}\u201d`, cls: 'wide', run: () => { S.text = q; $in().value = ''; changed(); } };
    title('Press Enter to'); pills(box, [top]);
    const g = GENRES.filter((x) => x.toLowerCase().includes(ql) && x !== exactG);
    const c = CHARS.filter((x) => x.toLowerCase().includes(ql) && x !== exactT);
    const s = SONGS.filter((x) => x.toLowerCase().includes(ql) && x !== exactT);
    const gm = GAMES.filter((x) => `${x[0]} ${x[1]}`.toLowerCase().includes(ql) && x[1] !== exactT).map((x) => x[1]);
    if (g.length) { title('Genres'); pills(box, g.map(genreIt)); }
    if (gm.length) { title('Games'); pills(box, gm.map(themeIt)); }
    if (c.length) { title('Characters'); pills(box, c.map(themeIt)); }
    if (s.length) { title('Songs'); pills(box, s.map(themeIt)); }
    if (!g.length && !gm.length && !c.length && !s.length) { const e = document.createElement('p'); e.className = 'sg-empty'; e.textContent = 'No matching genre, game or character, but you can search YouTube for it.'; box.appendChild(e); }
  } else {
    pills(box, [{ label: 'Surprise me with a random genre', cls: 'wide surprise', run: () => { closeSuggest(); roll(); } }]);
    title('Genres');
    GENRE_GROUPS.forEach(([name, list]) => accordion(name, `${list.length} genres`, S.openGenre === name, () => { S.openGenre = S.openGenre === name ? null : name; renderSuggest(); }, list.map(genreIt)));
    title('Touhou games, characters and songs');
    GAMES.forEach(([n, t, chars]) => accordion(n, t, S.openGame === n, () => { S.openGame = S.openGame === n ? null : n; renderSuggest(); }, [themeIt(t), ...chars.map(themeIt)]));
    accordion('Songs', 'Famous arrangements', S.openGame === 'Songs', () => { S.openGame = S.openGame === 'Songs' ? null : 'Songs'; renderSuggest(); }, SONGS.map(themeIt));
    title('Options');
    pills(box, OPTIONS.map(([k, label]) => ({ label, cls: 'opt', pressed: has(k), run: () => { toggleOpt(k); changed(); } })));
  }
  S.sugItems = items; S.hi = q ? 0 : -1; markHi(); box.scrollTop = keep;
}
function markHi() {
  document.querySelectorAll('#suggest .hi').forEach((e) => e.classList.remove('hi'));
  const el = S.hi >= 0 ? $('#sg' + S.hi) : null;
  if (el) { el.classList.add('hi'); el.scrollIntoView({ block: 'nearest' }); $in().setAttribute('aria-activedescendant', el.id); }
  else $in().removeAttribute('aria-activedescendant');
}
function openSuggest() {
  const box = $('#suggest'); if (!box.hidden) return;
  box.hidden = false; $in().setAttribute('aria-expanded', 'true');
  if (S.watchActive) window.api.watchVisible(false); // the native video layer would cover the list
  renderSuggest();
}
function closeSuggest() {
  const box = $('#suggest'); if (box.hidden) return;
  box.hidden = true; $in().setAttribute('aria-expanded', 'false');
  if (S.watchActive && !inSettings()) window.api.watchVisible(true);
}
function wireOmnibar() {
  const input = $in();
  input.addEventListener('focus', openSuggest);
  input.addEventListener('click', openSuggest);
  input.addEventListener('input', () => { openSuggest(); renderSuggest(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); openSuggest();
      const n = S.sugItems.length; if (!n) return;
      S.hi = e.key === 'ArrowDown' ? (S.hi + 1) % n : (S.hi - 1 + n) % n; markHi();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (S.hi >= 0 && S.sugItems[S.hi]) S.sugItems[S.hi].run(); else closeSuggest();
    } else if (e.key === 'Escape') { closeSuggest(); input.blur(); }
    else if (e.key === 'Backspace' && !input.value) {
      const list = tokenList(); if (!list.length) return;
      list[list.length - 1].clear(); changed();
    }
  });
  $('#searchBtn').addEventListener('click', () => {
    if (input.value.trim() && S.sugItems[0]) S.sugItems[0].run();
    else { input.focus(); openSuggest(); }
  });
  document.addEventListener('mousedown', (e) => { if (!$('#omni').contains(e.target)) closeSuggest(); });
  renderTokens();
}

// ---------- search + pool ----------
function pickSubject() {
  const picked = [S.genre, S.theme, S.text].filter(Boolean).join(' ');
  if (picked) return picked;
  // Nothing selected: a fresh random genre (and sometimes a character or song) on every refill.
  const g = GENRES[rand(GENRES.length)];
  const pool = [...CHARS, ...SONGS];
  const t = Math.random() < 0.35 ? pool[rand(pool.length)] : '';
  S.autoSubject = [g, t].filter(Boolean).join(' x ');
  return [g, t].filter(Boolean).join(' ');
}
const withMods = (s) => s + (has('vocal') ? ' vocal' : '') + (has('instr') ? ' instrumental' : '') + (has('live') ? ' live' : '');
const freshSort = () => has('newest') || has('year');
function addToPool(items) {
  let added = 0;
  const inPool = new Set(S.pool.map((i) => i.id));
  const minS = has('long') ? 360 : 90, maxS = has('short') ? 240 : has('long') ? 2400 : 900;
  for (const it of items) {
    if (inPool.has(it.id) || (!has('repeat') && S.seen.has(it.id))) continue;
    if (it.seconds < minS || it.seconds > maxS) continue;
    if (SKIP_TITLE.test(it.title)) continue;
    if (has('gems') && it.views >= 50000) continue;
    if (has('popular') && it.views < 100000) continue;
    if (has('year') && ageDays(it.published) > 366) continue;
    S.pool.push(it); inPool.add(it.id); added++;
  }
  for (let i = S.pool.length - 1; i > 0; i--) { const j = rand(i + 1); [S.pool[i], S.pool[j]] = [S.pool[j], S.pool[i]]; }
  return added;
}
async function refill(subject) {
  const epoch = S.epoch, subj = withMods(subject);
  const key = subj + (freshSort() ? '|new' : '') + (has('japan') ? '|jp' : '');
  const used = (S.variantsUsed[key] ||= new Set());
  const all = has('japan') ? JP_VARIANTS : VARIANTS.map((_, i) => i);
  let avail = all.filter((i) => !used.has(i));
  if (!avail.length) { used.clear(); avail = all.slice(); }
  let added = 0, tries = 0, lastErr = '';
  while (added < 3 && tries < 3 && avail.length) {
    const v = avail.splice(rand(avail.length), 1)[0];
    used.add(v); tries++;
    const res = await window.api.search(VARIANTS[v](subj), freshSort());
    if (epoch !== S.epoch) return -1; // the search changed while waiting
    if (res.error) { lastErr = res.error; continue; }
    added += addToPool(res.items);
  }
  renderList();
  if (!added && lastErr) throw new Error(lastErr);
  return added;
}

// ---------- playback ----------
let player, ytReady;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('Could not load the YouTube player. Check your internet connection.'));
    document.head.appendChild(s);
  });
  return ytReady;
}
const useWatch = () => S.settings.engine === 'watch' || S.forceWatch;
const playerRect = () => { const r = $('#playerWrap').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
function destroyEmbed() {
  if (!player) return;
  try { player.destroy(); } catch {}
  player = null;
  if (!$('#player')) { const d = document.createElement('div'); d.id = 'player'; $('#playerWrap').prepend(d); }
}
async function startVideo(id, { watch = false, start = 0 } = {}) {
  if (watch || useWatch()) {
    destroyEmbed();
    S.watchActive = true;
    return window.api.watchPlay(id, playerRect());
  }
  if (S.watchActive) { S.watchActive = false; await window.api.watchStop(); }
  await loadYT();
  if (!player) {
    await new Promise((resolve) => {
      player = new YT.Player('player', {
        width: '100%', height: '100%', videoId: id,
        playerVars: { autoplay: 1, rel: 0, playsinline: 1, cc_load_policy: 0, iv_load_policy: 3, start: Math.floor(start) || 0, origin: location.origin },
        events: { onReady: (e) => { captionsOff(e.target); resolve(); }, onStateChange: onPlayerState, onError: onPlayerError },
      });
    });
  } else {
    player.loadVideoById(start > 0 ? { videoId: id, startSeconds: start } : id);
  }
}
// Re-creates the video player at the same spot: the way out if YouTube's player ever gets stuck on a gray screen.
function reloadPlayer() {
  if (!S.current) return toast('Nothing is playing yet.');
  let t = 0;
  try { if (player && player.getCurrentTime) t = player.getCurrentTime() || 0; } catch {}
  toast('Reloading the player...');
  destroyEmbed();
  startVideo(S.current.id, { start: t }).catch((e) => setStatus(e.message, true));
}
// Captions stay off until the viewer turns them on in the player.
function captionsOff(p) { try { p.unloadModule('captions'); p.unloadModule('cc'); } catch {} }
function onPlayerState(e) {
  if (e.data === YT.PlayerState.PLAYING) { S.errorStreak = 0; setStatus(''); captionsOff(e.target); }
  if (e.data === YT.PlayerState.ENDED && S.autoplay) next();
}
// 100 / 2: video is gone or private. 101 / 150: the uploader turned off embedding.
// 153 / 5: the embedded player itself was refused. None of these should loop through songs.
function onPlayerError(e) {
  const code = e.data, cur = S.current;
  if (!cur) return;
  if ((code === 101 || code === 150) && S.triedWatch !== cur.id) {
    S.triedWatch = cur.id;
    toast('Embedding is off for this one. Playing it through the watch page instead.');
    return startVideo(cur.id, { watch: true });
  }
  if ((code === 153 || code === 5) && !S.forceWatch) {
    S.forceWatch = true;
    toast(`The embedded player was refused (error ${code}). Switching to the watch page player.`);
    return startVideo(cur.id);
  }
  if (code === 100 || code === 2) {
    S.errorStreak++;
    if (S.errorStreak < 4) { toast('That video is unavailable, skipping it.'); return setTimeout(next, 900); }
  }
  setStatus(`YouTube player error ${code}. Press Next song, or open this one on YouTube.`, true);
}
window.api.onWatchEnded(() => { if (S.autoplay) next(); });
new ResizeObserver(() => { if (S.watchActive) window.api.watchRect(playerRect()); }).observe($('#playerWrap'));

// ---------- now playing ----------
function peekNext() {
  if (S.hIndex < S.history.length - 1) return S.history[S.hIndex + 1];
  if (S.plMode && S.favs.length) {
    if (S.plShuffle) return null;
    const cur = S.current ? S.favs.findIndex((f) => f.id === S.current.id) : -1;
    return S.favs[(cur + 1) % S.favs.length];
  }
  return S.pool.length ? S.pool[S.pool.length - 1] : null;
}
function updatePeek() {
  const n = peekNext();
  $('#peek').textContent = n ? `Up next: ${n.title}` : (S.plMode && S.plShuffle ? 'Up next: a random song from your playlist' : '');
}
function syncMode() {
  const t = $('#modeTag');
  t.hidden = !S.plMode;
  t.textContent = S.plShuffle ? 'Your playlist, shuffled' : 'Your playlist, in order';
  $('#plShuffle').setAttribute('aria-pressed', String(S.plShuffle));
  updatePeek();
}
function showTrack(it) {
  S.current = it;
  const img = $('#coverImg');
  img.hidden = false; img.src = thumb(it.id); img.alt = `Cover for ${it.title}`;
  $('#stageEmpty').hidden = true;
  $('#title').textContent = it.title; $('#title').title = it.title;
  $('#channel').textContent = it.channel;
  const meta = $('#meta'); meta.innerHTML = '';
  [it.duration, it.views ? fmtViews(it.views) : '', it.published].filter(Boolean).forEach((t) => {
    const s = document.createElement('span'); s.textContent = t; meta.appendChild(s);
  });
  applyTitle(); syncFav(); updatePeek(); renderList();
}
async function playItem(it, fromHistory = false) {
  S.seen.add(it.id);
  if (!fromHistory) {
    S.history = S.history.slice(0, S.hIndex + 1);
    S.history.push(it); S.hIndex = S.history.length - 1;
    if (S.history.length > 100) { S.history.shift(); S.hIndex--; }
  }
  showTrack(it);
  try { await startVideo(it.id); } catch (e) { setStatus(e.message, true); }
  save();
}
async function next() {
  if (S.busy) return;
  if (S.hIndex < S.history.length - 1) { S.hIndex++; return playItem(S.history[S.hIndex], true); }
  if (S.plMode && S.favs.length) {
    const cur = S.current ? S.favs.findIndex((f) => f.id === S.current.id) : -1;
    let idx = (cur + 1) % S.favs.length;
    if (S.plShuffle && S.favs.length > 1) { do { idx = rand(S.favs.length); } while (idx === cur); }
    return playItem(S.favs[idx]);
  }
  S.busy = true;
  const epoch = S.epoch;
  try {
    if (S.pool.length < 2) {
      const subject = pickSubject();
      const filtered = !!(S.genre || S.theme || S.text);
      setStatus(filtered ? 'Searching YouTube...' : `Rolling ${S.autoSubject}...`);
      const added = await refill(subject);
      if (added === -1) return;
      if (!added && !S.pool.length) { setStatus(noResults(), true); return; }
    }
    if (epoch !== S.epoch) return;
    const it = S.pool.pop();
    setStatus(S.autoSubject && !(S.genre || S.theme || S.text) ? `Rolled: ${S.autoSubject}` : '');
    await playItem(it);
  } catch (e) {
    setStatus(`Couldn't reach YouTube. ${e.message}`, true);
  } finally { if (epoch === S.epoch) S.busy = false; }
}
const noResults = () => S.opts.length ? 'No new songs matched. Try removing one of the options, or pick another genre.' : 'No new songs found for that search. Try a different genre or word.';
function prev() {
  if (S.hIndex > 0) { S.hIndex--; playItem(S.history[S.hIndex], true); }
  else toast('This is the first song in your history.');
}
// A changed search throws away the old queue and loads a new one. It does NOT start playing;
// pressing Roll, Next, or clicking a song in the list does.
function newSelection(play = false) {
  S.plMode = false;
  S.epoch++; S.pool = []; S.busy = false; S.errorStreak = 0;
  syncMode(); setTab('queue');
  if (play) return next();
  if (!(S.genre || S.theme || S.text)) { setStatus(''); updatePeek(); return; }
  return loadQueue();
}
async function loadQueue() {
  const epoch = S.epoch; S.busy = true;
  try {
    setStatus('Searching YouTube...');
    const added = await refill(pickSubject());
    if (added === -1) return;
    if (!S.pool.length) setStatus(noResults(), true);
    else setStatus(`${S.pool.length} songs are lined up in Up next. Click one to play it, or press Next.`);
    updatePeek();
  } catch (e) { setStatus(`Couldn't reach YouTube. ${e.message}`, true); }
  finally { if (epoch === S.epoch) S.busy = false; }
}
function roll() {
  S.genre = null; S.theme = null; S.text = ''; $in().value = '';
  renderTokens(); save(); newSelection(true);
}

// ---------- playlist ----------
const inPlaylist = (id) => S.favs.some((f) => f.id === id);
function syncFav() {
  const b = $('#favBtn'); const on = !!(S.current && inPlaylist(S.current.id));
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'In your playlist, click to remove (F)' : 'Add to playlist (F)';
  b.setAttribute('aria-label', on ? 'Remove from playlist' : 'Add to playlist');
}
function addToPlaylist(it) {
  if (inPlaylist(it.id)) return;
  S.favs.push(it); toast('Added to your playlist');
  syncFav(); updatePeek(); renderList(); save();
}
function removeFromPlaylist(id) {
  S.favs = S.favs.filter((f) => f.id !== id); toast('Removed from your playlist');
  if (!S.favs.length) S.plMode = false;
  syncFav(); syncMode(); renderList(); save();
}
function toggleFav() {
  if (!S.current) return;
  if (inPlaylist(S.current.id)) removeFromPlaylist(S.current.id); else addToPlaylist(S.current);
}
function playPlaylist(shuffle) {
  if (!S.favs.length) return toast('Your playlist is empty. Press the list button on a song to add it.');
  S.epoch++; S.busy = false; S.pool = []; S.plMode = true; S.plShuffle = shuffle; syncMode();
  playItem(shuffle ? S.favs[rand(S.favs.length)] : S.favs[0]);
}

// ---------- history ----------
function removeHistory(indices) {
  const set = new Set(indices); if (!set.size) return;
  const cur = S.hIndex;
  const before = [...set].filter((i) => i < cur).length;
  S.history = S.history.filter((_, i) => !set.has(i));
  S.hIndex = set.has(cur) ? cur - before - 1 : cur - before;
  S.sel.clear(); updatePeek(); renderList(); save();
}
function setSelecting(on) { S.selecting = on; S.sel.clear(); S.clearArmed = false; renderList(); }
function syncHistTools() {
  $('#histSelect').setAttribute('aria-pressed', String(S.selecting));
  $('#histSelect').textContent = S.selecting ? 'Done' : 'Select';
  $('#histAll').hidden = !S.selecting;
  $('#histDelete').hidden = !S.selecting;
  $('#histDelete').disabled = !S.sel.size;
  $('#histDelete').textContent = S.sel.size ? `Delete selected (${S.sel.size})` : 'Delete selected';
  $('#histClear').textContent = S.clearArmed ? 'Click again to clear everything' : 'Clear all';
  $('#histClear').disabled = !S.history.length;
}

// ---------- library drawer ----------
function entries() {
  if (S.tab === 'queue') return S.pool.slice(-30).reverse().map((it) => ({ it }));
  if (S.tab === 'history') {
    const hq = S.histQuery.trim().toLowerCase();
    return S.history.map((it, i) => ({ it, i })).filter(({ it }) => !hq || `${it.title} ${it.channel}`.toLowerCase().includes(hq)).reverse();
  }
  const q = S.plQuery.trim().toLowerCase();
  return (q ? S.favs.filter((f) => `${f.title} ${f.channel}`.toLowerCase().includes(q)) : S.favs).map((it) => ({ it }));
}
function renderList() {
  $('#queueCount').textContent = S.pool.length ? S.pool.length : '';
  $('#favCount').textContent = S.favs.length ? S.favs.length : '';
  if (!S.libraryOpen) return;
  $('#plTools').hidden = S.tab !== 'favs';
  $('#histTools').hidden = S.tab !== 'history';
  syncHistTools();
  const list = entries(); const q = S.plQuery.trim(); const hq = S.histQuery.trim();
  const ul = $('#list'); ul.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = S.tab === 'favs' && q ? 'No songs in your playlist match that search.'
      : S.tab === 'history' && hq ? 'No songs in your history match that search.'
      : { queue: 'Search or pick a genre above and the songs will line up here.', favs: 'Your playlist is empty. Press the list button on a song, or the + next to one in the lists, to add it.', history: 'Songs you have played show here.' }[S.tab];
    ul.appendChild(li); return;
  }
  const canDrag = S.tab === 'favs' && !q;
  const frag = document.createDocumentFragment();
  list.forEach(({ it, i }) => {
    const li = document.createElement('li'); li.className = 'row-item';
    const picking = S.tab === 'history' && S.selecting;
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'item' + (S.current && S.current.id === it.id ? ' now-playing' : '') + (picking && S.sel.has(i) ? ' picked' : '');
    const img = document.createElement('img'); img.src = thumb(it.id); img.alt = ''; img.loading = 'lazy';
    const txt = document.createElement('span'); txt.className = 'txt';
    const t = document.createElement('span'); t.className = 't'; t.textContent = it.title;
    const c = document.createElement('span'); c.className = 'c'; c.textContent = `${it.channel}  ${it.duration}`;
    txt.append(t, c); b.append(img, txt);
    if (picking) {
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = S.sel.has(i);
      cb.setAttribute('aria-label', `Select ${it.title}`);
      const toggle = () => { if (S.sel.has(i)) S.sel.delete(i); else S.sel.add(i); renderList(); };
      cb.addEventListener('change', toggle); b.addEventListener('click', toggle);
      li.append(cb, b);
    } else {
      li.appendChild(b);
      const addAct = (label, aria, fn) => {
        const a = document.createElement('button'); a.type = 'button'; a.className = 'mini';
        a.textContent = label; a.title = aria; a.setAttribute('aria-label', aria); a.addEventListener('click', fn); li.appendChild(a);
      };
      if (S.tab === 'favs') addAct('\u00d7', `Remove ${it.title} from playlist`, () => removeFromPlaylist(it.id));
      else {
        const hasIt = inPlaylist(it.id);
        addAct(hasIt ? '\u2713' : '+', hasIt ? 'In your playlist, click to remove' : 'Add to playlist', () => (hasIt ? removeFromPlaylist(it.id) : addToPlaylist(it)));
        if (S.tab === 'history') addAct('\u00d7', `Erase ${it.title} from history`, () => removeHistory([i]));
      }
      b.addEventListener('click', () => {
        if (S.tab === 'favs') { S.epoch++; S.busy = false; S.pool = []; S.plMode = true; syncMode(); playItem(it); }
        else if (S.tab === 'history') { S.plMode = false; S.hIndex = i; syncMode(); playItem(it, true); }
        else { S.plMode = false; S.pool = S.pool.filter((p) => p.id !== it.id); syncMode(); playItem(it); }
      });
    }
    if (canDrag) {
      li.draggable = true;
      const idx = S.favs.indexOf(it);
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault(); li.classList.remove('drag-over');
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (Number.isNaN(from) || from === idx) return;
        const [moved] = S.favs.splice(from, 1); S.favs.splice(idx, 0, moved);
        updatePeek(); renderList(); save();
      });
    }
    frag.appendChild(li);
  });
  ul.appendChild(frag);
}
function setLibraryOpen(open) {
  S.libraryOpen = open;
  $('#drawer').hidden = !open;
  $('#libraryBtn').setAttribute('aria-pressed', String(open));
  if (open) renderList();
}
function setTab(tab) {
  S.tab = tab; S.selecting = false; S.sel.clear(); S.clearArmed = false;
  document.querySelectorAll('.tab').forEach((x) => { const on = x.dataset.tab === tab; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
  renderList();
}

// ---------- settings (a separate view, not an overlay) ----------
function syncSeen() {
  const n = S.seen.size;
  $('#seenCount').textContent = `${n} song${n === 1 ? '' : 's'}`;
  $('#clearSeenBtn').disabled = !n;
  $('#clearHistoryBtn').disabled = !S.history.length;
}
function openSettings(on) {
  if (on) { closeSuggest(); syncSeen(); }
  document.body.dataset.view = on ? 'settings' : '';
  if (S.watchActive) window.api.watchVisible(!on); // the native video layer would otherwise stay on top
  if (on && !S.fonts) loadFonts();
}
async function loadFonts() {
  S.fonts = [];
  try { S.fonts = await window.api.listFonts(); } catch {}
  $('#fontHint').textContent = S.fonts.length ? `${S.fonts.length} fonts found on this computer.` : 'Could not read the installed fonts here. You can still type a font name above and press Enter.';
  renderFontList();
}
function renderFontList() {
  const q = $('#fontSearch').value.trim().toLowerCase();
  const ul = $('#fontList'); ul.innerHTML = '';
  (S.fonts || []).filter((f) => !q || f.toLowerCase().includes(q)).slice(0, 150).forEach((f) => {
    const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.textContent = f;
    b.setAttribute('aria-pressed', String(f === S.settings.font));
    b.addEventListener('click', () => { S.settings.font = f; applyFont(); renderFontList(); save(); });
    li.appendChild(b); ul.appendChild(li);
  });
}
function syncSettingsUI() {
  document.querySelectorAll('#engineSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.engine === S.settings.engine)));
  document.querySelectorAll('#gfxSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gfx === S.settings.gfx)));
  document.querySelectorAll('#displaySeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.display === S.settings.display)));
  $('#gfxNow').textContent = `Running now: ${GFX_LABEL[S.effectiveGfx] || 'Software'}${S.session ? ` on ${S.session}` : ''}.`;
  $('#restartBtn').hidden = !S.needsRestart;
  $('#autoToggle').checked = S.autoplay;
  $('#hwVideoToggle').checked = !!S.settings.hwVideo;
  $('#titleToggle').checked = !!S.settings.dynamicTitle;
  $('#trackToggle').checked = !!S.settings.blockTracking;
  $('#dataDir').textContent = S.dataDir;
  applyTheme(); applyFont();
}
function wireSettings() {
  const sw = $('#swatches');
  Object.entries(PALETTES).forEach(([key, [name, hue]]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.dataset.palette = key;
    const i = document.createElement('i'); i.style.background = `hsl(${hue} 72% 80%)`;
    const dot = document.createElement('b'); dot.style.background = `hsl(${(hue + 45) % 360} 75% 82%)`; i.appendChild(dot);
    b.append(i, document.createTextNode(name)); sw.appendChild(b);
    b.addEventListener('click', () => { S.settings.palette = key; applyTheme(); save(); });
  });
  document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => { S.settings.mode = b.dataset.mode; applyTheme(); save(); }));
  document.querySelectorAll('#engineSeg button').forEach((b) => b.addEventListener('click', () => {
    S.settings.engine = b.dataset.engine; S.forceWatch = false; syncSettingsUI(); save();
    toast(b.dataset.engine === 'watch' ? 'Watch page player on from the next song' : 'Embedded player on from the next song');
  }));
  const needsRestart = (key, val) => { S.settings[key] = val; S.needsRestart = true; syncSettingsUI(); save(); };
  document.querySelectorAll('#gfxSeg button').forEach((b) => b.addEventListener('click', () => needsRestart('gfx', b.dataset.gfx)));
  document.querySelectorAll('#displaySeg button').forEach((b) => b.addEventListener('click', () => needsRestart('display', b.dataset.display)));
  $('#hwVideoToggle').addEventListener('change', (e) => needsRestart('hwVideo', e.target.checked));
  $('#autoToggle').addEventListener('change', (e) => { S.autoplay = e.target.checked; save(); });
  $('#titleToggle').addEventListener('change', (e) => { S.settings.dynamicTitle = e.target.checked; applyTitle(); save(); });
  $('#trackToggle').addEventListener('change', (e) => { S.settings.blockTracking = e.target.checked; window.api.setPrivacy(e.target.checked); save(); });
  $('#fontSearch').addEventListener('input', renderFontList);
  $('#fontSearch').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim(); if (!v) return;
    const exact = (S.fonts || []).find((f) => f.toLowerCase() === v.toLowerCase());
    S.settings.font = exact || v; applyFont(); renderFontList(); save();
  });
  $('#fontReset').addEventListener('click', () => { S.settings.font = ''; $('#fontSearch').value = ''; applyFont(); renderFontList(); save(); });
  $('#gfxInfoBtn').addEventListener('click', async () => {
    const pre = $('#gfxInfo'); pre.textContent = 'Reading graphics details...'; pre.hidden = false;
    try { pre.textContent = await window.api.gfxInfo(); } catch (e) { pre.textContent = String(e); }
  });
  $('#restartBtn').addEventListener('click', async () => { clearTimeout(saveTimer); await window.api.saveStore(snapshot()); window.api.relaunch(); });
  $('#openDataBtn').addEventListener('click', () => window.api.openDataFolder());
  $('#clearSeenBtn').addEventListener('click', () => {
    const n = S.seen.size; S.seen = new Set(); syncSeen(); save();
    toast(`Done: ${n} played song${n === 1 ? '' : 's'} can come back in new searches and rolls`);
    if (S.genre || S.theme || S.text) { S.epoch++; S.pool = []; loadQueue(); } // refresh Up next with them included
  });
  $('#clearHistoryBtn').addEventListener('click', () => {
    const n = S.history.length; S.history = []; S.hIndex = -1; S.selecting = false; S.sel.clear();
    updatePeek(); renderList(); syncSeen(); save(); toast(`History cleared (${n} song${n === 1 ? '' : 's'})`);
  });
  $('#settingsBtn').addEventListener('click', () => openSettings(true));
  $('#settingsClose').addEventListener('click', () => openSettings(false));
}

// ---------- wiring ----------
async function init() {
  const st = (await window.api.loadStore()) || {};
  S.favs = st.favs || []; S.seen = new Set(st.seen || []); S.history = st.history || [];
  S.hIndex = S.history.length - 1;
  const p = st.prefs || {};
  S.genre = p.genre || null; S.theme = p.theme || null; S.autoplay = p.autoplay !== false;
  S.opts = Array.isArray(p.opts) ? p.opts.filter((k) => OPT[k]) : [...(p.fresh ? ['newest'] : []), ...(p.gems ? ['gems'] : [])];
  for (const k of Object.keys(S.settings)) if (st.settings && st.settings[k] !== undefined) S.settings[k] = st.settings[k];
  if (st.dataDir) S.dataDir = st.dataDir;
  S.effectiveGfx = st.effectiveGfx || 'software'; S.session = st.session || '';
  wireSettings(); syncSettingsUI(); wireOmnibar(); applyTitle();
  syncMode();
  // The library is always open at launch, starting on the tab that has something in it.
  setLibraryOpen(true);
  setTab(S.favs.length ? 'favs' : S.history.length ? 'history' : 'queue');
  if (st.notice) { toast(st.notice); save(); }

  // Only GPU modes need a paint heartbeat (the main process reverts to software if it stops).
  if (S.effectiveGfx !== 'software') {
    setInterval(() => { if (document.hidden) window.api.beat(); else requestAnimationFrame(() => window.api.beat()); }, 1000);
  }

  $('#plSearch').addEventListener('input', (e) => { S.plQuery = e.target.value; renderList(); });
  $('#histSearch').addEventListener('input', (e) => { S.histQuery = e.target.value; renderList(); });
  $('#plPlay').addEventListener('click', () => playPlaylist(false));
  $('#plShuffle').addEventListener('click', () => playPlaylist(true));
  $('#histSelect').addEventListener('click', () => setSelecting(!S.selecting));
  $('#histAll').addEventListener('click', () => {
    const all = entries().map((e) => e.i);
    if (all.length && all.every((i) => S.sel.has(i))) all.forEach((i) => S.sel.delete(i)); else all.forEach((i) => S.sel.add(i));
    renderList();
  });
  $('#histDelete').addEventListener('click', () => { const n = S.sel.size; removeHistory([...S.sel]); setSelecting(false); toast(`Erased ${n} from history`); });
  $('#histClear').addEventListener('click', () => {
    if (!S.history.length) return;
    if (!S.clearArmed) {
      S.clearArmed = true; syncHistTools();
      clearTimeout(init.armTimer); init.armTimer = setTimeout(() => { S.clearArmed = false; syncHistTools(); }, 4000);
      return;
    }
    S.history = []; S.hIndex = -1; S.selecting = false; S.sel.clear(); S.clearArmed = false;
    updatePeek(); renderList(); save(); toast('History cleared');
  });
  $('#libraryBtn').addEventListener('click', () => setLibraryOpen(!S.libraryOpen));
  $('#rollBtn').addEventListener('click', roll);
  $('#nextBtn').addEventListener('click', () => next());
  $('#prevBtn').addEventListener('click', prev);
  $('#reloadBtn').addEventListener('click', reloadPlayer);
  $('#favBtn').addEventListener('click', toggleFav);
  $('#ytBtn').addEventListener('click', () => S.current && window.api.openYouTube(S.current.id));
  $('#copyBtn').addEventListener('click', async () => {
    if (!S.current) return;
    try { await navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${S.current.id}`); toast('Link copied'); }
    catch { toast('Could not copy the link'); }
  });
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inSettings()) { openSettings(false); return; }
    if (inSettings()) return;
    if (e.target.matches('input')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'n' || k === 'arrowright') next();
    else if (k === 'p' || k === 'arrowleft') prev();
    else if (k === 'r') roll();
    else if (k === 'f') toggleFav();
    else if (k === 'l') setLibraryOpen(!S.libraryOpen);
    else if (k === '/') { e.preventDefault(); $in().focus(); }
  });

  // Never start playing on launch. If a search was restored, just line its songs up in Up next.
  if (S.genre || S.theme) loadQueue();
}
init();
