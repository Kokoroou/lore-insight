/* ── State ───────────────────────────────────────────── */
const S = {
  maps:          new Map(),  // mapId → { mapId, mapName, events }
  commonEvents:  [],
  mapInfos:      {},         // mapId → {name, parentId, order, expanded}
  selectedMapId: null,
  selectedEvId:  null,
  selectedPage:  0,
  detailOpen:    true,
  actors:        [],         // index → actor name
  variables:     [],         // index → variable name
  switches:      [],         // index → switch name
  mapJsons:      new Map(),  // mapId → original map JSON object
  currentNodes:  [],         // nodes from current page render
  currentPage:   null,       // current page object {list}
  dirty:         false,
};

/* ── DOM refs ────────────────────────────────────────── */
const EL = {};
document.addEventListener('DOMContentLoaded', () => {
  [
    'setup','sidebar','sb-list',
    'scan-status','setup-status','event-breadcrumb','page-tabs',
    'event-picker','event-list-grid','detail-panel','detail-body',
    'open-btn','about-btn','about-modal','about-close','theme-toggle',
    'detail-toggle','sidebar-toggle','cy-fit','cy-zoom-in','cy-zoom-out','btn-download',
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
    ...Object.entries(NODE_COLORS).map(([type, colors]) => ({
      selector: `node[nodeType="${type}"]:selected`,
      style: {
        'border-width': 3,
        'border-color': colors.border,
        'underlay-color': colors.border,
        'underlay-opacity': 0.4,
        'underlay-padding': 9,
      },
    })),
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
  S.currentNodes = nodes;

  const elements = [];
  for (const n of nodes) {
    elements.push({ data: {
      id: n.id,
      label: nodeLabel(n),
      nodeType: n.type,
      nodeData: n,
      glowColor: NODE_COLORS[n.type]?.border || '#f59e0b',
    }});
  }
  for (const e of edges) {
    const eid = `e_${e.source}_${e.target}_${Math.random().toString(36).slice(2,6)}`;
    elements.push({ data: { id: eid, source: e.source, target: e.target, label: e.label || '', isJump: e.isJump || false } });
  }

  const emptyNotice = document.getElementById('empty-page-notice');
  if (emptyNotice) emptyNotice.style.display = 'none';

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
      const full = n.lines.map(l => formatText(l)).join('\n');
      const txt = full.length > 120 ? full.slice(0, 120) + '…' : full;
      return (spk + txt).trim() || '(empty text)';
    }
    case 'choice': {
      const full = n.choices.map((c, i) => `${i+1}. ${formatText(c)}`).join('\n');
      return full.length > 120 ? full.slice(0, 120) + '…' : full;
    }
    case 'condition': return n.label;
    case 'label':     return `▸ ${n.name}`;
    case 'jump':      return `↩ ${n.target}`;
    default:          return n.type;
  }
}

// Strip control codes then resolve actor/variable names.
function formatText(str) {
  const resolved = resolveTextCodes(str || '');
  return resolved.replace(/\\[A-Za-z]\[\d+\]/g, '').replace(/\\\./g, '').replace(/\\!/g, '').trim();
}

// Alias kept for any legacy callers.
function stripCodes(str) { return formatText(str); }

/* ── Detail panel ────────────────────────────────────── */
function showDetail(nodeData, editMode) {
  if (!nodeData) return;
  const body = EL.detailBody;
  body.innerHTML = '';

  const badge = el('span', `detail-type-badge badge-${nodeData.type}`, typeName(nodeData.type));
  body.appendChild(badge);

  if (nodeData.type === 'dialogue' && editMode) {
    renderDetailEdit(body, nodeData);
    return;
  }

  switch (nodeData.type) {
    case 'dialogue': {
      if (nodeData.speaker) {
        const sp = el('div', 'detail-speaker', nodeData.speaker);
        body.appendChild(sp);
      }
      const linesWrap = el('div', 'detail-lines');
      for (const line of nodeData.lines) {
        const resolved = resolveTextCodes(line);
        linesWrap.appendChild(el('div', 'detail-line', resolved || '(empty)'));
      }
      body.appendChild(linesWrap);

      const editBtn = el('button', 'btn-ghost', 'Edit');
      editBtn.style.marginTop = '8px';
      editBtn.addEventListener('click', () => showDetail(nodeData, true));
      body.appendChild(editBtn);
      break;
    }
    case 'choice': {
      body.appendChild(el('div', 'detail-field-label', 'Choices'));
      const cw = el('div', 'detail-choices');
      nodeData.choices.forEach((c, i) => {
        const row = el('div', 'detail-choice-item');
        row.appendChild(el('span', 'detail-choice-num', `${i+1}`));
        row.appendChild(el('span', '', resolveTextCodes(c)));
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

function renderDetailEdit(body, nodeData) {
  const spkWrap = el('div', 'detail-edit-field');
  spkWrap.appendChild(el('div', 'detail-edit-label', 'Speaker'));
  const spkInput = el('input', 'detail-edit-input');
  spkInput.type = 'text';
  spkInput.value = nodeData.speaker || '';
  spkWrap.appendChild(spkInput);
  body.appendChild(spkWrap);

  const txtWrap = el('div', 'detail-edit-field');
  txtWrap.appendChild(el('div', 'detail-edit-label', 'Text (one line per row)'));
  const txtArea = document.createElement('textarea');
  txtArea.className = 'detail-edit-input';
  txtArea.rows = 6;
  txtArea.value = nodeData.lines.join('\n');
  txtWrap.appendChild(txtArea);
  body.appendChild(txtWrap);

  const actions = el('div', 'detail-edit-actions');

  const saveBtn = el('button', 'btn-save', 'Save');
  saveBtn.addEventListener('click', () => {
    const newSpeaker = spkInput.value.trim();
    const newLines = txtArea.value.split('\n');

    nodeData.speaker = newSpeaker;
    nodeData.lines = newLines;

    // Patch the original command list so download reflects edits
    if (S.currentPage && nodeData.listStart !== undefined) {
      const list = S.currentPage.list;
      list[nodeData.listStart].parameters[4] = newSpeaker;
      let li = 1;
      for (let i = nodeData.listStart + 1; i < nodeData.listEnd && i < list.length; i++) {
        if (list[i].code === 401) {
          list[i].parameters[0] = newLines[li - 1] ?? '';
          li++;
        }
      }
      // Add/remove trailing 401 lines if line count changed
    }

    // Update cytoscape label live
    cy?.getElementById(nodeData.id)?.data('label', nodeLabel(nodeData));
    S.dirty = true;
    showDownloadBtn();
    showDetail(nodeData, false);
  });
  actions.appendChild(saveBtn);

  const cancelBtn = el('button', 'btn-cancel-edit', 'Cancel');
  cancelBtn.addEventListener('click', () => showDetail(nodeData, false));
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
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
  const listEl = EL.sbList;
  listEl.innerHTML = '';

  if (S.maps.size === 0 && S.commonEvents.length === 0) {
    listEl.appendChild(el('div', 'sb-item', 'No data loaded'));
    return;
  }

  if (S.maps.size > 0) {
    listEl.appendChild(el('div', 'sb-section', 'Maps'));
    renderMapTree(listEl);
  }

  if (S.commonEvents.length > 0) {
    listEl.appendChild(el('div', 'sb-section', 'Common Events'));
    for (const cev of S.commonEvents) {
      const item = el('div', 'sb-item' + (S.selectedMapId === 'common' && S.selectedEvId === cev.id ? ' active' : ''));
      item.appendChild(el('span', '', '⚡'));
      item.appendChild(el('span', '', cev.name));
      item.addEventListener('click', () => selectCommonEvent(cev.id));
      listEl.appendChild(item);
    }
  }
}

function renderMapTree(container) {
  // Build children map from mapInfos
  const children = {};
  for (const [id, info] of Object.entries(S.mapInfos)) {
    const pid = info.parentId ?? 0;
    (children[pid] = children[pid] || []).push(parseInt(id));
  }
  for (const pid in children) {
    children[pid].sort((a, b) => (S.mapInfos[a]?.order ?? 0) - (S.mapInfos[b]?.order ?? 0));
  }

  function hasEvents(id) {
    if (S.maps.has(id)) return true;
    return (children[id] || []).some(c => hasEvents(c));
  }

  function renderNode(id, depth, parentEl) {
    if (!hasEvents(id)) return;
    const info = S.mapInfos[id];
    if (!info) return;

    const hasMap = S.maps.has(id);
    const kidsWithEvents = (children[id] || []).filter(c => hasEvents(c));

    if (kidsWithEvents.length > 0) {
      // Folder row
      const folderRow = el('div', 'sb-folder');
      folderRow.style.paddingLeft = (depth * 12 + 12) + 'px';
      // Start expanded if info.expanded is true (mirrors RPG Maker editor state)
      if (info.expanded === false) folderRow.classList.add('collapsed');
      const arrow = el('span', 'sb-folder-arrow', '▾');
      const label = el('span', 'sb-folder-label', info.name);
      folderRow.appendChild(arrow);
      folderRow.appendChild(label);
      if (hasMap) {
        const cnt = el('span', 'sb-count', S.maps.get(id).events.length);
        cnt.style.marginLeft = 'auto';
        folderRow.appendChild(cnt);
        folderRow.addEventListener('click', e => {
          if (e.target === arrow || e.target === folderRow) {
            folderRow.classList.toggle('collapsed');
          } else {
            selectMap(id);
          }
        });
        if (S.selectedMapId === id) label.style.color = 'var(--a)';
      } else {
        folderRow.addEventListener('click', () => folderRow.classList.toggle('collapsed'));
      }
      parentEl.appendChild(folderRow);

      const childWrap = el('div', 'sb-children');
      for (const cid of kidsWithEvents) renderNode(cid, depth + 1, childWrap);
      parentEl.appendChild(childWrap);
    } else if (hasMap) {
      // Leaf map item
      const mapData = S.maps.get(id);
      const item = el('div', 'sb-item' + (S.selectedMapId === id ? ' active' : ''));
      item.style.paddingLeft = (depth * 12 + 12) + 'px';
      item.appendChild(el('span', '', '🗺'));
      item.appendChild(el('span', '', info.name));
      const cnt = el('span', 'sb-count', mapData.events.length);
      item.appendChild(cnt);
      item.addEventListener('click', () => selectMap(id));
      parentEl.appendChild(item);
    }
  }

  // Render root-level nodes (parentId=0)
  (children[0] || []).filter(c => hasEvents(c))
    .forEach(id => renderNode(id, 0, container));

  // Fallback: maps not in mapInfos tree
  for (const [mapId] of S.maps) {
    if (!S.mapInfos[mapId]) {
      const mapData = S.maps.get(mapId);
      const item = el('div', 'sb-item' + (S.selectedMapId === mapId ? ' active' : ''));
      item.appendChild(el('span', '', '🗺'));
      item.appendChild(el('span', '', mapData.mapName));
      item.appendChild(el('span', 'sb-count', mapData.events.length));
      item.addEventListener('click', () => selectMap(mapId));
      container.appendChild(item);
    }
  }
}

/* ── Map / event selection ───────────────────────────── */
function selectMap(mapId) {
  S.selectedMapId = mapId;
  S.selectedEvId  = null;
  S.selectedPage  = 0;
  S.currentPage   = null;
  if (EL.btnDownload) EL.btnDownload.classList.remove('visible');
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
  S.currentPage = cev;
  showDownloadBtn();

  const prefix = `cev_${evId}`;
  const { nodes, edges } = parseEventPage(cev.list, prefix);
  if (nodes.length === 0) { renderEmptyPageNotice(); } else { renderGraph(nodes, edges); }
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
    const empty = !ev.pages.some(page => page.list.some(cmd => VISIBLE_CODES.has(cmd.code)));
    const card = el('div', empty ? 'ev-card ev-empty' : 'ev-card');
    card.appendChild(el('div', 'ev-card-name', ev.name));
    card.appendChild(el('div', 'ev-card-meta', `ID: ${ev.id} · (${ev.x},${ev.y}) · ${ev.pages.length} page${ev.pages.length !== 1 ? 's' : ''}`));
    if (!empty) card.addEventListener('click', () => selectEvent(mapId, ev.id));
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
  showDownloadBtn();
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

  S.currentPage = ev.pages[pi];
  const prefix = `map${S.selectedMapId}_ev${S.selectedEvId}_p${pi}`;
  const { nodes, edges } = parseEventPage(ev.pages[pi].list, prefix);

  if (nodes.length === 0) {
    renderEmptyPageNotice();
  } else {
    renderGraph(nodes, edges);
  }
  clearDetail();
}

function renderEmptyPageNotice() {
  if (!cy) initCy();
  cy.elements().remove();
  // Show notice overlay in the cy container
  let notice = document.getElementById('empty-page-notice');
  if (!notice) {
    notice = el('div', 'empty-event-notice');
    notice.id = 'empty-page-notice';
    notice.style.cssText = 'position:absolute;inset:0;z-index:4;background:var(--bg);pointer-events:none';
    document.getElementById('cy').parentElement.appendChild(notice);
  }
  notice.innerHTML = '';
  notice.appendChild(el('div', 'empty-event-notice-icon', '🔲'));
  notice.appendChild(el('div', 'empty-event-notice-title', 'No displayable commands'));
  notice.appendChild(el('div', 'empty-event-notice-sub', 'This page has no dialogue, choices, conditions, labels or jumps to visualize.'));
  notice.style.display = 'flex';
  notice.style.flexDirection = 'column';
  notice.style.alignItems = 'center';
  notice.style.justifyContent = 'center';
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

  // Load MapInfos.json for map names + tree structure
  const infoFile = findFile(fileMap, dataPrefix, 'MapInfos.json');
  if (infoFile) {
    try {
      const json = JSON.parse(await infoFile.text());
      json.forEach((info, i) => {
        if (info) S.mapInfos[i] = { name: info.name, parentId: info.parentId ?? 0, order: info.order ?? i, expanded: info.expanded !== false };
      });
    } catch {}
  }

  // Load Actors.json for \N[n] resolution
  const actorsFile = findFile(fileMap, dataPrefix, 'Actors.json');
  if (actorsFile) {
    try {
      const json = JSON.parse(await actorsFile.text());
      S.actors = json.map(a => (a && a.name) || '');
    } catch {}
  }

  // Load System.json for variable/switch names
  const systemFile = findFile(fileMap, dataPrefix, 'System.json');
  if (systemFile) {
    try {
      const json = JSON.parse(await systemFile.text());
      S.variables = json.variables || [];
      S.switches  = json.switches  || [];
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
        S.mapJsons.set(mapId, json);
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

/* ── Download ────────────────────────────────────────── */
function showDownloadBtn() {
  if (EL.btnDownload) EL.btnDownload.classList.add('visible');
}

function downloadCurrentMap() {
  if (S.selectedMapId === 'common') {
    // Rebuild CommonEvents from S.commonEvents
    const arr = [null];
    for (const cev of S.commonEvents) arr[cev.id] = { id: cev.id, name: cev.name, list: cev.list };
    const blob = new Blob([JSON.stringify(arr)], { type: 'application/json' });
    triggerDownload(blob, 'CommonEvents.json');
    return;
  }
  const json = S.mapJsons.get(S.selectedMapId);
  if (!json) return;
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
  triggerDownload(blob, `Map${String(S.selectedMapId).padStart(3,'0')}.json`);
}

function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
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

  // Download
  EL.btnDownload.addEventListener('click', downloadCurrentMap);

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
