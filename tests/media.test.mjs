import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const KEY = '00112233445566778899aabbccddeeff';
const HEADER = [0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0];

// What RPG Maker's deployment does to a file: header + the first 16 bytes XOR the key.
function encrypt(bytes) {
  const out = new Uint8Array(16 + bytes.length);
  out.set(HEADER);
  out.set(bytes, 16);
  for (let i = 0; i < 16; i++) out[16 + i] ^= parseInt(KEY.substr(i * 2, 2), 16);
  return out.buffer;
}

const file = (path, buf) => ({ name: path.split('/').pop(), arrayBuffer: async () => buf, text: async () => new TextDecoder().decode(buf) });

function setup(paths) {
  const run = load(['media.js'], { URL, Blob, TextDecoder, Audio: undefined });
  const files = new Map(paths.map(([p, buf]) => [p, file(p, buf)]));
  return { run, files };
}

const png = new Uint8Array(40).map((_, i) => i);

test('decryptMVMZ restores the original bytes; a wrong header is refused', () => {
  const { run } = setup([]);
  const back = new Uint8Array(run('decryptMVMZ')(encrypt(png), KEY));
  assert.deepEqual([...back], [...png]);
  assert.throws(() => run('decryptMVMZ')(png.buffer, KEY), /Invalid header/);
});

test('sniffMime trusts the bytes over the extension (WebP shipped as .png_)', () => {
  const { run } = setup([]);
  const bytes = s => new Uint8Array([...s].map(ch => ch.charCodeAt(0))).buffer;
  assert.equal(run('sniffMime')(bytes('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  assert.equal(run('sniffMime')(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer), 'image/png');
  assert.equal(run('sniffMime')(bytes('OggS\0\0\0\0')), 'audio/ogg');
  assert.equal(run('sniffMime')(bytes('\0\0\0\x20ftypM4A ')), 'audio/mp4');
  assert.equal(run('sniffMime')(bytes('????')), '');
});

test('screenFromPlugins reads MV resolution plugins (plain and escaped JSON)', () => {
  const { run } = setup([]);
  const f = run('screenFromPlugins');
  assert.deepEqual({ ...f('{"parameters":{"Screen Width":"1024","Screen Height":"768"}}') }, { width: 1024, height: 768 });
  assert.deepEqual({ ...f('"parameters": { "screenWidth": "1280", "screenHeight": "720" }') }, { width: 1280, height: 720 });
  assert.equal(f('"Window Width":"300"'), null);
});

test('Media finds files case-insensitively under the game root and decrypts them', async () => {
  const { run, files } = setup([
    ['Game/www/data/Map001.json', new ArrayBuffer(2)],
    ['Game/www/img/pictures/CG_01.rpgmvp', encrypt(png)],
    ['Game/www/img/pictures/sub/Plain.png', png.buffer],
    ['Game/www/audio/se/Hit.ogg_', encrypt(png)],
    ['Game/www/js/plugins.js', new TextEncoder().encode('"Screen Width":"1024","Screen Height":"768"').buffer],
  ]);
  run('globalThis').__files = files;
  run(`Media.reset(filesRoot(__files, 'Game/www/'), { encryptionKey: '${KEY}' })`);
  assert.deepEqual({ ...await run('Media.screen') }, { width: 1024, height: 768 });

  const url = await run(`Media.image('img/pictures', 'cg_01')`);
  assert.match(url, /^blob:/);
  const blob = await (await fetch(url)).arrayBuffer();
  assert.deepEqual([...new Uint8Array(blob)], [...png]);
  assert.equal(await run(`Media.image('img/pictures', 'cg_01')`), url, 'cached');

  assert.match(await run(`Media.image('img/pictures', 'sub/Plain')`), /^blob:/);
  assert.match(await run(`Media.url('audio/se', 'Hit', AUDIO_EXTS_OGG)`), /^blob:/);
  assert.equal(await run(`Media.image('img/pictures', 'Nope')`), null);

  run(`Media.reset(filesRoot(__files, 'Game/www/'), {})`);   // no key: encrypted files cannot be shown
  assert.equal(await run(`Media.image('img/pictures', 'CG_01')`), null);
  assert.deepEqual({ ...await run('Media.screen') }, { width: 1024, height: 768 });
  run('Media.reset(null, { advanced: { screenWidth: 1280, screenHeight: 720 } })');
  assert.deepEqual({ ...await run('Media.screen') }, { width: 1280, height: 720 });
  assert.equal(await run(`Media.image('img/pictures', 'CG_01')`), null);
});

test('treeRoot lists only the folders on the way to a file', async () => {
  const { run } = setup([]);
  const listed = [];
  const tree = { img: { pictures: { 'A.png': png.buffer } }, audio: { bgm: {} } };
  const fs = {
    async list(dir) { listed.push(dir.path); return Object.entries(dir.node).map(([name, v]) => ({ name, node: { node: v, path: dir.path + name + '/' }, isDir: !(v instanceof ArrayBuffer) })); },
    file: n => Promise.resolve(file('x', n.node)),
  };
  run('globalThis').__fs = fs;
  run('globalThis').__node = { node: tree, path: '' };
  run('Media.reset(treeRoot(__fs, __node), {})');
  assert.match(await run(`Media.image('img/pictures', 'a')`), /^blob:/);
  assert.deepEqual(listed.sort(), ['', 'img/', 'img/pictures/']);
});
