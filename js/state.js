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
  mapJsons:         new Map(),  // mapId → original map JSON object
  currentNodes:     [],
  currentPage:      null,       // current page object {list}
  dirty:            false,
  collapsedFolders: new Set(),  // mapIds the user has manually collapsed
  history:          [],         // undo stack: {type, ...}
  future:           [],         // redo stack
};
