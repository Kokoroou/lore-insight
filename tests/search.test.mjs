import { test } from 'node:test';
import assert from 'node:assert/strict';
import { c, load, plain } from './helpers.mjs';

// A scene: 2 Show Picture + 3 messages (scenes.js).
const pic = id => c(231, 0, [id, 'cg', 0, 0, 0, 0, 100, 100, 255, 0]);
const say = text => [c(101, 0, ['', 0, 0, 2]), c(401, 0, [text])];
const sceneList = [pic(1), pic(2), ...say('a'), ...say('b'), ...say('c'), c(0, 0)];
const plainList = [...say('hi'), c(0, 0)];

function setup() {
  const run = load(['constants.js', 'scenes.js', 'search.js']);
  run('globalThis').__data = {
    commonEvents: [{ id: 1, name: 'Bath Scène', list: sceneList }, { id: 2, name: 'Shop menu', list: plainList }],
    maps: [
      [2, { mapId: 2, mapName: 'Forest', events: [{ id: 1, name: 'Guard', pages: [{ list: plainList }] }] }],
      [1, { mapId: 1, mapName: 'Town', events: [
        { id: 3, name: 'Town guard', pages: [{ list: plainList }, { list: sceneList }] },
        { id: 4, name: 'Baker', pages: [{ list: plainList }] },
      ] }],
    ],
  };
  run(`var S = { commonEvents: __data.commonEvents, maps: new Map(__data.maps) }`);
  return q => plain(run('searchAll')(q));
}

const names = r => ({ scenes: r.scenes.map(s => s.name), events: r.events.map(e => `${e.name} @ ${e.where}`) });

test('empty query finds nothing', () => {
  const search = setup();
  assert.deepEqual(search(''), { scenes: [], events: [] });
  assert.deepEqual(search('   '), { scenes: [], events: [] });
});

test('case and accents are ignored', () => {
  const search = setup();
  assert.deepEqual(names(search('bath scene')), { scenes: ['Bath Scène'], events: ['Bath Scène @ Common'] });
  assert.deepEqual(names(search('SCÈNE')).scenes, ['Bath Scène']);
});

test('every word must match, in any order, in the name or the map name', () => {
  const search = setup();
  assert.deepEqual(names(search('guard')).events, ['Town guard @ Town', 'Guard @ Forest']);
  assert.deepEqual(names(search('guard forest')).events, ['Guard @ Forest']);
  assert.deepEqual(names(search('town guard')).events, ['Town guard @ Town']);
  assert.deepEqual(names(search('town')).events, ['Town guard @ Town', 'Baker @ Town']);
  assert.deepEqual(names(search('guard castle')), { scenes: [], events: [] });
});

test('scenes of map events carry their page; events keep where to open them', () => {
  const search = setup();
  const r = search('town guard');
  assert.equal(r.scenes.length, 1);
  assert.deepEqual([r.scenes[0].kind, r.scenes[0].mapId, r.scenes[0].evId, r.scenes[0].page], ['map', 1, 3, 1]);
  assert.deepEqual(r.events[0], { kind: 'map', mapId: 1, evId: 3, name: 'Town guard', where: 'Town' });
  assert.deepEqual(search('shop').events, [{ kind: 'common', evId: 2, name: 'Shop menu', where: 'Common' }]);
});
