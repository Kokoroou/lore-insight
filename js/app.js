/* ── State ───────────────────────────────────────────── */
const S = {
  maps:          new Map(),  // mapId → { mapId, mapName, events }
  commonEvents:  [],
  mapInfos:      {},         // mapId → {name}
  selectedMapId: null,
  selectedEvId:  null,
  selectedPage:  0,
  detailOpen:    true,
};

/* ── DOM refs ────────────────────────────────────────── */
const EL = {};
document.addEventListener('DOMContentLoaded', () => {
  [
    'setup','sidebar','sb-list',
    'scan-status','setup-status','event-breadcrumb','page-tabs',
    'event-picker','event-list-grid','detail-panel','detail-body',
    'open-btn','about-btn','about-modal','about-close','theme-toggle',
    'detail-toggle','sidebar-toggle','cy-fit','cy-zoom-in','cy-zoom-out',
  ].forEach(id => { EL[id.replace(/-([a-z])/g, (_,c)=>c.toUpperCase())] = document.getElementById(id); });
  EL.graphView   = document.getElementById('graph-view');
  EL.sbResizer   = document.getElementById('sb-resizer');

  init();
});

/* ── Cytoscape instance ──────────────────────────────── */
let cy = null;

function initCy() {
  if (cy) { cy.destroy(); cy = null; }
  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [],
    style: cyStyle(),
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 3,
    wheelSensitivity: 0.3,
  });
  cy.on('tap', 'node', e => showDetail(e.target.data('nodeData')));
  cy.on('tap', e => { if (e.target === cy) clearDetail(); });
}

function cyStyle() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const bgBase = isDark ? '#07080d' : '#f4f5fb';
  return [
    {
      selector: 'node',
      style: {
        'shape': 'round-rectangle',
        'background-color': NODE_COLORS.dialogue.bg,
        'border-color':     NODE_COLORS.dialogue.border,
        'border-width': 1.5,
        'color': NODE_COLORS.dialogue.text,
        'label': 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': 200,
        'font-size': 11,
        'font-family': "'Segoe UI Variable','Segoe UI',system-ui,sans-serif",
        'padding': 12,
        'width': 'label',
        'height': 'label',
        'text-valign': 'center',
        'text-halign': 'center',
        'min-width': 120,
        'min-height': 36,
      }
    },
    nodeTypeStyle('dialogue',  NODE_COLORS.dialogue,  'round-rectangle'),
    nodeTypeStyle('choice',    NODE_COLORS.choice,    'diamond'),
    nodeTypeStyle('condition', NODE_COLORS.condition, 'diamond'),
    nodeTypeStyle('label',     NODE_COLORS.label,     'ellipse'),
    nodeTypeStyle('jump',      NODE_COLORS.jump,      'ellipse'),
    {
      selector: 'node:selected',
      style: { 'border-width': 2.5, 'border-color': '#f59e0b', 'box-shadow': '0 0 0 3px rgba(245,158,11,.3)' }
    },
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': isDark ? '#272944' : '#b0b2c4',
        'target-arrow-color': isDark ? '#272944' : '#b0b2c4',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': 10,
        'color': isDark ? '#686a88' : '#9698b0',
        'text-background-color': bgBase,
        'text-background-opacity': 0.85,
        'text-background-padding': '3px',
        'text-rotation': 'autorotate',
      }
    },
    {
      selector: 'edge[?isJump]',
      style: {
        'line-style': 'dashed',
        'line-color': '#fb923c',
        'target-arrow-color': '#fb923c',
        'line-dash-pattern': [6, 3],
      }
    },
    {
      selector: 'edge:selected',
      style: { 'line-color': '#f59e0b', 'target-arrow-color': '#f59e0b', 'width': 2 }
    },
  ];
}

function nodeTypeStyle(type, colors, shape) {
  return {
    selector: `node[nodeType="${type}"]`,
    style: {
      'background-color': colors.bg,
      'border-color':     colors.border,
      'color':            colors.text,
      'shape':            shape,
    }
  };
}

/* ── Render graph ────────────────────────────────────── */
function renderGraph(nodes, edges) {
  if (!cy) initCy();

  const elements = [];
  for (const n of nodes) {
    elements.push({ data: { id: n.id, label: nodeLabel(n), nodeType: n.type, nodeData: n } });
  }
  for (const e of edges) {
    const eid = `e_${e.source}_${e.target}_${Math.random().toString(36).slice(2,6)}`;
    elements.push({ data: { id: eid, source: e.source, target: e.target, label: e.label || '', isJump: e.isJump || false } });
  }

  cy.elements().remove();
  cy.add(elements);
  cy.style(cyStyle());

  const layout = cy.layout({
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 40,
    rankSep: 60,
    edgeSep: 10,
    padding: 32,
    animate: false,
  });
  layout.run();

  setTimeout(() => cy.fit(undefined, 32), 50);
}

function nodeLabel(n) {
  switch (n.type) {
    case 'dialogue': {
      const spk = n.speaker ? n.speaker + '\n' : '';
      const txt = n.lines.map(l => stripCodes(l)).join('\n').slice(0, 100);
      return (spk + txt).trim() || '(empty text)';
    }
    case 'choice':    return n.choices.map((c,i) => `${i+1}. ${c}`).join('\n');
    case 'condition': return n.label;
    case 'label':     return `▸ ${n.name}`;
    case 'jump':      return `↩ ${n.target}`;
    default:          return n.type;
  }
}

// Strip RPG Maker text control codes like \C[n], \V[n], \N[n], \I[n], \\.
function stripCodes(str) {
  return (str || '').replace(/\\[A-Za-z]\[\d+\]/g, '').replace(/\\\./g, '').replace(/\\!/g, '').trim();
}

/* ── Detail panel ────────────────────────────────────── */
function showDetail(nodeData) {
  if (!nodeData) return;
  const body = EL.detailBody;
  body.innerHTML = '';

  const badge = el('span', `detail-type-badge badge-${nodeData.type}`, typeName(nodeData.type));
  body.appendChild(badge);

  switch (nodeData.type) {
    case 'dialogue': {
      if (nodeData.speaker) {
        const sp = el('div', 'detail-speaker', nodeData.speaker);
        body.appendChild(sp);
      }
      const linesWrap = el('div', 'detail-lines');
      for (const line of nodeData.lines) {
        linesWrap.appendChild(el('div', 'detail-line', line || '(empty)'));
      }
      body.appendChild(linesWrap);
      break;
    }
    case 'choice': {
      body.appendChild(el('div', 'detail-field-label', 'Choices'));
      const cw = el('div', 'detail-choices');
      nodeData.choices.forEach((c, i) => {
        const row = el('div', 'detail-choice-item');
        row.appendChild(el('span', 'detail-choice-num', `${i+1}`));
        row.appendChild(el('span', '', c));
        cw.appendChild(row);
      });
      body.appendChild(cw);
      break;
    }
    case 'condition': {
      body.appendChild(fieldEl('Condition', nodeData.label));
      if (nodeData.params) {
        body.appendChild(fieldEl('Type', CONDITION_TYPES[nodeData.params[0]] ?? nodeData.params[0]));
      }
      break;
    }
    case 'label': {
      body.appendChild(fieldEl('Label name', nodeData.name));
      break;
    }
    case 'jump': {
      body.appendChild(fieldEl('Jump target', nodeData.target));
      break;
    }
  }
}

function clearDetail() {
  EL.detailBody.innerHTML = '<div class="detail-empty">Click a node to inspect it</div>';
}

function typeName(t) {
  return { dialogue:'Dialogue', choice:'Choice', condition:'Condition', label:'Label', jump:'Jump' }[t] ?? t;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fieldEl(label, value) {
  const wrap = el('div', 'detail-field');
  wrap.appendChild(el('div', 'detail-field-label', label));
  wrap.appendChild(el('div', 'detail-field-value', value ?? '—'));
  return wrap;
}

/* ── Sidebar rendering ───────────────────────────────── */
function renderSidebar() {
  const list = EL.sbList;
  list.innerHTML = '';

  if (S.maps.size === 0 && S.commonEvents.length === 0) {
    list.appendChild(el('div', 'sb-item', 'No data loaded'));
    return;
  }

  if (S.maps.size > 0) {
    list.appendChild(el('div', 'sb-section', 'Maps'));
    for (const [mapId, mapData] of S.maps) {
      const item = el('div', 'sb-item' + (S.selectedMapId === mapId ? ' active' : ''));
      const icon = el('span', '', '🗺');
      icon.style.fontSize = '12px';
      item.appendChild(icon);
      item.appendChild(el('span', '', mapData.mapName));
      const cnt = el('span', 'sb-count', mapData.events.length);
      item.appendChild(cnt);
      item.addEventListener('click', () => selectMap(mapId));
      list.appendChild(item);
    }
  }

  if (S.commonEvents.length > 0) {
    list.appendChild(el('div', 'sb-section', 'Common Events'));
    for (const cev of S.commonEvents) {
      const item = el('div', 'sb-item' + (S.selectedMapId === 'common' && S.selectedEvId === cev.id ? ' active' : ''));
      item.appendChild(el('span', '', '⚡'));
      item.appendChild(el('span', '', cev.name));
      item.addEventListener('click', () => selectCommonEvent(cev.id));
      list.appendChild(item);
    }
  }
}

/* ── Map / event selection ───────────────────────────── */
function selectMap(mapId) {
  S.selectedMapId = mapId;
  S.selectedEvId  = null;
  S.selectedPage  = 0;
  renderSidebar();
  showGraphView();
  showEventPicker(mapId);
}

function selectCommonEvent(evId) {
  S.selectedMapId = 'common';
  S.selectedEvId  = evId;
  S.selectedPage  = 0;
  renderSidebar();
  showGraphView();

  const cev = S.commonEvents.find(e => e.id === evId);
  if (!cev) return;

  EL.eventBreadcrumb.innerHTML = `Common Events › <span>${cev.name}</span>`;
  EL.pageTabs.innerHTML = '';
  EL.eventPicker.classList.add('hidden');

  const prefix = `cev_${evId}`;
  const { nodes, edges } = parseEventPage(cev.list, prefix);
  renderGraph(nodes, edges);
  clearDetail();
}

function showEventPicker(mapId) {
  const mapData = S.maps.get(mapId);
  if (!mapData) return;

  EL.eventBreadcrumb.innerHTML = `<span>${mapData.mapName}</span>`;
  EL.pageTabs.innerHTML = '';
  EL.eventPicker.classList.remove('hidden');

  const grid = EL.eventListGrid;
  grid.innerHTML = '';

  for (const ev of mapData.events) {
    const card = el('div', 'ev-card');
    card.appendChild(el('div', 'ev-card-name', ev.name));
    card.appendChild(el('div', 'ev-card-meta', `ID: ${ev.id} · (${ev.x},${ev.y}) · ${ev.pages.length} page${ev.pages.length !== 1 ? 's' : ''}`));
    card.addEventListener('click', () => selectEvent(mapId, ev.id));
    grid.appendChild(card);
  }
}

function selectEvent(mapId, evId) {
  S.selectedMapId = mapId;
  S.selectedEvId  = evId;
  S.selectedPage  = 0;

  const mapData = S.maps.get(mapId);
  const ev = mapData?.events.find(e => e.id === evId);
  if (!ev) return;

  EL.eventBreadcrumb.innerHTML = `${mapData.mapName} › <span>${ev.name}</span>`;
  EL.eventPicker.classList.add('hidden');
  renderSidebar();

  // Render page tabs
  EL.pageTabs.innerHTML = '';
  ev.pages.forEach((_, pi) => {
    const tab = el('button', 'page-tab' + (pi === 0 ? ' active' : ''), `Page ${pi + 1}`);
    tab.addEventListener('click', () => selectPage(pi));
    EL.pageTabs.appendChild(tab);
  });

  selectPage(0);
}

function selectPage(pi) {
  S.selectedPage = pi;
  const tabs = EL.pageTabs.querySelectorAll('.page-tab');
  tabs.forEach((t, i) => t.classList.toggle('active', i === pi));

  const mapData = S.maps.get(S.selectedMapId);
  const ev = mapData?.events.find(e => e.id === S.selectedEvId);
  if (!ev || !ev.pages[pi]) return;

  const prefix = `map${S.selectedMapId}_ev${S.selectedEvId}_p${pi}`;
  const { nodes, edges } = parseEventPage(ev.pages[pi].list, prefix);
  renderGraph(nodes, edges);
  clearDetail();
}

/* ── View switching ──────────────────────────────────── */
function showSetup() {
  EL.setup.style.display = 'flex';
  EL.graphView.classList.remove('visible');
}

function showGraphView() {
  EL.setup.style.display = 'none';
  EL.graphView.classList.add('visible');
  if (!cy) initCy();
}

/* ── File loading ────────────────────────────────────── */
async function loadFolder(files) {
  setStatus('info', '<span class="spinner"></span> Scanning files…');

  const fileMap = new Map();
  for (const f of files) {
    const rel = (f._dragPath || f.webkitRelativePath || f.name).replace(/\\/g, '/');
    fileMap.set(rel, f);
  }

  // Find data/ folder
  let dataPrefix = '';
  for (const [path] of fileMap) {
    const m = path.match(/^(.+\/)?data\//i);
    if (m) { dataPrefix = m[0]; break; }
  }

  if (!dataPrefix) {
    // Try without data/ prefix
    const hasMapFile = [...fileMap.keys()].some(p => /Map\d{3}\.json$/i.test(p));
    if (!hasMapFile) {
      setStatus('err', 'No RPG Maker data folder found. Make sure to select the game root or data/ folder.');
      return;
    }
  }

  // Load MapInfos.json for map names
  const infoFile = findFile(fileMap, dataPrefix, 'MapInfos.json');
  if (infoFile) {
    try {
      const json = JSON.parse(await infoFile.text());
      json.forEach((info, i) => { if (info) S.mapInfos[i] = { name: info.name }; });
    } catch {}
  }

  // Load CommonEvents.json
  const cevFile = findFile(fileMap, dataPrefix, 'CommonEvents.json');
  if (cevFile) {
    try {
      S.commonEvents = parseCommonEvents(JSON.parse(await cevFile.text()));
    } catch {}
  }

  // Load Map###.json files
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

  // Auto-select first map
  if (S.maps.size > 0) {
    setTimeout(() => {
      selectMap(S.maps.keys().next().value);
    }, 100);
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
  const el = EL.setupStatus;
  if (!el) return;
  el.className = cls;
  el.innerHTML = html;
}

/* ── UI events ───────────────────────────────────────── */
function init() {
  // Restore theme
  const saved = localStorage.getItem('li-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');

  // Theme toggle
  EL.themeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('li-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('li-theme', 'light');
    }
    if (cy) cy.style(cyStyle());
  });

  // Open folder button
  EL.openBtn.addEventListener('click', () => {
    if (window.showDirectoryPicker) {
      openWithFSAPI();
    } else {
      document.getElementById('folder-input').click();
    }
  });

  // Drop zone click
  document.getElementById('drop-zone').addEventListener('click', () => EL.openBtn.click());

  // Fallback file input
  document.getElementById('folder-input').addEventListener('change', e => {
    if (e.target.files.length) loadFolder([...e.target.files]);
  });

  // Drag & drop
  document.addEventListener('dragover', e => {
    e.preventDefault();
    document.getElementById('drag-overlay').classList.add('active');
  });
  document.addEventListener('dragleave', e => {
    if (!e.relatedTarget) document.getElementById('drag-overlay').classList.remove('active');
  });
  document.addEventListener('drop', e => {
    e.preventDefault();
    document.getElementById('drag-overlay').classList.remove('active');
    const items = [...e.dataTransfer.items];
    const entry = items.find(i => i.webkitGetAsEntry?.()?.isDirectory);
    if (entry) {
      const dirEntry = entry.webkitGetAsEntry();
      readDirectoryEntry(dirEntry).then(files => loadFolder(files));
    } else if (e.dataTransfer.files.length) {
      loadFolder([...e.dataTransfer.files]);
    }
  });

  // Sidebar toggle
  EL.sidebarToggle.addEventListener('click', () => {
    EL.sidebar.classList.toggle('hidden');
    EL.sbResizer.classList.toggle('hidden');
  });

  // Detail panel toggle
  EL.detailToggle.addEventListener('click', () => {
    S.detailOpen = !S.detailOpen;
    EL.detailPanel.classList.toggle('hidden', !S.detailOpen);
    EL.detailToggle.classList.toggle('active', S.detailOpen);
  });

  // Graph controls
  EL.cyFit.addEventListener('click', () => cy?.fit(undefined, 32));
  EL.cyZoomIn.addEventListener('click',  () => cy?.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }));
  EL.cyZoomOut.addEventListener('click', () => cy?.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }));

  // About
  EL.aboutBtn.addEventListener('click', () => EL.aboutModal.classList.add('open'));
  EL.aboutClose.addEventListener('click', () => EL.aboutModal.classList.remove('open'));
  EL.aboutModal.addEventListener('click', e => { if (e.target === EL.aboutModal) EL.aboutModal.classList.remove('open'); });

  // Sidebar resize
  let sbDrag = false, sbStart = 0, swStart = 0;
  EL.sbResizer.addEventListener('mousedown', e => {
    sbDrag = true;
    sbStart = e.clientX;
    swStart = EL.sidebar.offsetWidth;
    EL.sbResizer.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!sbDrag) return;
    const w = Math.max(140, Math.min(400, swStart + e.clientX - sbStart));
    document.documentElement.style.setProperty('--sw', w + 'px');
  });
  window.addEventListener('mouseup', () => {
    if (sbDrag) EL.sbResizer.classList.remove('dragging');
    sbDrag = false;
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') EL.aboutModal.classList.remove('open');
  });

  // Init detail panel
  clearDetail();
}

async function openWithFSAPI() {
  try {
    const dir = await window.showDirectoryPicker({ id: 'lore-game', mode: 'read' });
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
