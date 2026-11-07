/* ── Global state ─────────────────────────────────────── */
const S = {
  maps:             new Map(),  // mapId → { mapId, mapName, events } (read, with events)
  mapFiles:         new Map(),  // mapId → Map###.json not read yet (loader.js)
  bgDone:           null,       // Promise: background map reading finished
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
  scenesExpanded:   false,      // sidebar lists every scene, not the first few
  sceneEntry:       null,       // what the toolbar's Preview button plays (player.js)
  history:          [],         // undo stack: {type, ...}
  future:           [],         // redo stack
};
