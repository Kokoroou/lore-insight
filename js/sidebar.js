/* ── Sidebar rendering ───────────────────────────────── */
function renderSidebar() {
  const listEl = EL.sbList;
  const top = listEl.scrollTop;   // re-rendered while maps load: keep the scroll position
  listEl.innerHTML = '';
  renderSidebarItems(listEl);
  listEl.scrollTop = top;
}

// Event count of a map, or a placeholder while its Map###.json is not read yet.
function mapCountEl(id) {
  const data = S.maps.get(id);
  if (data) return el('span', 'sb-count', data.events.length);
  const c = el('span', 'sb-count pending', '…');
  c.title = 'Reading…';
  return c;
}

function renderSidebarItems(listEl) {
  const hasMaps = S.maps.size > 0 || S.mapFiles.size > 0;
  if (!hasMaps && S.commonEvents.length === 0) {
    listEl.appendChild(el('div', 'detail-empty', 'No data loaded'));
    return;
  }

  if (hasMaps) {
    listEl.appendChild(el('div', 'sb-section', 'Maps'));
    renderMapTree(listEl);
  }

  if (S.commonEvents.length > 0) {
    listEl.appendChild(el('div', 'sb-section', 'Common Events'));
    for (const cev of S.commonEvents) {
      const item = el('div', 'sb-item' + (S.selectedMapId === 'common' && S.selectedEvId === cev.id ? ' active' : ''));
      item.appendChild(iconEl('zap'));
      item.appendChild(el('span', 'sb-name', cev.name));
      item.addEventListener('click', () => selectCommonEvent(cev.id));
      listEl.appendChild(item);
    }
  }
}

function renderMapTree(container) {
  const children = {};
  for (const [id, info] of Object.entries(S.mapInfos)) {
    const pid = info.parentId ?? 0;
    (children[pid] = children[pid] || []).push(parseInt(id));
  }
  for (const pid in children) {
    children[pid].sort((a, b) => (S.mapInfos[a]?.order ?? 0) - (S.mapInfos[b]?.order ?? 0));
  }

  // A map not read yet counts: it leaves the tree once read if it has no events.
  const isMap = id => S.maps.has(id) || S.mapFiles.has(id);
  function hasEvents(id) {
    if (isMap(id)) return true;
    return (children[id] || []).some(c => hasEvents(c));
  }

  function renderNode(id, depth, parentEl) {
    if (!hasEvents(id)) return;
    const info = S.mapInfos[id];
    if (!info) return;

    const hasMap = isMap(id);
    const kidsWithEvents = (children[id] || []).filter(c => hasEvents(c));

    if (kidsWithEvents.length > 0) {
      const folderRow = el('div', 'sb-folder');
      folderRow.style.paddingLeft = (depth * 12 + 8) + 'px';
      if (S.collapsedFolders.has(id)) folderRow.classList.add('collapsed');
      const arrow = iconEl('down', 'sb-folder-arrow');
      const label = el('span', 'sb-folder-label', info.name);
      folderRow.appendChild(arrow);
      folderRow.appendChild(label);

      const toggleCollapse = () => {
        if (S.collapsedFolders.has(id)) S.collapsedFolders.delete(id);
        else S.collapsedFolders.add(id);
        folderRow.classList.toggle('collapsed');
      };

      if (hasMap) {
        folderRow.dataset.mapId = id;
        folderRow.appendChild(mapCountEl(id));
        folderRow.addEventListener('click', e => {
          if (arrow.contains(e.target) || e.target === folderRow) toggleCollapse();
          else selectMap(id);
        });
        if (S.selectedMapId === id) folderRow.classList.add('active');
      } else {
        folderRow.addEventListener('click', toggleCollapse);
      }
      parentEl.appendChild(folderRow);

      const childWrap = el('div', 'sb-children');
      for (const cid of kidsWithEvents) renderNode(cid, depth + 1, childWrap);
      parentEl.appendChild(childWrap);
    } else if (hasMap) {
      const item = el('div', 'sb-item' + (S.selectedMapId === id ? ' active' : ''));
      item.dataset.mapId = id;
      item.style.paddingLeft = (depth * 12 + 8) + 'px';
      item.appendChild(iconEl('map'));
      item.appendChild(el('span', 'sb-name', info.name));
      item.appendChild(mapCountEl(id));
      item.addEventListener('click', () => selectMap(id));
      parentEl.appendChild(item);
    }
  }

  (children[0] || []).filter(c => hasEvents(c))
    .forEach(id => renderNode(id, 0, container));

  // Fallback: maps not referenced in mapInfos tree
  const loose = [...new Set([...S.maps.keys(), ...S.mapFiles.keys()])].sort((a, b) => a - b);
  for (const mapId of loose) {
    if (!S.mapInfos[mapId]) {
      const item = el('div', 'sb-item' + (S.selectedMapId === mapId ? ' active' : ''));
      item.dataset.mapId = mapId;
      item.appendChild(iconEl('map'));
      item.appendChild(el('span', 'sb-name', S.maps.get(mapId)?.mapName || `Map${String(mapId).padStart(3, '0')}`));
      item.appendChild(mapCountEl(mapId));
      item.addEventListener('click', () => selectMap(mapId));
      container.appendChild(item);
    }
  }
}

/* ── Breadcrumb helpers ──────────────────────────────── */
function getMapPath(mapId) {
  const segs = [];
  let id = parseInt(mapId);
  const seen = new Set();
  while (id && !seen.has(id)) {
    seen.add(id);
    const info = S.mapInfos[id];
    if (!info) break;
    segs.unshift({ id, name: info.name });
    id = info.parentId || 0;
  }
  return segs;
}

function buildBreadcrumb(mapId, lastLabel) {
  const segs = getMapPath(mapId);
  EL.eventBreadcrumb.innerHTML = '';
  segs.forEach(seg => {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'bc-seg';
    a.textContent = seg.name;
    a.addEventListener('click', e => { e.preventDefault(); selectMap(seg.id); });
    EL.eventBreadcrumb.appendChild(a);
    EL.eventBreadcrumb.appendChild(document.createTextNode(' › '));
  });
  if (lastLabel) {
    const span = document.createElement('span');
    span.textContent = lastLabel;
    EL.eventBreadcrumb.appendChild(span);
  }
}
