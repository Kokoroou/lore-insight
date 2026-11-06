/* ── File loading ────────────────────────────────────── */
// Two rules keep slow machines responsive (same idea as MakerLens Assets):
// 1. Only data/*.json is listed and read: img/, audio/, movies/ are never walked.
// 2. The map tree shows as soon as MapInfos/System/Actors/CommonEvents are read;
//    Map###.json files are read on demand (the map the user opens first) and the
//    rest in the background, which waits while a foreground read is running.

const SPINNER = '<span class="status-spinner" aria-hidden="true"></span> ';
const MAP_FILE  = /^Map(\d{3})\.json$/i;
const DATA_FILE = /^(MapInfos|Actors|System|CommonEvents|Map\d{3})\.json$/i;
// Folders a game ships that never hold data/: skipped when looking for it.
const SKIP_DIRS = /^(img|audio|movies|fonts|effects|icon|js|css|save|locales?|node_modules|\.git)$/i;
const DATA_DEPTH = 3;   // root/, game/, game/www/, game/www/data/

let loadGen = 0;            // bumped by every loadFolder(): older background work stops
let mapReads = new Map();   // mapId → Promise<map|null>, one read per map
let loadInfo = null;        // progress of the current folder's map reading
const Fg = { active: 0 };   // foreground map reads in flight (the background waits)

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function loadFolder(files) {
  const gen = ++loadGen;
  setStatus('info', SPINNER + 'Reading game data…');

  const fileMap = new Map();
  for (const f of files) {
    const rel = (f._dragPath || f.webkitRelativePath || f.name).replace(/\\/g, '/');
    fileMap.set(rel, f);
  }

  let dataPrefix = '';
  for (const [path] of fileMap) {
    const m = path.match(/^(.+\/)?data\//i);
    if (m) { dataPrefix = m[0]; break; }
  }

  const mapFiles = new Map();   // mapId → file, in id order
  for (const [path, file] of fileMap) {
    const m = path.split('/').pop().match(MAP_FILE);
    if (m && (!dataPrefix || path.startsWith(dataPrefix))) mapFiles.set(parseInt(m[1], 10), file);
  }

  if (!dataPrefix && mapFiles.size === 0) {
    setStatus('err', 'No RPG Maker data folder found. Make sure to select the game root or data/ folder.');
    return;
  }
  if (mapFiles.size === 0) {
    setStatus('err', 'No Map###.json files found in the data folder.');
    return;
  }

  const readJson = async name => {
    const f = findFile(fileMap, dataPrefix, name);
    if (!f) return null;
    try { return JSON.parse(await f.text()); } catch { return null; }
  };
  const [infos, actors, system, cevs] = await Promise.all(
    ['MapInfos.json', 'Actors.json', 'System.json', 'CommonEvents.json'].map(readJson));
  if (gen !== loadGen) return;   // another folder was opened meanwhile

  S.mapInfos = {};
  S.collapsedFolders = new Set();
  (Array.isArray(infos) ? infos : []).forEach((info, i) => {
    if (!info) return;
    S.mapInfos[i] = { name: info.name, parentId: info.parentId ?? 0, order: info.order ?? i, expanded: info.expanded !== false };
    if (info.expanded === false) S.collapsedFolders.add(i);
  });
  S.actors       = Array.isArray(actors) ? actors.map(a => (a && a.name) || '') : [];
  S.variables    = (system && system.variables) || [];
  S.switches     = (system && system.switches)  || [];
  S.commonEvents = cevs ? parseCommonEvents(cevs) : [];
  S.maps = new Map();
  S.mapFiles = new Map([...mapFiles].sort((a, b) => a[0] - b[0]));
  S.selectedMapId = null;
  S.selectedEvId = null;
  S.currentPage = null;
  S.history = [];
  S.future = [];
  mapReads = new Map();
  loadInfo = { total: S.mapFiles.size, done: 0, picked: false };

  renderSidebar();
  EL.sidebar.classList.remove('hidden');
  EL.sbResizer.classList.remove('hidden');
  setStatus('info', SPINNER + 'Reading maps…');
  showMapProgress();

  S.bgDone = readMapsInBackground(gen);
}

/* ── Map reading: the one on screen first, the rest in the background ── */
function ensureMap(mapId) {
  if (S.maps.has(mapId)) return Promise.resolve(S.maps.get(mapId));
  if (!mapReads.has(mapId)) {
    if (!S.mapFiles.has(mapId)) return Promise.resolve(null);
    mapReads.set(mapId, readMap(mapId, loadGen));
  }
  return mapReads.get(mapId);
}

// Foreground read (the user opened this map): the background pauses meanwhile.
async function openMap(mapId) {
  Fg.active++;
  try { return await ensureMap(mapId); } finally { Fg.active--; }
}

async function readMap(mapId, gen) {
  const file = S.mapFiles.get(mapId);
  let data = null;
  try { data = parseMapJson(JSON.parse(await file.text()), mapId, S.mapInfos); } catch {}
  if (gen !== loadGen) return null;
  S.mapFiles.delete(mapId);
  if (data && data.events.length > 0) S.maps.set(mapId, data);
  else data = null;
  mapRead(mapId, data);
  return data;
}

// Sidebar order (what the user sees from the top), then maps outside MapInfos.
function mapReadOrder() {
  const kids = {};
  for (const [id, info] of Object.entries(S.mapInfos)) (kids[info.parentId ?? 0] = kids[info.parentId ?? 0] || []).push(+id);
  const order = [], seen = new Set();
  const walk = pid => {
    (kids[pid] || []).sort((a, b) => (S.mapInfos[a].order ?? 0) - (S.mapInfos[b].order ?? 0)).forEach(id => {
      if (seen.has(id)) return;
      seen.add(id); order.push(id); walk(id);
    });
  };
  walk(0);
  for (const id of S.mapFiles.keys()) if (!seen.has(id)) order.push(id);
  return order.filter(id => S.mapFiles.has(id));
}

async function readMapsInBackground(gen) {
  for (const id of mapReadOrder()) {
    while (Fg.active && gen === loadGen) await sleep(30);
    if (gen !== loadGen) return;
    await ensureMap(id);
    await sleep(0);   // let the page paint and handle input between maps
  }
  if (gen === loadGen) finishLoad();
}

function mapRead(mapId, data) {
  loadInfo.done++;
  showMapProgress();
  const count = EL.sbList && EL.sbList.querySelector(`[data-map-id="${mapId}"] .sb-count`);
  if (data && count) { count.textContent = data.events.length; count.classList.remove('pending'); count.removeAttribute('title'); }
  else refreshSidebarSoon();   // a map without events leaves the tree

  // Open the first map with events, unless the user already picked something.
  if (data && !loadInfo.picked && S.selectedMapId == null) {
    loadInfo.picked = true;
    if (typeof Feedback !== 'undefined') Feedback.noteOpen();   // may ask for a rating from the 2nd game (feedback.js)
    selectMap(mapId);
  }
}

function showMapProgress() {
  if (EL.scanStatus) EL.scanStatus.textContent = `Reading maps ${loadInfo.done}/${loadInfo.total}…`;
}

function finishLoad() {
  clearTimeout(sidebarTimer); sidebarTimer = 0;
  if (S.maps.size === 0) {
    EL.scanStatus.textContent = '';
    EL.sidebar.classList.add('hidden');
    EL.sbResizer.classList.add('hidden');
    setStatus('err', 'No events found in any map file.');
    return;
  }
  const totalEvents = [...S.maps.values()].reduce((s, m) => s + m.events.length, 0);
  EL.scanStatus.textContent = `${S.maps.size} maps · ${totalEvents} events`;
  setStatus('ok', `Loaded ${S.maps.size} maps with ${totalEvents} events and ${S.commonEvents.length} common events.`);
  renderSidebar();
}

let sidebarTimer = 0;
function refreshSidebarSoon() {
  if (sidebarTimer) return;
  sidebarTimer = setTimeout(() => { sidebarTimer = 0; renderSidebar(); }, 400);
}

function findFile(fileMap, prefix, name) {
  const target = (prefix + name).toLowerCase();
  for (const [path, file] of fileMap) {
    if (path.toLowerCase() === target || path.toLowerCase().endsWith('/' + name.toLowerCase())) {
      return file;
    }
  }
  return null;
}

function setStatus(cls, html) {
  const statusEl = EL.setupStatus;
  if (!statusEl) return;
  statusEl.className = cls;
  statusEl.innerHTML = html;
}

/* ── Finding data/ without walking the whole game ─────── */
// Directory adapters: folder picker handles and drag & drop entries.
const FS_HANDLE = {
  async list(dir) {
    const out = [];
    for await (const [name, node] of dir) out.push({ name, node, isDir: node.kind === 'directory' });
    return out;
  },
  file: node => node.getFile(),
};

const FS_ENTRY = {
  // readEntries() returns at most ~100 entries per call: keep calling until it returns none.
  list(dir) {
    const reader = dir.createReader(), out = [];
    return new Promise((resolve, reject) => {
      const next = () => reader.readEntries(batch => {
        if (!batch.length) return resolve(out);
        for (const node of batch) out.push({ name: node.name, node, isDir: node.isDirectory });
        next();
      }, reject);
      next();
    });
  },
  file: node => new Promise((resolve, reject) => node.file(resolve, reject)),
};

// Breadth-first from the selected folder: the first folder holding Map###.json wins
// (a folder named data first at each level). Returns lazy file-likes for the
// data/*.json files only; nothing is read until text() is called.
async function findDataFiles(root, fs) {
  let level = [{ dir: root, path: '' }];
  for (let depth = 0; depth <= DATA_DEPTH && level.length; depth++) {
    const next = [];
    for (const { dir, path } of level) {
      const kids = await fs.list(dir);
      const files = kids.filter(k => !k.isDir && DATA_FILE.test(k.name));
      if (files.some(k => MAP_FILE.test(k.name))) {
        return files.map(k => ({
          name: k.name,
          _dragPath: path + k.name,
          text: () => fs.file(k.node).then(f => f.text()),
        }));
      }
      kids.filter(k => k.isDir && !SKIP_DIRS.test(k.name))
        .sort((a, b) => (/^data$/i.test(b.name) ? 1 : 0) - (/^data$/i.test(a.name) ? 1 : 0))
        .forEach(k => next.push({ dir: k.node, path: path + k.name + '/' }));
    }
    level = next;
  }
  return [];
}

async function openWithFSAPI() {
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: 'makerlens-game', mode: 'read' });
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('err', 'Could not open folder: ' + e.message);
    return;
  }
  await openFolder(dir, FS_HANDLE);
}

async function openFolder(root, fs) {
  try {
    setStatus('info', SPINNER + 'Looking for the data folder…');
    await loadFolder(await findDataFiles(root, fs));
  } catch (e) {
    setStatus('err', 'Could not open folder: ' + e.message);
  }
}
