'use strict';
const { app, BrowserWindow, ipcMain, shell, session, WebContentsView, webFrameMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { execFile } = require('child_process');

const APP_NAME = 'Akyuu\u2019s Music Box';

// ---------- where things live ----------
// ~/.akyuus-music-box holds ONE file: store.json (settings, playlist, history). Nothing else is ever written there.
// Everything Chromium wants to write (cache, shader cache, crash dumps, profile) goes to a scratch folder on RAM-backed
// storage when available, and that folder is deleted when the app exits. The app never writes log files anywhere.
const DATA_DIR = path.join(os.homedir(), '.akyuus-music-box');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const runBase = [process.env.XDG_RUNTIME_DIR, '/dev/shm', os.tmpdir()].find((d) => d && fs.existsSync(d)); // RAM-backed first
const SCRATCH = path.join(runBase, `akyuus-music-box-${process.getuid ? process.getuid() : 0}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true, mode: 0o700 });
for (const n of ['userData', 'sessionData', 'cache', 'logs', 'crashDumps']) {
  try { app.setPath(n, n === 'userData' || n === 'sessionData' ? SCRATCH : path.join(SCRATCH, n)); } catch {}
}
app.setName(APP_NAME);
// tidy files left behind by earlier versions
for (const junk of ['log.txt', 'electron']) { try { fs.rmSync(path.join(DATA_DIR, junk), { recursive: true, force: true }); } catch {} }

function readStore() { try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch { return null; } }
if (!readStore()) { // one-time copy from the app's previous name
  for (const old of [path.join(os.homedir(), '.touhou-roulette', 'store.json'), path.join(os.homedir(), '.config', 'touhou-roulette', 'store.json')]) {
    try { fs.copyFileSync(old, STORE_FILE); break; } catch {}
  }
}
const saved = readStore() || {};
const cfg = saved.settings || {};
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
// Safe mode: plain software rendering and default Chromium options. It turns on by itself when the previous start
// never finished loading (marker `starting` in store.json), or with --safe / AKYUU_SAFE=1.
const safe = process.argv.includes('--safe') || process.env.AKYUU_SAFE === '1' || saved.starting === true;
function writeStore(obj) { try { const t = STORE_FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj)); fs.renameSync(t, STORE_FILE); } catch {} }
if (gotLock) {
  const st = readStore() || {};
  if (saved.starting === true) {
    st.settings = { ...(st.settings || {}), gfx: 'software', display: 'auto' };
    st.notice = 'The last start did not finish, so the app opened in safe mode (software graphics, default Chromium options).';
  }
  st.starting = true;
  writeStore(st);
}

// ---------- graphics + performance switches (must be set before the app is ready) ----------
const sw = (k, v) => (v === undefined ? app.commandLine.appendSwitch(k) : app.commandLine.appendSwitch(k, v));
// AppImages cannot ship a setuid sandbox helper
if (process.platform === 'linux') sw('no-sandbox');
sw('autoplay-policy', 'no-user-gesture-required');

const forceSoft = safe || process.argv.includes('--software') || process.env.AKYUU_SOFTWARE === '1';
const GFX_MODES = ['software', 'opengl-egl', 'opengl', 'vulkan'];
const gfx = forceSoft || !GFX_MODES.includes(cfg.gfx) ? 'software' : cfg.gfx;
const display = !safe && ['x11', 'wayland'].includes(cfg.display) ? cfg.display : 'auto';
const hwVideo = cfg.hwVideo === true;
const offFeatures = [
  'VaapiVideoDecoder', 'VaapiVideoDecodeLinuxGL', 'VaapiVideoEncoder', // GPU video decode is opt-in
  'Translate', 'MediaRouter', 'OptimizationHints', 'AutofillServerCommunication', 'InterestFeedContentSuggestions',
  'BackForwardCache', 'CalculateNativeWinOcclusion', 'PrivacySandboxSettings4', 'SafeBrowsingEnhancedProtection',
];
if (gfx === 'software') {
  app.disableHardwareAcceleration();
} else {
  sw('use-gl', 'angle');
  sw('use-angle', { 'opengl-egl': 'gl-egl', opengl: 'gl', vulkan: 'vulkan' }[gfx]);
  sw('ignore-gpu-blocklist');
  sw('disable-gpu-sandbox');
  if (gfx === 'vulkan') sw('enable-features', 'Vulkan,DefaultANGLEVulkan,VulkanFromANGLE');
  offFeatures.push('WaylandOverlayDelegation'); // video through Wayland overlay sub-surfaces misbehaves on some Mesa builds
  if (!hwVideo) {
    sw('disable-accelerated-video-decode');
    sw('disable-accelerated-video-encode');
    sw('disable-gpu-memory-buffer-video-frames');
    offFeatures.push('AcceleratedVideoDecodeLinuxGL', 'AcceleratedVideoDecodeLinuxZeroCopyGL');
  }
}
if (display !== 'auto') sw('ozone-platform', display);
if (!safe) {
  sw('disable-features', offFeatures.join(','));
  // Chromium's own Google update/service hosts (never needed to play a video) are not even looked up. At idle the stock
  // engine resolves redirector.gvt1.com on its own; these rules stop that and the other Chromium-only services.
  const blockedHosts = ['gvt1.com', '*.gvt1.com', 'gvt2.com', '*.gvt2.com', 'clients2.google.com', 'update.googleapis.com',
    'clientservices.googleapis.com', 'optimizationguide-pa.googleapis.com', 'safebrowsing.googleapis.com', 'safebrowsing.google.com', 'sb-ssl.google.com'];
  sw('host-resolver-rules', blockedHosts.map((h) => `MAP ${h} ~NOTFOUND`).join(', '));
  // no background chatter, no telemetry, no disk caches
  for (const f of ['disable-background-networking', 'disable-component-update', 'disable-sync', 'no-pings', 'disable-default-apps',
    'disable-domain-reliability', 'disable-client-side-phishing-detection', 'disable-breakpad', 'no-first-run',
    'disable-gpu-shader-disk-cache', 'disable-hang-monitor']) sw(f);
}

// ---------- local page server (YouTube embeds need a real http origin) ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
function startServer() {
  const min = path.join(__dirname, 'renderer-min');
  const root = fs.existsSync(min) ? min : path.join(__dirname, 'renderer');
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

// ---------- YouTube search (no API key: reads the public results page) ----------
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const toSeconds = (t) => (t ? t.split(':').reduce((a, n) => a * 60 + (parseInt(n, 10) || 0), 0) : 0);
function toViews(t) {
  if (!t) return 0;
  const m = t.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1));
}
function collectVideos(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => collectVideos(n, out)); return; }
  if (node.videoRenderer) {
    const v = node.videoRenderer, duration = v.lengthText && v.lengthText.simpleText;
    if (v.videoId && duration) {
      out.push({
        id: v.videoId,
        title: (v.title && v.title.runs && v.title.runs.map((r) => r.text).join('')) || 'Untitled',
        channel: (v.ownerText && v.ownerText.runs && v.ownerText.runs[0].text) || '',
        duration, seconds: toSeconds(duration),
        views: toViews(v.viewCountText && v.viewCountText.simpleText),
        published: (v.publishedTimeText && v.publishedTimeText.simpleText) || '',
      });
    }
  }
  for (const k of Object.keys(node)) if (k !== 'videoRenderer') collectVideos(node[k], out);
}
async function ytSearch(query, fresh) {
  const sp = fresh ? 'CAISAhAB' : 'EgIQAQ%3D%3D'; // videos only, optionally sorted by upload date
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=${sp}&hl=en&gl=US`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'CONSENT=YES+cb; SOCS=CAI' },
  });
  if (!res.ok) throw new Error(`YouTube answered with HTTP ${res.status}`);
  const m = (await res.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) throw new Error('Could not read the YouTube results page (layout may have changed, or a consent page was shown)');
  const items = [];
  collectVideos(JSON.parse(m[1]), items);
  const seen = new Set();
  return items.filter((i) => (seen.has(i.id) ? false : seen.add(i.id)));
}
ipcMain.handle('search', async (_e, query, fresh) => {
  try {
    if (typeof query !== 'string' || !query.trim()) return { items: [] };
    return { items: await ytSearch(query.slice(0, 200), !!fresh) };
  } catch (err) { return { error: String(err && err.message ? err.message : err) }; }
});

// ---------- store (settings, playlist, history) ----------
let reverted = false, lastBeat = 0, relaunching = false, blockTracking = cfg.blockTracking === true;
ipcMain.on('privacy:set', (_e, on) => { blockTracking = !!on; });
ipcMain.on('beat', () => { lastBeat = Date.now(); });
ipcMain.handle('store:get', () => ({ ...(readStore() || {}), dataDir: DATA_DIR, effectiveGfx: gfx, session: process.env.XDG_SESSION_TYPE || '' }));
ipcMain.handle('store:set', (_e, data) => {
  if (!data || typeof data !== 'object') return false;
  if (reverted) data.settings = { ...(data.settings || {}), gfx: 'software', display: 'auto' };
  const json = JSON.stringify(data);
  if (json.length > 2e6) return false;
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, json); fs.renameSync(tmp, STORE_FILE); // atomic
  return true;
});
ipcMain.handle('app:open-data', () => shell.openPath(DATA_DIR));
ipcMain.handle('app:relaunch', () => {
  relaunching = true;
  app.relaunch({ execPath: process.env.APPIMAGE || process.execPath });
  app.exit(0);
});
ipcMain.handle('open-youtube', (_e, id) => {
  if (typeof id === 'string' && /^[\w-]{11}$/.test(id)) shell.openExternal(`https://www.youtube.com/watch?v=${id}`);
});
// installed system fonts (fontconfig)
ipcMain.handle('fonts:list', () => new Promise((resolve) => {
  execFile('fc-list', [':', 'family'], { timeout: 5000, maxBuffer: 8e6 }, (err, out) => {
    if (err) return resolve([]);
    const set = new Set();
    for (const line of String(out).split('\n')) { const fam = line.split(',')[0].replace(/\\(.)/g, '$1').trim(); if (fam) set.add(fam); }
    resolve([...set].sort((a, b) => a.localeCompare(b)));
  });
}));
// graphics details as text for the Settings page (so nothing needs to be written to disk)
ipcMain.handle('gfx:info', async () => {
  let basic = {};
  try { basic = await app.getGPUInfo('basic'); } catch {}
  return JSON.stringify({
    running: gfx, requested: cfg.gfx || 'software', display, safeMode: safe, hwVideo, session: process.env.XDG_SESSION_TYPE || '',
    electron: process.versions.electron, chromium: process.versions.chrome,
    features: app.getGPUFeatureStatus(), devices: (basic.gpuDevice || []).map((g) => ({ vendor: g.vendorId, device: g.deviceId, active: !!g.active })),
  }, null, 2);
});

// If a GPU mode crashes or freezes, fall back to software for the next launch automatically.
function revertGfx() {
  if (gfx === 'software' || reverted) return;
  reverted = true;
  const st = readStore() || {};
  st.settings = { ...(st.settings || {}), gfx: 'software', display: 'auto' };
  st.notice = 'The last run with GPU graphics crashed or froze, so graphics were set back to Software. Restart to apply.';
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(st)); } catch {}
}
app.on('child-process-gone', (_e, d) => { if (d.type === 'GPU') revertGfx(); });
app.on('render-process-gone', () => revertGfx());

// ---------- fallback player: the real YouTube watch page, trimmed to just the video ----------
let win, view, poll, endedSent = false;
const PARTITION = 'akyuu-mem'; // no "persist:" prefix = in-memory session: no cookies, cache or leveldb files on disk
const WATCH_CSS = (gfx !== 'software' ? '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' : '') + `
  html,body{overflow:hidden!important;background:#000!important}
  ytd-masthead,#masthead-container,#secondary,#below,#related,#comments,#chat,ytd-watch-metadata,
  tp-yt-app-drawer,#guide,ytd-mini-guide-renderer,ytd-popup-container,tp-yt-iron-dropdown{display:none!important}
  #movie_player{position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;z-index:2147483647!important}`;
function ensureView() {
  if (view) return view;
  view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, partition: PARTITION, spellcheck: false } });
  win.contentView.addChildView(view);
  const wc = view.webContents;
  const style = () => { wc.insertCSS(WATCH_CSS).catch(() => {}); wc.executeJavaScript('window.dispatchEvent(new Event("resize"))').catch(() => {}); };
  wc.on('dom-ready', style); wc.on('did-finish-load', style);
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  return view;
}
const clampRect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
function checkEnded() {
  if (!view || endedSent) return;
  view.webContents.executeJavaScript(`(() => {
    const v = document.querySelector('video'), p = document.getElementById('movie_player');
    const cc = document.querySelector('.ytp-subtitles-button');
    if (cc && cc.getAttribute('aria-pressed') === 'true') cc.click();
    if (!v || (p && p.classList.contains('ad-showing'))) return 0;
    return (v.ended || (v.duration > 10 && v.currentTime >= v.duration - 0.4)) ? 1 : 0;
  })()`).then((r) => { if (r && !endedSent) { endedSent = true; win.webContents.send('watch:ended'); } }).catch(() => {});
}
ipcMain.handle('watch:play', (_e, id, rect) => {
  if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id) || !rect) return;
  const v = ensureView();
  v.setBounds(clampRect(rect)); v.setVisible(true);
  endedSent = false;
  v.webContents.loadURL(`https://www.youtube.com/watch?v=${id}`);
  clearInterval(poll); poll = setInterval(checkEnded, 1000);
});
ipcMain.handle('watch:rect', (_e, rect) => { if (view && rect) view.setBounds(clampRect(rect)); });
ipcMain.handle('watch:visible', (_e, on) => { if (view) view.setVisible(!!on); });
ipcMain.handle('watch:stop', () => {
  clearInterval(poll);
  if (view) { view.webContents.loadURL('about:blank'); view.setVisible(false); }
});

// ---------- window ----------
async function createWindow() {
  const port = await startServer();
  const origin = `http://localhost:${port}`;
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(app.userAgentFallback.replace(/\s*Electron\/\S+/, '').replace(/\s*akyuus-music-box\/\S+/i, ''));
  // Deny only what a music player never needs. Everything else stays allowed because YouTube's player probes things like
  // media-key-system and storage access when you change quality, and a blanket "deny" leaves it stuck on a gray screen.
  const DENY = new Set(['geolocation', 'notifications', 'midi', 'midiSysex', 'media', 'display-capture', 'hid', 'serial', 'usb', 'bluetooth', 'clipboard-read', 'idle-detection', 'window-management', 'openExternal']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(!DENY.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => !DENY.has(perm));
  // YouTube's embed must always receive a proper Referer from our local origin
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/embed/*', 'https://www.youtube-nocookie.com/embed/*'] }, (d, cb) => {
    const h = d.requestHeaders;
    if (!h.Referer && !h.referer) h.Referer = origin + '/';
    cb({ requestHeaders: h });
  });
  // Optional (Settings > Privacy): cancel YouTube/Google analytics pings. Only these URLs are ever inspected.
  const TRACKING = ['*://www.google-analytics.com/*', '*://ssl.google-analytics.com/*', '*://www.googletagmanager.com/*', '*://stats.g.doubleclick.net/*',
    '*://www.youtube.com/api/stats/qoe*', '*://www.youtube.com/api/stats/watchtime*', '*://www.youtube.com/api/stats/playback*', '*://www.youtube.com/api/stats/delayplay*',
    '*://www.youtube.com/ptracking*', '*://www.youtube.com/youtubei/v1/log_event*', '*://play.google.com/log*'];
  ses.webRequest.onBeforeRequest({ urls: TRACKING }, (_d, cb) => cb({ cancel: blockTracking }));
  win = new BrowserWindow({
    width: 1220, height: 800, minWidth: 900, minHeight: 640, backgroundColor: '#1d1a26', title: APP_NAME,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, partition: PARTITION, spellcheck: false, enableWebSQL: false },
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.)?youtube\.com\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // GPU modes: YouTube's player menus use a blur effect (backdrop-filter) that some graphics drivers fail to draw, which leaves the
  // player covered by a gray layer after you open its settings. Switch that effect off inside the player's frame.
  if (gfx !== 'software') {
    const css = '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
    const js = `(()=>{try{const s=new CSSStyleSheet();s.replaceSync(${JSON.stringify(css)});document.adoptedStyleSheets=[...document.adoptedStyleSheets,s]}catch(e){}})()`;
    win.webContents.on('did-frame-finish-load', (_e, isMain, pid, rid) => {
      if (isMain) return;
      try {
        const f = webFrameMain.fromId(pid, rid);
        if (f && /^https:\/\/(www\.)?youtube(-nocookie)?\.com\//.test(f.url)) f.executeJavaScript(js).catch(() => {});
      } catch {}
    });
  }
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) e.preventDefault(); });
  win.webContents.once('did-finish-load', () => { lastBeat = Date.now(); const st = readStore() || {}; if (st.starting) { delete st.starting; writeStore(st); } });
  if (gfx !== 'software') {
    const dog = setInterval(() => {
      if (reverted) return clearInterval(dog);
      if (win && win.isFocused() && !win.isMinimized() && lastBeat && Date.now() - lastBeat > 12000) revertGfx();
    }, 3000);
  }
  win.loadURL(origin + '/');
}
// Chromium keeps tiny internal database info-logs ("LOG", "LOG.old") in its scratch folder. They never touch the disk
// (the folder is RAM-backed) and are removed on exit, but sweep them while running as well.
function sweepLogs(dir = SCRATCH, depth = 0) {
  if (depth > 4) return;
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of names) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sweepLogs(p, depth + 1);
    else if (e.name === 'LOG' || e.name === 'LOG.old') { try { fs.unlinkSync(p); } catch {} }
  }
}
app.whenReady().then(() => { createWindow(); setTimeout(sweepLogs, 6000); setTimeout(sweepLogs, 30000); });
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
process.on('exit', () => { if (gotLock && !relaunching) { try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {} } });
