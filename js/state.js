/* ── Global state ─────────────────────────────────────── */
const S = {
  maps:             new Map(),  // mapId → { mapId, mapName, events }
  commonEvents:     [],
  mapInfos:         {},         // mapId → {name, parentId, order, expanded}
  selectedMapId:    null,
  selectedEvId:     null,
  selectedPage:     0,
  detailOpen:       false,
  actors:           [],         // index → actor name
  variables:        [],         // index → variable name
  switches:         [],         // index → switch name
  currentNodes:     [],
  currentPage:      null,       // current page object {list} (read-only)
  collapsedFolders: new Set(),  // mapIds the user has manually collapsed
  history:          [],         // undo stack: {type, ...}
  future:           [],         // redo stack
};
