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
  const calls = { status: [], sidebar: 0, selected: [], hidden: false };
  const cls = () => ({ remove() { calls.hidden = false; }, add() { calls.hidden = true; } });
  const get = load(['constants.js', 'parser.js', 'state.js', 'loader.js'], {
    EL: { scanStatus: {}, sidebar: { classList: cls() }, sbResizer: { classList: cls() } },
    setTimeout, clearTimeout,
  });
  // UI functions from other files, replaced with recorders.
  get('globalThis').__calls = calls;
  get('setStatus = (k, h) => __calls.status.push([k, h]); renderSidebar = () => __calls.sidebar++; selectMap = id => __calls.selected.push(id);');
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
  await get('S.bgDone');
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
  assert.ok(calls.sidebar >= 1);
  assert.deepEqual(calls.selected, [1]);           // the first map with events opens by itself
  assert.equal(S.mapFiles.size, 0);                // every map was read in the background
  assert.equal(calls.status.at(-1)[0], 'ok');
  assert.match(calls.status.at(-1)[1], /2 maps with 2 events and 1 common events/);
});

test('also works when only the data/ folder is selected, or with Windows separators', async () => {
  for (const files of [game(''), game('G\\').map(f => ({ ...f, webkitRelativePath: f.webkitRelativePath.replace(/\//g, '\\') }))]) {
    const { get } = setup();
    await get('loadFolder')(files);
    await get('S.bgDone');
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
  await get('S.bgDone');
  assert.match(calls.status.at(-1)[1], /No events found/);
  assert.equal(calls.hidden, true);                // the sidebar shown early is hidden again
  assert.deepEqual(calls.selected, []);
});

test('findFile matches names case-insensitively, under the data prefix or any folder', () => {
  const { get } = setup();
  const findFile = get('findFile');
  const m = new Map([['G/DATA/mapinfos.JSON', 'a'], ['other/System.json', 'b']]);
  assert.equal(findFile(m, 'G/data/', 'MapInfos.json'), 'a');
  assert.equal(findFile(m, 'G/data/', 'System.json'), 'b');
  assert.equal(findFile(m, 'G/data/', 'Actors.json'), null);
});

test('the map tree shows before any Map###.json is read; maps are read lazily', async () => {
  const { get, calls } = setup();
  const reads = [];
  const files = game('G/').map(f => ({ ...f, text: async () => { reads.push(f.name); return f.text(); } }));
  await get('loadFolder')(files);
  assert.equal(calls.sidebar, 1);
  assert.equal(get('S.maps.size'), 0);                        // tree first, before any map is parsed
  assert.ok(reads.filter(n => /^Map\d/.test(n)).length <= 1);  // at most the background's first map started
  assert.deepEqual(plain([...get('S.mapFiles.keys()')]), [1, 2, 3, 4]);
  // Opening a map reads it at once, ahead of the background.
  const map = await get('openMap')(2);
  assert.equal(map.events[0].name, 'Keeper');
  await get('S.bgDone');
  assert.equal(reads.filter(n => n === 'Map002.json').length, 1);   // read once, not again by the background
  assert.equal(await get('ensureMap')(3), null);                     // no events
});

test('opening another folder stops the previous background reading', async () => {
  const { get } = setup();
  let release;
  const slow = new Promise(r => { release = r; });
  const first = game('A/').map(f => /Map00[2-4]/.test(f.name) ? { ...f, text: async () => { await slow; return f.text(); } } : f);
  await get('loadFolder')(first);
  const firstDone = get('S.bgDone');
  await get('loadFolder')([file('B/data/Map007.json', { events: [null, { id: 1, name: 'Other', pages: [] }] })]);
  release();
  await firstDone;
  await get('S.bgDone');
  assert.deepEqual(plain([...get('S.maps.keys()')]), [7]);
});

// A fake directory tree for the folder picker (FileSystemDirectoryHandle) adapter.
function dir(tree, log, path = '') {
  return {
    kind: 'directory',
    async *[Symbol.asyncIterator]() {
      log.push(path || '/');
      for (const [name, v] of Object.entries(tree)) {
        yield [name, typeof v === 'object' ? dir(v, log, path + name + '/') : { kind: 'file', getFile: async () => ({ text: async () => v }) }];
      }
    },
  };
}

test('findDataFiles finds www/data without walking img/ or audio/, and reads nothing', async () => {
  const listed = [];
  const root = dir({
    'Game.exe': '', img: { faces: { 'a.png': '' } }, audio: { bgm: { 'b.ogg': '' } },
    www: { img: {}, data: { 'Map001.json': '{"events":[]}', 'System.json': '{}', 'Tilesets.json': '[]' } },
  }, listed);
  const files = await get0('findDataFiles')(root, get0('FS_HANDLE'));
  assert.deepEqual(plain(files.map(f => f._dragPath).sort()), ['www/data/Map001.json', 'www/data/System.json']);
  assert.deepEqual(listed, ['/', 'www/', 'www/data/']);
  assert.equal(await files.find(f => f.name === 'Map001.json').text(), '{"events":[]}');
});

test('FS_ENTRY keeps calling readEntries until it returns an empty batch (more than 100 files)', async () => {
  const entries = Array.from({ length: 250 }, (_, i) => ({ name: `f${i}`, isDirectory: false }));
  let at = 0;
  const d = { createReader: () => ({ readEntries(ok) { const b = entries.slice(at, at + 100); at += b.length; ok(b); } }) };
  assert.equal((await get0('FS_ENTRY').list(d)).length, 250);
});

function get0(name) { return setup().get(name); }
