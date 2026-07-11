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
      const folderRow = el('div', 'sb-folder');
      folderRow.style.paddingLeft = (depth * 12 + 12) + 'px';
      if (S.collapsedFolders.has(id)) folderRow.classList.add('collapsed');
      const arrow = el('span', 'sb-folder-arrow', '▾');
      const label = el('span', 'sb-folder-label', info.name);
      folderRow.appendChild(arrow);
      folderRow.appendChild(label);

      const toggleCollapse = () => {
        if (S.collapsedFolders.has(id)) S.collapsedFolders.delete(id);
        else S.collapsedFolders.add(id);
        folderRow.classList.toggle('collapsed');
      };

      if (hasMap) {
        const cnt = el('span', 'sb-count', S.maps.get(id).events.length);
        cnt.style.marginLeft = 'auto';
        folderRow.appendChild(cnt);
        folderRow.addEventListener('click', e => {
          if (e.target === arrow || e.target === folderRow) toggleCollapse();
          else selectMap(id);
        });
        if (S.selectedMapId === id) label.style.color = 'var(--a)';
      } else {
        folderRow.addEventListener('click', toggleCollapse);
      }
      parentEl.appendChild(folderRow);

      const childWrap = el('div', 'sb-children');
      for (const cid of kidsWithEvents) renderNode(cid, depth + 1, childWrap);
      parentEl.appendChild(childWrap);
    } else if (hasMap) {
      const mapData = S.maps.get(id);
      const item = el('div', 'sb-item' + (S.selectedMapId === id ? ' active' : ''));
      item.style.paddingLeft = (depth * 12 + 12) + 'px';
      item.appendChild(el('span', '', '🗺'));
      item.appendChild(el('span', '', info.name));
      item.appendChild(el('span', 'sb-count', mapData.events.length));
      item.addEventListener('click', () => selectMap(id));
      parentEl.appendChild(item);
    }
  }

  (children[0] || []).filter(c => hasEvents(c))
    .forEach(id => renderNode(id, 0, container));

  // Fallback: maps not referenced in mapInfos tree
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
