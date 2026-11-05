/* ── File loading ────────────────────────────────────── */
async function loadFolder(files) {
  setStatus('info', '<span class="spinner"></span> Scanning files…');
  S.mapInfos = {};
  S.collapsedFolders = new Set();
  S.history = [];
  S.future = [];

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

  if (!dataPrefix) {
    const hasMapFile = [...fileMap.keys()].some(p => /Map\d{3}\.json$/i.test(p));
    if (!hasMapFile) {
      setStatus('err', 'No RPG Maker data folder found. Make sure to select the game root or data/ folder.');
      return;
    }
  }

  const infoFile = findFile(fileMap, dataPrefix, 'MapInfos.json');
  if (infoFile) {
    try {
      const json = JSON.parse(await infoFile.text());
      json.forEach((info, i) => {
        if (info) {
          S.mapInfos[i] = { name: info.name, parentId: info.parentId ?? 0, order: info.order ?? i, expanded: info.expanded !== false };
          if (info.expanded === false) S.collapsedFolders.add(i);
        }
      });
    } catch {}
  }

  const actorsFile = findFile(fileMap, dataPrefix, 'Actors.json');
  if (actorsFile) {
    try {
      const json = JSON.parse(await actorsFile.text());
      S.actors = json.map(a => (a && a.name) || '');
    } catch {}
  }

  const systemFile = findFile(fileMap, dataPrefix, 'System.json');
  if (systemFile) {
    try {
      const json = JSON.parse(await systemFile.text());
      S.variables = json.variables || [];
      S.switches  = json.switches  || [];
    } catch {}
  }

  const cevFile = findFile(fileMap, dataPrefix, 'CommonEvents.json');
  if (cevFile) {
    try {
      S.commonEvents = parseCommonEvents(JSON.parse(await cevFile.text()));
    } catch {}
  }

  S.maps.clear();
  const mapFiles = [...fileMap.entries()].filter(([p]) => /Map\d{3}\.json$/i.test(p));

  if (mapFiles.length === 0) {
    setStatus('err', 'No Map###.json files found in the data folder.');
    return;
  }

  let loaded = 0;
  for (const [, file] of mapFiles) {
    const m = file.name.match(/Map(\d{3})\.json$/i);
    if (!m) continue;
    const mapId = parseInt(m[1], 10);
    try {
      const json = JSON.parse(await file.text());
      const data = parseMapJson(json, mapId, S.mapInfos);
      if (data.events.length > 0) {
        S.maps.set(mapId, data);
        loaded++;
      }
    } catch {}
  }

  if (loaded === 0) {
    setStatus('err', 'No events found in any map file.');
    return;
  }

  const totalEvents = [...S.maps.values()].reduce((s, m) => s + m.events.length, 0);
  EL.scanStatus.textContent = `${loaded} maps · ${totalEvents} events`;
  setStatus('ok', `Loaded ${loaded} maps with ${totalEvents} events and ${S.commonEvents.length} common events.`);

  renderSidebar();
  EL.sidebar.classList.remove('hidden');
  EL.sbResizer.classList.remove('hidden');

  if (S.maps.size > 0) {
    setTimeout(() => { selectMap(S.maps.keys().next().value); }, 100);
  }
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

async function openWithFSAPI() {
  try {
    const dir = await window.showDirectoryPicker({ id: 'makerlens-game', mode: 'read' });
    const files = await collectFilesFromFSAPI(dir, '');
    await loadFolder(files);
  } catch (e) {
    if (e.name !== 'AbortError') setStatus('err', 'Could not open folder: ' + e.message);
  }
}

async function collectFilesFromFSAPI(dirHandle, path) {
  const files = [];
  for await (const [name, handle] of dirHandle) {
    const fullPath = path ? `${path}/${name}` : name;
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      file._dragPath = fullPath;
      files.push(file);
    } else if (handle.kind === 'directory') {
      files.push(...await collectFilesFromFSAPI(handle, fullPath));
    }
  }
  return files;
}

async function readDirectoryEntry(entry) {
  const files = [];
  async function read(e, path) {
    if (e.isFile) {
      const file = await new Promise(r => e.file(r));
      file._dragPath = path || e.name;
      files.push(file);
    } else {
      const reader = e.createReader();
      const entries = await new Promise(r => reader.readEntries(r));
      for (const child of entries) await read(child, (path ? path + '/' : '') + child.name);
    }
  }
  await read(entry, '');
  return files;
}
