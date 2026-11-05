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
  EL.graphView = document.getElementById('graph-view');
  EL.sbResizer = document.getElementById('sb-resizer');

  init();
});

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

/* ── Map / event selection ───────────────────────────── */
function selectMap(mapId) {
  S.selectedMapId = mapId;
  S.selectedEvId  = null;
  S.selectedPage  = 0;
  S.currentPage   = null;
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

  const { nodes, edges } = parseEventPage(cev.list, `cev_${evId}`);
  if (nodes.length === 0) { renderEmptyPageNotice(); } else { renderGraph(nodes, edges); }
  clearDetail();
}

function showEventPicker(mapId) {
  const mapData = S.maps.get(mapId);
  if (!mapData) return;

  buildBreadcrumb(mapId);
  EL.pageTabs.innerHTML = '';
  EL.eventPicker.classList.remove('hidden');

  const grid = EL.eventListGrid;
  grid.innerHTML = '';

  for (const ev of mapData.events) {
    const empty = !ev.pages.some(page => page.list.some(cmd => VISIBLE_CODES.has(cmd.code)));
    const card = el('div', empty ? 'ev-card ev-empty' : 'ev-card');
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

  buildBreadcrumb(mapId, ev.name);
  EL.eventPicker.classList.add('hidden');
  renderSidebar();

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

  if (nodes.length === 0) { renderEmptyPageNotice(); } else { renderGraph(nodes, edges); }
  clearDetail();
}

function renderEmptyPageNotice() {
  if (!cy) initCy();
  cy.elements().remove();
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

/* ── UI init ─────────────────────────────────────────── */
function init() {
  const saved = localStorage.getItem('mle-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');

  EL.themeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('mle-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('mle-theme', 'light');
    }
    if (cy) cy.style(cyStyle());
  });

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
      readDirectoryEntry(entry.webkitGetAsEntry()).then(files => loadFolder(files));
    } else if (e.dataTransfer.files.length) {
      loadFolder([...e.dataTransfer.files]);
    }
  });

  EL.sidebarToggle.addEventListener('click', () => {
    EL.sidebar.classList.toggle('hidden');
    EL.sbResizer.classList.toggle('hidden');
  });

  EL.detailToggle.addEventListener('click', () => {
    S.detailOpen = !S.detailOpen;
    EL.detailPanel.classList.toggle('hidden', !S.detailOpen);
    EL.detailToggle.classList.toggle('active', S.detailOpen);
  });

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
