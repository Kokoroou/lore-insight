/* ── Media: pictures, faces and audio of the open game, for the scene player ──
   Opening a game only reads data/ (loader.js). The player asks for one file at a time
   (img/pictures/X, audio/se/Y …): only the folders on the way are listed, once, and
   each file is read when first shown. Encrypted files (.rpgmvp/.png_, .rpgmvo/.ogg_ …)
   are decrypted in memory with System.json's key, like MakerLens Assets does; nothing
   is written or sent anywhere. Blob URLs are revoked when another game opens. */
const RPG_HEADER = [0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0];
const IMAGE_EXTS = ['png', 'png_', 'rpgmvp', 'jpg', 'jpeg', 'webp'];
const AUDIO_EXTS_OGG = ['ogg', 'ogg_', 'rpgmvo', 'm4a', 'm4a_', 'rpgmvm', 'mp3', 'wav'];
const AUDIO_EXTS_M4A = ['m4a', 'm4a_', 'rpgmvm', 'ogg', 'ogg_', 'rpgmvo', 'mp3', 'wav'];
const MEDIA_REAL_EXT = { png_: 'png', rpgmvp: 'png', ogg_: 'ogg', rpgmvo: 'ogg', m4a_: 'm4a', rpgmvm: 'm4a' };
const MEDIA_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav' };
const SCREEN_MV = { width: 816, height: 624 };

// Same as MakerLens Assets' js/decrypt-mvmz.js: drop the 16-byte header, XOR the next 16 with the key.
function decryptMVMZ(buffer, hexKey) {
  const hdr = new Uint8Array(buffer, 0, 16);
  for (let i = 0; i < 16; i++)
    if (hdr[i] !== RPG_HEADER[i])
      throw new Error('Invalid header — wrong key or not an RPG Maker MV/MZ file');
  const body  = buffer.slice(16);
  const view  = new DataView(body);
  const bytes = hexKey.match(/.{2}/g);
  if (!bytes || bytes.length < 16) throw new Error('Key too short (needs 32 hex characters)');
  for (let i = 0; i < 16; i++)
    view.setUint8(i, view.getUint8(i) ^ parseInt(bytes[i], 16));
  return body;
}

function isRpgEncrypted(buffer) {
  if (buffer.byteLength < 16) return false;
  const h = new Uint8Array(buffer, 0, 5);
  for (let i = 0; i < 5; i++) if (h[i] !== RPG_HEADER[i]) return false;
  return true;
}

// The real format from the first bytes: games ship WebP or JPEG under .png_ / .rpgmvp too.
function sniffMime(buffer) {
  const b = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(4, 8) === 'ftyp') return 'audio/mp4';
  if (ascii(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return '';
}

// Screen size: MZ keeps it in System.json; MV games set it with a plugin parameter
// ("Screen Width", "screenWidth" …) in js/plugins.js; else MV's 816×624.
function screenFromPlugins(text) {
  const num = re => { const m = text.match(re); return m ? +m[1] : 0; };
  const width = num(/"(?:Screen ?Width|screenWidth)\\?"\s*:\s*\\?"?(\d{3,4})/i);
  const height = num(/"(?:Screen ?Height|screenHeight)\\?"\s*:\s*\\?"?(\d{3,4})/i);
  return width && height ? { width, height } : null;
}

/* Game roots. Both answer list(dir) → Map(lower-case name → entry) and file(entry) → File.
   - tree: a folder handle / drag & drop entry, listed with loader.js's FS_HANDLE / FS_ENTRY;
   - files: the File list of <input webkitdirectory> (every file is already in hand). */
function treeRoot(fs, node) {
  const dirs = new Map();
  const list = path => {
    if (!dirs.has(path)) {
      dirs.set(path, (async () => {
        let dir = node;
        if (path) {
          const cut = path.lastIndexOf('/');
          const parent = await list(cut < 0 ? '' : path.slice(0, cut));
          const e = parent.get(path.slice(cut + 1));
          if (!e || !e.isDir) return new Map();
          dir = e.node;
        }
        const out = new Map();
        try { for (const k of await fs.list(dir)) out.set(k.name.toLowerCase(), k); } catch {}
        return out;
      })());
    }
    return dirs.get(path);
  };
  return { list, file: e => fs.file(e.node) };
}

function filesRoot(files, prefix) {
  const dirs = new Map();
  const lp = prefix.toLowerCase();
  for (const [path, file] of files) {
    if (!path.toLowerCase().startsWith(lp)) continue;
    const parts = path.slice(prefix.length).split('/');
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/').toLowerCase();
      if (!dirs.has(dir)) dirs.set(dir, new Map());
      const isDir = i < parts.length - 1;
      dirs.get(dir).set(parts[i].toLowerCase(), isDir ? { name: parts[i], isDir } : { name: parts[i], isDir, file });
    }
  }
  return { list: async path => dirs.get(path) || new Map(), file: async e => e.file };
}

const Media = {
  root: null,          // treeRoot() / filesRoot(), or null (the data/ folder itself was opened)
  key: '',             // System.json encryptionKey
  screen: null,        // Promise<{width, height}>
  urls: new Map(),     // 'img/pictures/name' → Promise<blob URL | null>

  reset(root, system) {
    for (const p of this.urls.values()) p.then(u => { if (u) URL.revokeObjectURL(u); });
    this.urls = new Map();
    this.root = root;
    this.key = (system && system.encryptionKey) || '';
    const adv = system && system.advanced;
    this.screen = adv && adv.screenWidth
      ? Promise.resolve({ width: adv.screenWidth, height: adv.screenHeight })
      : this.text('js/plugins.js').then(t => (t && screenFromPlugins(t)) || SCREEN_MV);
  },

  async find(path, exts) {
    if (!this.root) return null;
    const cut = path.lastIndexOf('/');
    const dir = await this.root.list(path.slice(0, cut).toLowerCase());
    const base = path.slice(cut + 1).toLowerCase();
    for (const ext of exts) {
      const e = dir.get(base + '.' + ext);
      if (e && !e.isDir) return { entry: e, ext };
    }
    return null;
  },

  async text(path) {
    try {
      const cut = path.lastIndexOf('.');
      const hit = await this.find(path.slice(0, cut), [path.slice(cut + 1)]);
      return hit ? await (await this.root.file(hit.entry)).text() : null;
    } catch { return null; }
  },

  // folder: 'img/pictures', 'img/faces', 'audio/bgm' …; name may hold sub-folders (MZ).
  url(folder, name, exts) {
    const key = folder + '/' + name;
    if (!this.urls.has(key)) {
      this.urls.set(key, (async () => {
        try {
          const hit = await this.find(key, exts);
          if (!hit) return null;
          let buf = await (await this.root.file(hit.entry)).arrayBuffer();
          if (isRpgEncrypted(buf)) {
            if (!this.key) return null;
            buf = decryptMVMZ(buf, this.key);
          }
          const type = sniffMime(buf) || MEDIA_MIME[MEDIA_REAL_EXT[hit.ext] || hit.ext] || '';
          return URL.createObjectURL(new Blob([buf], { type }));
        } catch { return null; }
      })());
    }
    return this.urls.get(key);
  },

  image(folder, name) { return this.url(folder, name, IMAGE_EXTS); },
  audio(folder, name) {
    const ogg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"');
    return this.url(folder, name, ogg ? AUDIO_EXTS_OGG : AUDIO_EXTS_M4A);
  },
};
