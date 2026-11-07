/* ── Highlights: gallery / recollection / memory-crystal entries ──
   Games keep replayable scenes (CG gallery, recollection room, memory shards) in a
   special map or common events. These are found by NAME only (map, event and common
   event names) and listed at the top of the sidebar and of the event picker. */
const HIGHLIGHT_RE = new RegExp([
  // English
  '\\b(gallery|galleries|recollection|recollect|reminiscence|memory|memories|memento|mementos|' +
  'crystal|crystals|shard|shards|fragment|fragments|replay|album|flashback|cg\\s*room|' +
  'scene\\s*(select|replay|room|list)|event\\s*(replay|viewer|list))\\b',
  // Vietnamese
  'ký ức|kí ức|pha lê|mảnh|hồi tưởng|thư viện|xem lại',
  // Japanese / Chinese
  '回想|回憶|回忆|鑑賞|鉴赏|ギャラリー|思い出|思い出|想い出|記憶|记忆|水晶|クリスタル|アルバム|相册|画廊|畫廊'
].join('|'), 'i');

function isHighlightName(name) {
  return typeof name === 'string' && HIGHLIGHT_RE.test(name);
}

// Matching maps (by map name, known as soon as MapInfos is read), events of the maps
// read so far, and common events. Newest reads show up as the background load goes on.
function findHighlights() {
  const maps = [], events = [], commons = [];
  const mapIds = new Set([...S.maps.keys(), ...S.mapFiles.keys()]);
  for (const id of mapIds) {
    const name = S.mapInfos[id] ? S.mapInfos[id].name : (S.maps.get(id) || {}).mapName;
    if (isHighlightName(name)) maps.push({ mapId: id, name });
  }
  maps.sort((a, b) => a.mapId - b.mapId);
  for (const [mapId, data] of S.maps) {
    for (const ev of data.events) {
      if (isHighlightName(ev.name)) events.push({ mapId, evId: ev.id, name: ev.name, mapName: data.mapName });
    }
  }
  for (const cev of S.commonEvents) {
    if (isHighlightName(cev.name)) commons.push({ evId: cev.id, name: cev.name });
  }
  return { maps, events, commons, total: maps.length + events.length + commons.length };
}
