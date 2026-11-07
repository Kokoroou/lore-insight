/* ── Search: scenes and events by name (sidebar search box) ──
   No DOM (tested in node). Case and accents are ignored, every word of the query must
   appear in the name or where it lives (map name, "Common"), in any order: "guard town"
   finds "Town guard" on any map and every event on a map called "Town" named guard.
   Only maps read so far are searched; the sidebar re-renders as the background reading
   goes on, so results grow while a game loads. */
const SEARCH_SHOWN = 50;   // results listed per section before "Show all"

// Lower case, without accents (é → e), spaces collapsed.
function searchNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function searchWords(query) {
  const q = searchNorm(query);
  return q ? q.split(' ') : [];
}

const searchHit = (words, ...fields) => {
  const hay = searchNorm(fields.join(' '));
  return words.every(w => hay.includes(w));
};

// { scenes, events } matching the query: scenes in findScenes() order, then common
// events and map events (map id order, then event order). Empty query: nothing.
function searchAll(query) {
  const words = searchWords(query);
  if (!words.length) return { scenes: [], events: [] };
  const scenes = findScenes().filter(sc => searchHit(words, sc.name, sc.where));
  const events = [];
  for (const cev of S.commonEvents) {
    if (searchHit(words, cev.name, 'Common')) {
      events.push({ kind: 'common', evId: cev.id, name: cev.name || `Common event ${cev.id}`, where: 'Common' });
    }
  }
  for (const mapId of [...S.maps.keys()].sort((a, b) => a - b)) {
    const data = S.maps.get(mapId);
    for (const ev of data.events) {
      if (searchHit(words, ev.name, data.mapName)) {
        events.push({ kind: 'map', mapId, evId: ev.id, name: ev.name, where: data.mapName });
      }
    }
  }
  return { scenes, events };
}
