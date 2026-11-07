import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const ev = (id, name) => ({ id, name });
function setup() {
  const run = load(['highlights.js']);
  run(`var S = {
    mapInfos: { 1: { name: 'Town' }, 2: { name: 'Memory Room' } },
    mapFiles: new Map([[2, {}]]),
    maps: new Map([[1, { mapId: 1, mapName: 'Town', events: [
      { id: 1, name: 'Guard' }, { id: 2, name: 'Crystal Shard 03' }, { id: 3, name: '回想ルーム' }] }]]),
    commonEvents: [{ id: 5, name: 'Gallery Open' }, { id: 6, name: 'Heal' }]
  }`);
  return run;
}

test('isHighlightName matches gallery/memory words in several languages', () => {
  const run = setup();
  for (const n of ['Gallery', 'Memory Crystal', 'mảnh pha lê', 'Ký ức', '回想', 'ギャラリー'])
    assert.equal(run(`isHighlightName(${JSON.stringify(n)})`), true, n);
  for (const n of ['Guard', 'Heal', 'Cgi', ''])
    assert.equal(run(`isHighlightName(${JSON.stringify(n)})`), false, n);
});

test('findHighlights collects maps (even unread), events and common events', () => {
  const h = JSON.parse(JSON.stringify(setup()('findHighlights()')));
  assert.deepEqual(h.maps.map(m => m.mapId), [2]);
  assert.deepEqual(h.events.map(e => e.evId), [2, 3]);
  assert.deepEqual(h.commons.map(c => c.evId), [5]);
  assert.equal(h.total, 4);
});
