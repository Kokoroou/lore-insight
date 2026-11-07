/* ── DOM refs ────────────────────────────────────────── */
const EL = {};
document.addEventListener('DOMContentLoaded', () => {
  [
    'setup','sidebar','sb-list',
    'scan-status','setup-status','event-breadcrumb','page-tabs',
    'event-picker','event-list-grid','detail-panel','detail-body',
    'open-btn','about-btn','about-modal','about-close','theme-toggle',
    'detail-toggle','sidebar-toggle','cy-fit','cy-zoom-in','cy-zoom-out','scene-play',
  ].forEach(id => { EL[id.replace(/-([a-z])/g, (_,c)=>c.toUpperCase())] = document.getElementById(id); });
  EL.graphView = document.getElementById('graph-view');
  EL.sbResizer = document.getElementById('sb-resizer');

  init();
});

/* ── View switching ──────────────────────────────────── */
function showSetup() {
  EL.setup.style.display = 'flex';
  EL.graphView.classList.remove('visible');
  EL.detailPanel.hidden = true;
}

function showGraphView() {
  EL.setup.style.display = 'none';
  EL.graphView.classList.add('visible');
  EL.detailPanel.hidden = false;
  if (!cy) initCy();
}

/* ── Map / event selection ───────────────────────────── */
async function selectMap(mapId) {
  S.selectedMapId = mapId;
  S.selectedEvId  = null;
  S.selectedPage  = 0;
  S.currentPage   = null;
  setSceneEntry(null);
  renderSidebar();
  showGraphView();
  if (!S.maps.has(mapId) && S.mapFiles.has(mapId)) {
    // Not read yet: read it now, ahead of the background (loader.js).
    showPickerMessage(mapId, 'Reading map…');
    await openMap(mapId);
    if (S.selectedMapId !== mapId || S.selectedEvId !== null) return;   // the user moved on
  }
  showEventPicker(mapId);
}

function showPickerMessage(mapId, text) {
  buildBreadcrumb(mapId);
  EL.pageTabs.innerHTML = '';
  EL.eventPicker.classList.remove('hidden');
  EL.eventListGrid.innerHTML = '';
  EL.eventListGrid.appendChild(el('div', 'detail-empty', text));
}

function selectCommonEvent(evId) {
  S.selectedMapId = 'common';
  S.selectedEvId  = evId;
  S.selectedPage  = 0;
  renderSidebar();
  showGraphView();

  const cev = S.commonEvents.find(e => e.id === evId);
  if (!cev) return;

  EL.eventBreadcrumb.textContent = 'Common Events › ';
  EL.eventBreadcrumb.appendChild(el('span', '', cev.name));
  EL.pageTabs.innerHTML = '';
  EL.eventPicker.classList.add('hidden');
  S.currentPage = cev;
  setSceneEntry({ title: cev.name, sub: `Common event ${cev.id}`, list: cev.list });

  const { nodes, edges } = parseEventPage(cev.list, `cev_${evId}`);
  if (nodes.length === 0) { renderEmptyPageNotice(); } else { renderGraph(nodes, edges); }
  clearDetail();
}

function showEventPicker(mapId) {
  const mapData = S.maps.get(mapId);
  if (!mapData) { showPickerMessage(mapId, 'This map has no events.'); return; }

  buildBreadcrumb(mapId);
  EL.pageTabs.innerHTML = '';
  EL.eventPicker.classList.remove('hidden');

  const grid = EL.eventListGrid;
  grid.innerHTML = '';

  // Events with a scene (pictures + dialogue, scenes.js) first; the rest keeps map order.
  const events = mapData.events.map(ev => ({ ev, scene: ev.pages.findIndex(page => isSceneList(page.list)) }))
    .sort((a, b) => (b.scene >= 0) - (a.scene >= 0));
  for (const { ev, scene } of events) {
    const empty = !ev.pages.some(page => page.list.some(cmd => VISIBLE_CODES.has(cmd.code)));
    const card = el('button', 'ev-card' + (empty ? ' ev-empty' : '') + (scene >= 0 ? ' ev-scene' : ''));
    card.type = 'button';
    card.appendChild(el('div', 'ev-card-name', ev.name));
    card.appendChild(el('div', 'ev-card-meta', `ID: ${ev.id} · (${ev.x},${ev.y}) · ${ev.pages.length} page${ev.pages.length !== 1 ? 's' : ''}`));
    if (scene >= 0) {
      const badge = el('div', 'ev-card-scene');
      badge.appendChild(icon('play', 11));
      badge.appendChild(document.createTextNode(`Scene · ${sceneStats(ev.pages[scene].list).pictures} pictures`));
      card.appendChild(badge);
    }
    card.addEventListener('click', () => selectEvent(mapId, ev.id, Math.max(0, scene)));
    grid.appendChild(card);
  }
}

function selectEvent(mapId, evId, page = 0) {
  S.selectedMapId = mapId;
  S.selectedEvId  = evId;
  S.selectedPage  = page;

  const mapData = S.maps.get(mapId);
  const ev = mapData?.events.find(e => e.id === evId);
  if (!ev) return;

  buildBreadcrumb(mapId, ev.name);
  EL.eventPicker.classList.add('hidden');
  renderSidebar();

  EL.pageTabs.innerHTML = '';
  ev.pages.forEach((_, pi) => {
    const tab = el('button', 'page-tab' + (pi === page ? ' active' : ''), `Page ${pi + 1}`);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', pi === page ? 'true' : 'false');
    tab.addEventListener('click', () => selectPage(pi));
    EL.pageTabs.appendChild(tab);
  });

  selectPage(ev.pages[page] ? page : 0);
}

function selectPage(pi) {
  S.selectedPage = pi;
  const tabs = EL.pageTabs.querySelectorAll('.page-tab');
  tabs.forEach((t, i) => {
    t.classList.toggle('active', i === pi);
    t.setAttribute('aria-selected', i === pi ? 'true' : 'false');
  });

  const mapData = S.maps.get(S.selectedMapId);
  const ev = mapData?.events.find(e => e.id === S.selectedEvId);
  if (!ev || !ev.pages[pi]) return;

  S.currentPage = ev.pages[pi];
  setSceneEntry({ title: ev.name, sub: `${mapData.mapName} · event ${ev.id}, page ${pi + 1}`, list: ev.pages[pi].list });
  const prefix = `map${S.selectedMapId}_ev${S.selectedEvId}_p${pi}`;
  const { nodes, edges } = parseEventPage(ev.pages[pi].list, prefix);

  if (nodes.length === 0) { renderEmptyPageNotice(); } else { renderGraph(nodes, edges); }
  clearDetail();
}

/* ── Scene preview (player.js) ───────────────────────── */
// The toolbar's Preview button plays the page / common event on screen, when it shows
// at least a picture or a message.
function setSceneEntry(entry) {
  const s = entry && sceneStats(entry.list);
  S.sceneEntry = s && (s.pictures || s.messages) ? entry : null;
  if (EL.scenePlay) EL.scenePlay.hidden = !S.sceneEntry;
}

// A scene from the sidebar: show it in the graph, then play it.
function playScene(sc) {
  if (sc.kind === 'common') selectCommonEvent(sc.evId);
  else selectEvent(sc.mapId, sc.evId, sc.page);
  if (S.sceneEntry) openScene(S.sceneEntry);
}

function renderEmptyPageNotice() {
  if (!cy) initCy();
  cancelRender();
  cy.elements().remove();
  document.getElementById('empty-page-notice').hidden = false;
}

/* ── UI init ─────────────────────────────────────────── */
function init() {
  // Theme: same behaviour as MakerLens Assets. The default follows the OS
  // (prefers-color-scheme); the toggle flips to the other theme, and picking the
  // one the OS already uses clears the override again. Stored under this tool's
  // own key (the family shares one origin, so keys stay distinct per tool).
  const syncThemeLabel = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    EL.themeToggle.title = `Switch to ${next} theme`;
    EL.themeToggle.setAttribute('aria-label', `Switch to ${next} theme`);
  };
  EL.themeToggle.addEventListener('click', () => {
    const html = document.documentElement;
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    try {
      if (next === systemTheme()) { delete html.dataset.theme; localStorage.removeItem('mle-theme'); }
      else                        { html.dataset.theme = next; localStorage.setItem('mle-theme', next); }
    } catch (e) { html.dataset.theme = next; }
    syncThemeLabel();
    if (cy) cy.style(cyStyle());
  });
  DARK_MQ.addEventListener?.('change', () => {
    syncThemeLabel();
    if (cy) cy.style(cyStyle());
  });
  syncThemeLabel();

  EL.openBtn.addEventListener('click', () => {
    if (window.showDirectoryPicker) openWithFSAPI();
    else document.getElementById('folder-input').click();
  });

  document.getElementById('drop-zone').addEventListener('click', () => EL.openBtn.click());

  document.getElementById('folder-input').addEventListener('change', e => {
    if (e.target.files.length) loadFolder([...e.target.files]);
  });

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
      openFolder(entry.webkitGetAsEntry(), FS_ENTRY);
    } else if (e.dataTransfer.files.length) {
      loadFolder([...e.dataTransfer.files]);
    }
  });

  EL.sidebarToggle.addEventListener('click', () => {
    const hidden = EL.sidebar.classList.toggle('hidden');
    EL.sbResizer.classList.toggle('hidden', hidden);
    EL.sidebarToggle.setAttribute('aria-pressed', hidden ? 'false' : 'true');
  });

  EL.detailToggle.addEventListener('click', () => {
    S.detailOpen = !S.detailOpen;
    EL.detailPanel.classList.toggle('hidden', !S.detailOpen);
    EL.detailToggle.classList.toggle('active', S.detailOpen);
  });

  EL.scenePlay.addEventListener('click', () => { if (S.sceneEntry) openScene(S.sceneEntry); });

  EL.cyFit.addEventListener('click', () => cy?.fit(undefined, 32));
  EL.cyZoomIn.addEventListener('click',  () => cy?.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }));
  EL.cyZoomOut.addEventListener('click', () => cy?.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width()/2, y: cy.height()/2 } }));

  EL.aboutBtn.addEventListener('click', () => EL.aboutModal.classList.add('open'));
  EL.aboutClose.addEventListener('click', () => EL.aboutModal.classList.remove('open'));
  EL.aboutModal.addEventListener('click', e => { if (e.target === EL.aboutModal) EL.aboutModal.classList.remove('open'); });

  let sbDrag = false, sbStart = 0, swStart = 0;
  EL.sbResizer.addEventListener('mousedown', e => {
    sbDrag = true; sbStart = e.clientX; swStart = EL.sidebar.offsetWidth;
    EL.sbResizer.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!sbDrag) return;
    document.documentElement.style.setProperty('--sw', Math.max(140, Math.min(400, swStart + e.clientX - sbStart)) + 'px');
  });
  window.addEventListener('mouseup', () => {
    if (sbDrag) EL.sbResizer.classList.remove('dragging');
    sbDrag = false;
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') EL.aboutModal.classList.remove('open');
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) { e.preventDefault(); redo(); }
  });

  EL.detailPanel.classList.add('hidden');
  EL.detailToggle.classList.remove('active');
  clearDetail();
}
