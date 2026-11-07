/* ── Scene player: a dark lightbox that plays a scene like the game ──
   Like a video preview on Google Drive: the page dims, the scene sits in the middle
   at the game's screen size (scaled to fit), the controls run along the bottom.
   Each step of the timeline (scene-script.js) is one message with the pictures and
   music of that moment. Click / → / Space: next, ←: back, A: auto, M: mute,
   T: typewriter text, H: hide the dialogue, Esc: close.
   Scenes run on into each other (in the sidebar's order, findScenes()): next on the
   last message opens the next scene, back on the first one opens the previous scene
   at its end; Shift+← / Shift+→ jump a whole scene. Auto play carries on.
   Moving forward one step plays it like the game: its animation frames first (picture
   flips and moves, sounds on their frame), then its message. Seeking or going back
   shows the step at once, without sound effects, and stops the ones still playing.
   Like the game, sound effects run on into the next message; an ME holds the BGM
   until it ends. A click during an animation
   skips it (the skipped frames stay silent).
   Messages type themselves out at reading speed (PLAYER_WPM; T turns it off); a click
   while typing shows the whole message, like the game. */
const PLAYER_PREF_KEY = 'mle-player';      // { vol, muted } of this viewer (never sent)
const PLAYER_FACE = 144;                   // face graphics: 4×2 cells of 144px
const PLAYER_MSG_H = 180;                  // message window: 4 lines, like the game
const PLAYER_WPM = 300;                    // reading speed: typing and auto play
const PLAYER_HOLD = 2000;                  // auto play: time to read / look at the CG once a message is shown (ms)
const PLAYER_CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\uff66-\uff9f]/g;

// How long a message takes to read at PLAYER_WPM: words split by spaces, and two
// CJK characters (written without spaces) count as one word.
function playerReadMs(text) {
  const cjk = (text.match(PLAYER_CJK) || []).length;
  const words = (text.replace(PLAYER_CJK, ' ').match(/\S+/g) || []).length;
  return (words + cjk / 2) / PLAYER_WPM * 60000;
}

const Player = {
  el: null,
  steps: [], i: 0, list: null,
  auto: false, timer: 0,
  anim: null,               // { step, k, timer } while a step's animation plays
  typing: null,             // { chars, n, start, per, raf, choices } while a message types out
  typewriter: true,
  hideMsg: false,           // H: the dialogue is hidden to see the pictures
  vol: 0.8, muted: false,
  W: SCREEN_MV.width, H: SCREEN_MV.height,
  imgs: new Map(),          // picture id → <img>
  loops: { bgm: null, bgs: null },   // { name, audio, token }
  oneShots: new Set(),               // SE / ME playing now (each tagged with its kind)
  me: null,                          // the ME playing now: the BGM waits for it, like the game
  soundGen: 0,                       // bumped on every step change: late loads of old sounds stay silent
  missing: new Set(),
  lastFocus: null,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      root: $('player'), title: $('pl-title'), sub: $('pl-sub'), note: $('pl-note'),
      main: $('pl-main'), frame: $('pl-frame'), stage: $('pl-stage'), pics: $('pl-pics'), fade: $('pl-fade'),
      msg: $('pl-msg'), namebox: $('pl-namebox'), face: $('pl-face'), text: $('pl-text'), choices: $('pl-choices'),
      seek: $('pl-seek'), count: $('pl-count'), auto: $('pl-auto'), mute: $('pl-mute'), volume: $('pl-vol'),
      type: $('pl-type'), hide: $('pl-hide'), scenePrev: $('pl-scene-prev'), sceneNext: $('pl-scene-next'),
    };
    // The text is two spans: what has been typed, and the rest laid out but invisible.
    this.el.shown = document.createElement('span');
    this.el.rest = document.createElement('span');
    this.el.rest.className = 'pl-rest';
    this.el.text.append(this.el.shown, this.el.rest);
    try {
      const p = JSON.parse(localStorage.getItem(PLAYER_PREF_KEY) || '{}');
      if (typeof p.vol === 'number') this.vol = Math.max(0, Math.min(1, p.vol));
      this.muted = !!p.muted;
      if (p.typewriter === false) this.typewriter = false;
    } catch {}
    this.el.volume.value = Math.round(this.vol * 100);

    $('pl-close').addEventListener('click', () => this.close());
    $('pl-prev').addEventListener('click', () => this.back());
    $('pl-next').addEventListener('click', () => this.next());
    $('pl-side-prev').addEventListener('click', () => this.back());
    $('pl-side-next').addEventListener('click', () => this.next());
    this.el.scenePrev.addEventListener('click', () => this.toScene(-1));
    this.el.sceneNext.addEventListener('click', () => this.toScene(1));
    this.el.hide.addEventListener('click', () => this.setHideMsg(!this.hideMsg));
    this.el.auto.addEventListener('click', () => this.setAuto(!this.auto));
    this.el.mute.addEventListener('click', () => this.setMuted(!this.muted));
    this.el.type.addEventListener('click', () => this.setTypewriter(!this.typewriter));
    this.el.volume.addEventListener('input', () => {
      this.vol = this.el.volume.value / 100;
      if (this.muted && this.vol > 0) this.muted = false;
      this.applyVolume();
    });
    this.el.seek.addEventListener('input', () => this.go(+this.el.seek.value));
    this.el.stage.addEventListener('click', e => {
      if (e.target.closest('.pl-choice')) return;
      if (this.hideMsg) this.setHideMsg(false);   // like the game: a click brings the window back
      else this.next();
    });
    this.el.main.addEventListener('click', e => { if (e.target === this.el.main) this.close(); });
    document.addEventListener('keydown', e => this.onKey(e), true);
    new ResizeObserver(() => this.fit()).observe(this.el.main);
    this.applyVolume();
    this.setTypewriter(this.typewriter);
  },

  // entry: { title, sub, list } — list is the command list of the event page / common event.
  // opts.cont: moving on from the scene on screen (toScene): the music, pictures, stage
  // size, hidden dialogue and auto play carry over, so one scene runs into the next.
  // opts.atEnd: open on the last message (going back from the next scene).
  open(entry, opts) {
    opts = opts || {};
    if (!this.el) this.init();
    const cont = !!opts.cont && !this.el.root.hidden;
    const auto = cont && this.auto;
    this.stop(cont);
    this.list = entry.list;
    this.steps = sceneTimeline(entry.list, playerCommon);
    this.missing = new Set();
    this.el.title.textContent = entry.title || 'Scene';
    this.el.sub.textContent = entry.sub || '';
    if (!cont) {
      this.el.root.hidden = false;
      document.body.classList.add('pl-open');
      this.lastFocus = document.activeElement;
      this.setHideMsg(false);
      this.grown = false;
      this.setStage(SCREEN_MV.width, SCREEN_MV.height);
      if (Media.screen) Media.screen.then(s => { if (!this.el.root.hidden && !this.grown) this.setStage(s.width, s.height); });
    }
    this.el.root.focus();
    this.note();
    this.sceneButtons();
    if (opts.atEnd) this.render(Math.max(0, this.steps.length - 1), false);
    else this.render(0, true);
    if (auto) this.setAuto(true);
  },

  close() {
    if (!this.el || this.el.root.hidden) return;
    this.stop();
    this.el.root.hidden = true;
    document.body.classList.remove('pl-open');
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },

  // Silence and forget the previous scene. cont: the next scene follows on, so the
  // music and pictures stay until its first step replaces them (no gap, and the same
  // BGM does not start over).
  stop(cont) {
    this.stopAnim();
    this.stopTyping();
    this.setAuto(false);
    if (cont) return;
    for (const k of ['bgm', 'bgs']) this.setLoop(k, null);
    this.stopOneShots();
    for (const img of this.imgs.values()) img.remove();
    this.imgs.clear();
  },

  setStage(w, h) {
    this.W = w;
    this.H = h;
    this.el.stage.style.width = this.W + 'px';
    this.el.stage.style.height = this.H + 'px';
    this.fit();
  },

  // Scale the stage (game pixels) to the space between the top bar and the controls.
  fit() {
    if (!this.el || this.el.root.hidden) return;
    const box = this.el.main.getBoundingClientRect();
    const side = box.width > 700 ? 128 : 16;
    const s = Math.max(0.1, Math.min((box.width - side) / this.W, (box.height - 16) / this.H));
    this.el.frame.style.width = Math.floor(this.W * s) + 'px';
    this.el.frame.style.height = Math.floor(this.H * s) + 'px';
    this.el.stage.style.transform = `scale(${s})`;
  },

  note() {
    const n = [];
    if (!this.steps.length) n.push('Nothing to play: no messages or pictures in this scene.');
    else if (!Media.root) n.push('Pictures and sound need the game folder (open it instead of data/).');
    else if (this.missing.size) n.push(`${this.missing.size} file${this.missing.size > 1 ? 's' : ''} not found`);
    this.el.note.textContent = n.join(' ');
    this.el.note.title = [...this.missing].join('\n');
  },

  next() {
    if (this.anim) return this.endAnim();
    if (this.typing) return this.endTyping();
    if (this.i < this.steps.length - 1) this.go(this.i + 1);
    else if (!this.toScene(1)) this.setAuto(false);
  },

  // Back one message; on the first one, the previous scene at its end.
  back() {
    if (this.i > 0) this.go(this.i - 1);
    else this.toScene(-1, true);
  },

  /* ── Scene to scene: the sidebar's list (findScenes) in order ── */
  // The scene `delta` away from the one on screen, or null (none, or a page that is
  // not in the list: a Preview of a page with too few pictures / messages).
  sceneAt(delta) {
    const all = findScenes();
    const k = all.findIndex(sc => sc.list === this.list);
    return k < 0 ? null : all[k + delta] || null;
  },

  // Open the next (1) / previous (-1) scene; the graph behind follows it.
  toScene(delta, atEnd) {
    const sc = this.sceneAt(delta);
    if (!sc) return false;
    playScene(sc, { cont: true, atEnd: !!atEnd });
    return true;
  },

  sceneButtons() {
    const prev = this.sceneAt(-1), next = this.sceneAt(1);
    this.el.scenePrev.disabled = !prev;
    this.el.sceneNext.disabled = !next;
    this.el.scenePrev.title = prev ? `Previous scene: ${prev.name} (Shift+←)` : 'No previous scene';
    this.el.sceneNext.title = next ? `Next scene: ${next.name} (Shift+→)` : 'No next scene';
  },

  /* ── Hide the dialogue to see the pictures alone ── */
  setHideMsg(on) {
    this.hideMsg = on;
    this.el.stage.classList.toggle('pl-hide-msg', on);
    this.el.hide.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.el.hide.querySelector('use').setAttribute('href', on ? '#i-eye' : '#i-eye-off');
    this.el.hide.title = on ? 'Show dialogue (H)' : 'Hide dialogue (H)';
    this.el.hide.setAttribute('aria-label', on ? 'Show dialogue' : 'Hide dialogue');
  },

  go(i) {
    if (!this.steps.length) return;
    i = Math.max(0, Math.min(this.steps.length - 1, i));
    const forward = i === this.i + 1;
    this.render(i, forward);
  },

  choose(k) {
    const step = this.steps[this.i];
    if (!step || !step.choices) return;
    if (k !== step.choices.chosen) this.steps = sceneChoose(this.steps, this.i, k, playerCommon);
    this.next();
  },

  render(i, play) {
    this.stopAnim();
    this.stopTyping();
    this.i = i;
    const step = this.steps[i];
    this.el.seek.max = Math.max(0, this.steps.length - 1);
    this.el.seek.value = i;
    this.el.count.textContent = this.steps.length ? `${i + 1} / ${this.steps.length}` : '0 / 0';
    if (!step) { this.el.msg.hidden = true; return; }

    // Like the game, SE / ME run on into the next message. Seeking or going back is
    // not something the game does: it silences them and the loads on the way.
    if (!play) this.stopOneShots();
    this.el.fade.classList.toggle('on', !!step.fade);
    this.setLoop('bgm', step.bgm);
    this.setLoop('bgs', step.bgs);
    for (let k = i + 1; k <= i + 3 && k < this.steps.length; k++) this.preload(this.steps[k]);
    if (play && step.anim) {
      this.el.msg.hidden = true;
      this.anim = { step, k: 0, timer: 0 };
      this.tick();
      return;
    }
    this.renderPictures(step.pics);
    this.renderMessage(step.msg, step.choices, play);
    if (play) for (const s of step.sounds) this.playOnce(s);
    this.schedule();
  },

  preload(step) {
    const names = new Set();
    for (const id in step.pics) names.add(step.pics[id].name);
    for (const f of step.anim || []) for (const id in f.pics) names.add(f.pics[id].name);
    for (const n of names) Media.image('img/pictures', n);
  },

  // One animation frame, then wait as long as the game does (1/60 s per frame).
  tick() {
    const a = this.anim;
    if (!a) return;
    if (a.k >= a.step.anim.length) return this.endAnim();
    const f = a.step.anim[a.k];
    this.renderPictures(f.pics, true);
    for (const s of a.step.sounds) if (s.at === a.k) this.playOnce(s);
    a.k++;
    a.timer = setTimeout(() => this.tick(), Math.max(16, f.wait * 1000 / 60));
  },

  // The animation's end (or a click that skips it): the step as it rests, with its message.
  endAnim() {
    const a = this.anim;
    if (!a) return;
    clearTimeout(a.timer);
    this.anim = null;
    // Skipped frames stay silent (their sounds all at once would pile up); the sounds
    // that come with the message still play.
    const last = a.step.anim.length;
    for (const s of a.step.sounds) if (s.at === last) this.playOnce(s);
    this.renderPictures(a.step.pics);
    this.renderMessage(a.step.msg, a.step.choices, true);
    this.schedule();
  },

  stopAnim() {
    if (this.anim) clearTimeout(this.anim.timer);
    this.anim = null;
  },

  // animate: Move Picture durations become CSS transitions (frames → seconds).
  renderPictures(pics, animate) {
    for (const [id, img] of this.imgs) if (!pics[id]) { img.remove(); this.imgs.delete(id); }
    for (const id of Object.keys(pics).sort((a, b) => a - b)) {
      const p = pics[id];
      let img = this.imgs.get(id);
      if (!img) {
        img = document.createElement('img');
        img.className = 'pl-pic';
        img.alt = '';
        img.draggable = false;
        img.addEventListener('load', () => this.grow(img));
        this.imgs.set(id, img);
      }
      this.el.pics.appendChild(img);   // keeps picture-number order
      if (img.dataset.name !== p.name) {
        img.dataset.name = p.name;
        img.removeAttribute('src');
        img.style.visibility = 'hidden';
        Media.image('img/pictures', p.name).then(u => {
          if (img.dataset.name !== p.name) return;
          if (u) { img.src = u; img.style.visibility = ''; }
          else this.miss('img/pictures/' + p.name);
        });
      }
      img.dataset.origin = p.origin;
      img.style.left = p.x + 'px';
      img.style.top = p.y + 'px';
      img.style.transform = (p.origin === 1 ? 'translate(-50%, -50%) ' : '') + `scale(${p.sx / 100}, ${p.sy / 100})`;
      img.style.opacity = p.opacity / 255;
      img.style.mixBlendMode = ['normal', 'plus-lighter', 'multiply', 'screen'][p.blend] || 'normal';
      const d = animate && p.dur ? p.dur / 60 : 0;
      img.style.transition = d ? `left ${d}s linear, top ${d}s linear, transform ${d}s linear, opacity ${d}s linear` : '';
    }
  },

  // A full-screen picture at the top-left corner bigger than the screen size we know:
  // the game runs at that size (a resolution plugin we could not read).
  grow(img) {
    if (img.dataset.origin !== '0' || img.style.left !== '0px' || img.style.top !== '0px') return;
    const w = img.naturalWidth, h = img.naturalHeight;
    if (w > this.W && h >= this.H * 0.9 && w <= 4096) { this.grown = true; this.setStage(w, h); }
  },

  // type: the message types itself out (moving forward, with the typewriter on).
  renderMessage(msg, choices, type) {
    const el = this.el;
    el.msg.hidden = !msg && !choices;
    if (el.msg.hidden) return;
    el.msg.className = msg
      ? `pl-pos-${msg.position} pl-bg-${msg.background}${msg.scroll ? ' pl-scroll' : ''}`
      : 'pl-pos-2 pl-bg-2 pl-only-choices';
    el.msg.style.height = msg && !msg.scroll ? PLAYER_MSG_H + 'px' : '';
    el.shown.textContent = msg ? msg.text : '';
    el.rest.textContent = '';
    el.namebox.hidden = !(msg && msg.name);
    el.namebox.textContent = (msg && msg.name) || '';

    const face = msg && msg.face;
    el.face.hidden = !face;
    el.msg.classList.toggle('pl-has-face', !!face);
    if (face) {
      const idx = msg.faceIndex || 0;
      el.face.style.backgroundPosition = `${-(idx % 4) * PLAYER_FACE}px ${-Math.floor(idx / 4) * PLAYER_FACE}px`;
      el.face.style.backgroundImage = '';
      el.face.dataset.name = face;
      Media.image('img/faces', face).then(u => {
        if (el.face.dataset.name !== face) return;
        if (u) el.face.style.backgroundImage = `url("${u}")`;
        else this.miss('img/faces/' + face);
      });
    }

    el.choices.hidden = true;
    el.choices.innerHTML = '';
    if (choices) {
      choices.items.forEach((t, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pl-choice' + (k === choices.chosen ? ' chosen' : '');
        b.textContent = t || `Choice ${k + 1}`;
        b.title = k < 9 ? `Key ${k + 1}` : '';
        b.addEventListener('click', e => { e.stopPropagation(); this.choose(k); });
        el.choices.appendChild(b);
      });
    }
    if (type && this.typewriter && msg && !msg.scroll && msg.text.trim()) this.startTyping(msg.text, !!choices);
    else el.choices.hidden = !choices;
  },

  /* ── Typewriter: the message appears at reading speed (PLAYER_WPM) ── */
  startTyping(text, choices) {
    const chars = Array.from(text);
    this.typing = { chars, n: 0, start: performance.now(), per: playerReadMs(text) / chars.length, raf: 0, choices };
    this.el.shown.textContent = '';
    this.el.rest.textContent = text;
    this.typeFrame();
  },

  typeFrame() {
    const t = this.typing;
    if (!t) return;
    const n = Math.min(t.chars.length, Math.floor((performance.now() - t.start) / t.per) + 1);
    if (n !== t.n) {
      t.n = n;
      this.el.shown.textContent = t.chars.slice(0, n).join('');
      this.el.rest.textContent = t.chars.slice(n).join('');
    }
    if (n >= t.chars.length) return this.endTyping();
    t.raf = requestAnimationFrame(() => this.typeFrame());
  },

  // Typed out (or a click): the whole message and its choices, then auto play goes on.
  endTyping() {
    const t = this.typing;
    if (!t) return;
    this.stopTyping();
    this.el.shown.textContent = t.chars.join('');
    this.el.rest.textContent = '';
    this.el.choices.hidden = !t.choices;
    this.schedule();
  },

  stopTyping() {
    if (this.typing) cancelAnimationFrame(this.typing.raf);
    this.typing = null;
  },

  setTypewriter(on) {
    this.typewriter = on;
    if (!on) this.endTyping();
    this.el.type.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.el.type.title = on ? 'Typewriter text: on (T)' : 'Typewriter text: off (T)';
    this.savePrefs();
  },

  savePrefs() {
    try { localStorage.setItem(PLAYER_PREF_KEY, JSON.stringify({ vol: this.vol, muted: this.muted, typewriter: this.typewriter })); } catch {}
  },

  miss(path) {
    if (this.missing.has(path)) return;
    this.missing.add(path);
    this.note();
  },

  /* ── Sound ── */
  level(a) { return this.muted ? 0 : Math.max(0, Math.min(1, this.vol * (a.volume / 100))); },

  setLoop(kind, a) {
    const cur = this.loops[kind];
    if (cur && a && cur.name === a.name) { cur.spec = a; if (cur.audio) cur.audio.volume = this.level(a); return; }
    if (cur) { if (cur.audio) { cur.audio.pause(); cur.audio.removeAttribute('src'); cur.audio.load(); } this.loops[kind] = null; }
    if (!a) return;
    const slot = { name: a.name, spec: a, audio: null };
    this.loops[kind] = slot;
    Media.audio('audio/' + kind, a.name).then(u => {
      if (this.loops[kind] !== slot) return;
      if (!u) return this.miss(`audio/${kind}/${a.name}`);
      slot.audio = this.makeAudio(u, slot.spec);
      slot.audio.loop = true;
      if (!(kind === 'bgm' && this.me)) slot.audio.play().catch(() => {});
    });
  },

  // SE overlap like the game; a new ME replaces the one playing and holds the BGM
  // until it ends (AudioManager.playMe). Stop SE (251) arrives as { stop: true }.
  playOnce(s) {
    if (s.stop) return this.stopOneShots('se');
    const gen = this.soundGen;
    Media.audio('audio/' + s.kind, s.name).then(u => {
      if (this.el.root.hidden || gen !== this.soundGen) return;
      if (!u) return this.miss(`audio/${s.kind}/${s.name}`);
      const a = this.makeAudio(u, s);
      a.dataset.kind = s.kind;
      if (s.kind === 'me') {
        this.stopOneShots('me');
        this.me = a;
        const bgm = this.loops.bgm;
        if (bgm && bgm.audio) bgm.audio.pause();
      }
      this.oneShots.add(a);
      const done = () => {
        if (!this.oneShots.delete(a)) return;
        if (this.me === a) { this.me = null; this.resumeBgm(); }
      };
      a.addEventListener('ended', done);
      a.addEventListener('error', done);
      a.play().catch(done);
    });
  },

  // Stop the SE / ME playing (kind: only that kind), and the loads still on the way.
  stopOneShots(kind) {
    if (!kind) this.soundGen++;
    for (const a of [...this.oneShots]) {
      if (kind && a.dataset.kind !== kind) continue;
      a.pause();
      a.removeAttribute('src');
      a.load();
      this.oneShots.delete(a);
      if (this.me === a) this.me = null;
    }
    if (!this.me) this.resumeBgm();
  },

  resumeBgm() {
    const bgm = this.loops.bgm;
    if (bgm && bgm.audio && bgm.audio.paused && !this.el.root.hidden) bgm.audio.play().catch(() => {});
  },

  makeAudio(url, spec) {
    const a = new Audio(url);
    a.volume = this.level(spec);
    a.preservesPitch = false;
    a.playbackRate = Math.max(0.5, Math.min(2, (spec.pitch || 100) / 100));
    a.dataset.volume = spec.volume;
    return a;
  },

  setMuted(m) {
    this.muted = m;
    this.applyVolume();
  },

  applyVolume() {
    for (const slot of Object.values(this.loops)) if (slot && slot.audio) slot.audio.volume = this.level(slot.spec);
    for (const a of this.oneShots) a.volume = this.level({ volume: +a.dataset.volume });
    const off = this.muted || this.vol === 0;
    this.el.mute.setAttribute('aria-pressed', off ? 'true' : 'false');
    this.el.mute.querySelector('use').setAttribute('href', off ? '#i-mute' : '#i-volume');
    this.el.volume.value = this.muted ? 0 : Math.round(this.vol * 100);
    this.savePrefs();
  },

  /* ── Auto play: each line stays long enough to read at PLAYER_WPM ── */
  setAuto(on) {
    this.auto = on;
    clearTimeout(this.timer);
    this.timer = 0;
    if (!this.el) return;
    this.el.auto.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.el.auto.querySelector('use').setAttribute('href', on ? '#i-pause' : '#i-play');
    this.el.auto.title = on ? 'Pause (A)' : 'Auto play (A)';
    if (on) this.schedule();
  },

  schedule() {
    clearTimeout(this.timer);
    if (!this.auto || this.anim || this.typing) return;   // endAnim() / endTyping() schedule again
    if (this.i >= this.steps.length - 1 && !this.sceneAt(1)) { this.setAuto(false); return; }
    const msg = this.steps[this.i] && this.steps[this.i].msg;
    const typed = this.typewriter && msg && !msg.scroll;   // read while it typed
    const read = msg && !typed ? playerReadMs(msg.text) : 0;
    this.timer = setTimeout(() => this.next(), PLAYER_HOLD + Math.min(15000, read));
  },

  onKey(e) {
    if (!this.el || this.el.root.hidden) return;
    if (e.target === this.el.volume || e.target === this.el.seek) { if (e.key !== 'Escape') return; }
    const k = e.key;
    let used = true;
    if (k === 'Escape') this.close();
    else if (e.shiftKey && k === 'ArrowRight') this.toScene(1);
    else if (e.shiftKey && k === 'ArrowLeft') this.toScene(-1);
    else if (k === 'ArrowRight' || k === ' ' || k === 'Enter' || k === 'PageDown') {
      if ((k === ' ' || k === 'Enter') && e.target.closest && e.target.closest('button')) return;   // the button's own action
      this.next();
    }
    else if (k === 'ArrowLeft' || k === 'PageUp') this.back();
    else if (k === 'Home') this.go(0);
    else if (k === 'End') this.go(this.steps.length - 1);
    else if (k === 'a' || k === 'A') this.setAuto(!this.auto);
    else if (k === 'm' || k === 'M') this.setMuted(!this.muted);
    else if (k === 't' || k === 'T') this.setTypewriter(!this.typewriter);
    else if (k === 'h' || k === 'H') this.setHideMsg(!this.hideMsg);
    else if (/^[1-9]$/.test(k) && this.steps[this.i] && this.steps[this.i].choices) this.choose(+k - 1);
    else if (k === 'Tab') used = false;
    else used = !(e.ctrlKey || e.metaKey);   // app shortcuts (undo …) stay off while the player is open
    if (used) { e.preventDefault(); e.stopPropagation(); }
  },
};

function playerCommon(id) {
  const cev = S.commonEvents.find(e => e.id === id);
  return cev ? cev.list : null;
}

// Opens a scene from the sidebar, the event picker, the toolbar or the player itself
// (opts: see Player.open).
function openScene(entry, opts) {
  Player.open(entry, opts);
}
