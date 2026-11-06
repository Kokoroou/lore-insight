import assert from 'node:assert/strict';
import { test } from 'node:test';
import { c, load, plain } from './helpers.mjs';

// A fake File: what loadFolder() reads from <input webkitdirectory> or the folder picker.
const file = (path, json) => ({
  name: path.split('/').pop(),
  webkitRelativePath: path,
  text: async () => (typeof json === 'string' ? json : JSON.stringify(json)),
});

function setup() {
  const calls = { status: [], sidebar: 0 };
  const cls = () => ({ remove() {}, add() {} });
  const get = load(['constants.js', 'parser.js', 'state.js', 'loader.js'], {
    EL: { scanStatus: {}, sidebar: { classList: cls() }, sbResizer: { classList: cls() } },
    setTimeout: () => {},
  });
  // UI functions from other files, replaced with recorders.
  get('globalThis').__calls = calls;
  get('setStatus = (k, h) => __calls.status.push([k, h]); renderSidebar = () => __calls.sidebar++; selectMap = () => {};');
  return { get, calls };
}

const game = root => [
  file(`${root}data/MapInfos.json`, [null, { name: 'Town', parentId: 0, order: 1, expanded: false }, { name: 'Inn', parentId: 1, order: 2 }]),
  file(`${root}data/Actors.json`, [null, { name: 'Harold' }]),
  file(`${root}data/System.json`, { switches: ['', 'Met King'], variables: ['', 'Gold'] }),
  file(`${root}data/CommonEvents.json`, [null, { id: 1, name: 'Heal', list: [c(0, 0)] }]),
  file(`${root}data/Map001.json`, { events: [null, { id: 1, name: 'Guard', x: 1, y: 2, pages: [{ list: [c(101, 0, ['']), c(401, 0, ['Halt']), c(0, 0)] }] }] }),
  file(`${root}data/Map002.json`, { events: [null, { id: 1, name: 'Keeper', x: 0, y: 0, pages: [{ list: [] }] }] }),
  file(`${root}data/Map003.json`, { events: [] }),          // no events: not listed
  file(`${root}data/Map004.json`, '{ broken json'),          // unreadable: skipped
  file(`${root}img/faces/Actor1.png`, ''),
];

test('loads a game folder: map tree, names, common events and maps with events', async () => {
  const { get, calls } = setup();
  await get('loadFolder')(game('MyGame/'));
  const S = get('S');
  assert.deepEqual(plain(S.mapInfos), {
    1: { name: 'Town', parentId: 0, order: 1, expanded: false },
    2: { name: 'Inn', parentId: 1, order: 2, expanded: true },
  });
  assert.deepEqual(plain([...S.collapsedFolders]), [1]);
  assert.deepEqual(plain(S.actors), ['', 'Harold']);
  assert.deepEqual(plain(S.switches), ['', 'Met King']);
  assert.deepEqual(plain(S.variables), ['', 'Gold']);
  assert.deepEqual(plain(S.commonEvents.map(e => e.name)), ['Heal']);
  assert.deepEqual(plain([...S.maps.keys()].sort()), [1, 2]);
  assert.equal(S.maps.get(1).mapName, 'Town');
  assert.equal(S.maps.get(1).events[0].pages[0].list.length, 3);
  assert.equal(calls.sidebar, 1);
  assert.equal(calls.status.at(-1)[0], 'ok');
  assert.match(calls.status.at(-1)[1], /2 maps with 2 events and 1 common events/);
});

test('also works when only the data/ folder is selected, or with Windows separators', async () => {
  for (const files of [game(''), game('G\\').map(f => ({ ...f, webkitRelativePath: f.webkitRelativePath.replace(/\//g, '\\') }))]) {
    const { get } = setup();
    await get('loadFolder')(files);
    assert.equal(get('S.maps.size'), 2);
    assert.equal(get('S.mapInfos[1].name'), 'Town');
  }
});

test('a folder without RPG Maker data reports an error and loads nothing', async () => {
  const { get, calls } = setup();
  await get('loadFolder')([file('Photos/cat.png', '')]);
  assert.equal(calls.status.at(-1)[0], 'err');
  assert.match(calls.status.at(-1)[1], /No RPG Maker data folder/);
  assert.equal(calls.sidebar, 0);
});

test('maps without any event report an error', async () => {
  const { get, calls } = setup();
  await get('loadFolder')([file('G/data/Map001.json', { events: [null] })]);
  assert.match(calls.status.at(-1)[1], /No events found/);
  assert.equal(calls.sidebar, 0);
});

test('findFile matches names case-insensitively, under the data prefix or any folder', () => {
  const { get } = setup();
  const findFile = get('findFile');
  const m = new Map([['G/DATA/mapinfos.JSON', 'a'], ['other/System.json', 'b']]);
  assert.equal(findFile(m, 'G/data/', 'MapInfos.json'), 'a');
  assert.equal(findFile(m, 'G/data/', 'System.json'), 'b');
  assert.equal(findFile(m, 'G/data/', 'Actors.json'), null);
});
