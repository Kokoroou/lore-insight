/* ── Scenes: command lists that show pictures with dialogue ──
   Found by CONTENT, not by name: a common event or an event page with at least
   SCENE_MIN_PICTURES "Show Picture" (231) and SCENE_MIN_MESSAGES messages (101 / 105)
   is a scene the player (player.js) can preview. Listed in the sidebar's "Scenes"
   section and first in the event picker. Wrappers that only call a common event
   are not scenes themselves: the common event is. */
const SCENE_MIN_PICTURES = 2;
const SCENE_MIN_MESSAGES = 3;

function sceneStats(list) {
  let pictures = 0, messages = 0, sounds = 0;
  for (const cmd of list || []) {
    if (cmd.code === 231) pictures++;
    else if (cmd.code === 101 || cmd.code === 105) messages++;
    else if (cmd.code === 241 || cmd.code === 245 || cmd.code === 249 || cmd.code === 250) sounds++;
  }
  return { pictures, messages, sounds };
}

function isSceneList(list) {
  const s = sceneStats(list);
  return s.pictures >= SCENE_MIN_PICTURES && s.messages >= SCENE_MIN_MESSAGES;
}

// Common events first (where most games keep their scenes), then event pages of the
// maps read so far, by map id. Each entry carries what openScene() needs.
function findScenes() {
  const out = [];
  for (const cev of S.commonEvents) {
    if (!isSceneList(cev.list)) continue;
    out.push({ kind: 'common', evId: cev.id, page: 0, name: cev.name, where: 'Common', stats: sceneStats(cev.list), list: cev.list });
  }
  for (const mapId of [...S.maps.keys()].sort((a, b) => a - b)) {
    const data = S.maps.get(mapId);
    for (const ev of data.events) {
      ev.pages.forEach((page, pi) => {
        if (!isSceneList(page.list)) return;
        const name = ev.pages.length > 1 ? `${ev.name} · p${pi + 1}` : ev.name;
        out.push({ kind: 'map', mapId, evId: ev.id, page: pi, name, where: data.mapName, stats: sceneStats(page.list), list: page.list });
      });
    }
  }
  return out;
}
