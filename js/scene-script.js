/* ── Scene script: runs a command list the way the game does, for the player ──
   No DOM here (tests run it in node). sceneRun() walks the commands like RPG Maker's
   Game_Interpreter and stops at every message: each stop is a STEP holding what the
   screen shows at that moment (pictures, message, choices, music) plus the
   interpreter state, so a different choice can resume from there (sceneChoose()).
   Rules the viewer asked for:
   - choices (102) are offered to the viewer; the timeline follows the chosen one.
     Until the viewer picks, the branch with the most to show is preselected (each
     option is tried ahead, SCENE_LOOKAHEAD steps at most), so "Skip this scene?"
     does not skip it; on a tie, the game's own default;
   - conditions (111) take their "true" branch, never the else (411), except on a
     switch or variable the scene has not set: its first check tries both answers
     ahead and keeps the one that shows more (on a tie, true), then REMEMBERS it, so
     later checks of the same one agree (a "day == 24 … day == 25 …" chain plays one
     day, not all of them; a bed that sleeps by day and plays a scene by night plays
     the scene). Control Switches / Variables inside the scene are followed too (a
     random number takes its minimum);
   - checks on an actor (equipment, name, class, party, state) use the game's STARTING
     state (Actors.json, System.json), changed by the scene's own Change Equipment /
     Name / Party / State commands: the default outfit, not every outfit at once.
     Unknown skills are tried both ways like unknown switches;
   - simple scripts are followed: script conditions on variables, switches and shown
     pictures, $gameVariables / $gameSwitches assignments, $gameScreen.showPicture /
     erasePicture (also in a for loop), and the picture commands of Triacontane's
     PictureVariableSetting (P_VARIABLE_VALID, P_TARGET_*, P_D_FILENAME). A script we
     cannot read leaves the values it assigns unknown;
   - loops (112/413) run once, backward label jumps (119) once, calls (117) inline.
   Picture changes split by waits (230, or a Move Picture that waits) are kept as the
   step's ANIMATION frames ({ pics, wait } in 1/60 s), played before its message; each
   sound remembers the frame it starts on (at). */
const SCENE_MAX_STEPS = 5000;
const SCENE_MAX_COMMANDS = 300000;
const SCENE_MAX_DEPTH = 20;
const SCENE_LOOKAHEAD = 400;            // steps tried ahead per option
const SCENE_LOOKAHEAD_COMMANDS = 20000;
const SCENE_LOOKAHEAD_BUDGET = 400000;  // commands tried ahead per timeline: then unknown checks take "true"
const SCENE_MAX_FRAMES = 240;           // animation frames kept per step

function sceneState(list) {
  return {
    frames: [sceneFrame(list)], pics: {}, bgm: null, bgs: null, savedBgm: null, fade: false, ran: 0, sw: {}, vars: {}, ne: {},
    look: { left: SCENE_LOOKAHEAD_BUDGET },   // shared by the copies
    actors: {}, party: null,                  // changes to the starting actors / party
    picVar: false, target: null, dname: null, // PictureVariableSetting
  };
}

function sceneFrame(list) {
  return { list: list || [], i: 0, branch: {}, jumps: {} };
}

function clonePics(pics) {
  const out = {};
  for (const id in pics) out[id] = Object.assign({}, pics[id]);
  return out;
}

function cloneSceneState(st) {
  return {
    frames: st.frames.map(f => ({ list: f.list, i: f.i, branch: Object.assign({}, f.branch), jumps: Object.assign({}, f.jumps) })),
    pics: clonePics(st.pics), bgm: st.bgm, bgs: st.bgs, savedBgm: st.savedBgm, fade: st.fade, ran: st.ran, look: st.look,
    sw: Object.assign({}, st.sw), vars: Object.assign({}, st.vars), ne: Object.assign({}, st.ne),
    actors: cloneActors(st.actors), party: st.party && st.party.slice(),
    picVar: st.picVar, target: st.target, dname: st.dname,
  };
}

function cloneActors(actors) {
  const out = {};
  for (const id in actors) out[id] = Object.assign({}, actors[id], { equips: actors[id].equips.slice() });
  return out;
}

// Conditional Branch (111). Switch [0, id, 0 ON / 1 OFF], variable [1, id, 0 constant /
// 1 variable, operand, 0 == / 1 >= / 2 <= / 3 > / 4 < / 5 !=], self switch [2, 'A', 0 ON / 1 OFF].
// Returns true / false, or null when it checks a value not known yet (sceneAssume decides).
// Every other kind of condition (actor, item, script …) is true.
const SCENE_COMPARE = [(a, b) => a === b, (a, b) => a >= b, (a, b) => a <= b, (a, b) => a > b, (a, b) => a < b, (a, b) => a !== b];
const SCENE_SATISFY = [b => b, b => b, b => b, b => b + 1, b => b - 1, () => null];
const SCENE_FAIL    = [() => null, b => b - 1, b => b + 1, b => b, b => b, b => b];   // a value that makes it false
function sceneCondition(st, p) {
  if (p[0] === 0 || p[0] === 2) {
    const key = p[0] === 0 ? p[1] : 'self:' + p[1];
    return key in st.sw ? st.sw[key] === (p[2] === 0) : null;
  }
  if (p[0] === 1) {
    const rhs = sceneRhs(st, p);
    const cmp = SCENE_COMPARE[p[4]];
    if (rhs === undefined || !cmp) return true;
    if (typeof rhs !== 'number' && p[4] !== 0 && p[4] !== 5) return true;   // "> 'text'": not followed
    if (p[1] in st.vars) return cmp(st.vars[p[1]], rhs);
    if (st.ne[p[1] + ':' + rhs]) return p[4] === 5;          // known "!= rhs"
    return SCENE_SATISFY[p[4]](rhs) === null ? true : null;   // "!=" on an unknown: true
  }
  return true;
}

// The right-hand side of a variable check: a constant (a number, or a string or boolean
// from a script condition) or another variable (undefined while unknown).
function sceneRhs(st, p) {
  if (p[2] !== 0) return st.vars[p[3]];
  return typeof p[3] === 'number' || typeof p[3] === 'string' || typeof p[3] === 'boolean' ? p[3] : +p[3];
}

// Remember the answer taken for an unknown value, so later checks agree with it.
function sceneAssume(st, p, truth) {
  if (p[0] === 0 || p[0] === 2) {
    st.sw[p[0] === 0 ? p[1] : 'self:' + p[1]] = (p[2] === 0) === truth;
  } else if (p[0] === 1) {
    const rhs = sceneRhs(st, p);
    if (rhs === undefined || (typeof rhs !== 'number' && p[4] !== 0 && p[4] !== 5)) return truth;
    const v = (truth ? SCENE_SATISFY : SCENE_FAIL)[p[4]](rhs);
    if (v !== null) st.vars[p[1]] = v;
    else if (!truth) st.ne[p[1] + ':' + rhs] = true;          // "== rhs" was false: any other value
  }
  return truth;
}

// Both answers tried ahead (SCENE_LOOKAHEAD steps): the one that shows more, true on a tie.
function sceneBestCondition(st, p, indent, getCommon) {
  let best = true, most = -1;
  for (const truth of [true, false]) {
    const t = cloneSceneState(st);
    sceneAssume(t, p, truth);
    const f = t.frames[t.frames.length - 1];
    f.branch[indent] = truth;
    if (!truth) sceneSkipBranch(f, indent);
    const n = sceneScore(t, getCommon);
    if (n > most) { best = truth; most = n; }
  }
  return sceneAssume(st, p, best);
}

// Control Variables (122): [first, last, 0 set / 1 + / 2 - / 3 × / 4 ÷ / 5 mod,
// 0 constant / 1 variable / 2 random min..max / 3 game data / 4 script, operand, max].
function sceneControlVariables(st, p) {
  const val = p[3] === 0 || p[3] === 2 ? +p[4] : p[3] === 1 ? st.vars[p[4]] : undefined;
  for (let id = p[0]; id <= p[1]; id++) {
    const cur = st.vars[id];
    if (val === undefined || (p[2] !== 0 && cur === undefined)) { delete st.vars[id]; continue; }
    const out = [val, cur + val, cur - val, cur * val, val ? Math.trunc(cur / val) : 0, val ? cur % val : 0][p[2]];
    if (out === undefined) delete st.vars[id];
    else st.vars[id] = out;
  }
}

/* ── Actors: the game's starting state ──
   S.actorStart[id] = { name, classId, equips } from Actors.json and S.party from
   System.json (loader.js). The scene's own changes live in st.actors / st.party. */
function sceneActor(st, id) {
  if (st.actors[id]) return st.actors[id];
  const a = typeof S !== 'undefined' && S.actorStart && S.actorStart[id];
  return a ? { name: a.name || '', classId: a.classId || 0, equips: (a.equips || []).slice() } : null;
}

function sceneActorEdit(st, id) {
  if (!st.actors[id]) { const a = sceneActor(st, id); if (!a) return null; st.actors[id] = a; }
  return st.actors[id];
}

function sceneParty(st) {
  return st.party || (typeof S !== 'undefined' && S.party) || [];
}

// Conditional Branch on an actor: [4, actorId, 0 in party / 1 name / 2 class / 3 skill /
// 4 weapon / 5 armor / 6 state, operand]. Equipment slot 0 is the weapon, the rest armor.
// A skill is unknown (checked like a switch); no state at the start.
function sceneActorCondition(st, p) {
  const a = sceneActor(st, p[1]);
  if (!a) return true;
  switch (p[2]) {
    case 0: return sceneParty(st).indexOf(p[1]) >= 0;
    case 1: return a.name === p[3];
    case 2: return a.classId === p[3];
    case 3: return [0, 'skill:' + p[1] + ':' + p[3], 0];
    case 4: return a.equips[0] === p[3];
    case 5: return a.equips.slice(1).indexOf(p[3]) >= 0;
    case 6: return !!st.sw['state:' + p[1] + ':' + p[3]];
  }
  return true;
}

/* ── Scripts: only the simple forms games use to pick pictures ── */
const SCENE_JS_TOKEN = new RegExp([
  String.raw`\$gameSwitches\s*(?:\.value\(\s*(\d+)\s*\)|\._data\[\s*(\d+)\s*\])`,   // 1, 2
  String.raw`\$gameVariables\s*(?:\.value\(\s*(\d+)\s*\)|\._data\[\s*(\d+)\s*\])`,  // 3, 4
  String.raw`\$gameScreen\.picture\(\s*(\d+)\s*\)`,                                  // 5
  String.raw`(-?\d+(?:\.\d+)?)`,                                                     // 6
  String.raw`'([^'\\]*)'|"([^"\\]*)"`,                                               // 7, 8
  String.raw`(true|false)\b`,                                                        // 9
  String.raw`(===|!==|==|!=|>=|<=|>|<|&&|\|\||!|\(|\))`,                             // 10
].join('|'), 'y');

function sceneJsTokens(src) {
  const out = [];
  let i = 0;
  src = src.trim().replace(/;$/, '');
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    SCENE_JS_TOKEN.lastIndex = i;
    const m = SCENE_JS_TOKEN.exec(src);
    if (!m) return null;
    i = SCENE_JS_TOKEN.lastIndex;
    if (m[1] || m[2]) out.push({ sw: +(m[1] || m[2]) });
    else if (m[3] || m[4]) out.push({ v: +(m[3] || m[4]) });
    else if (m[5]) out.push({ pic: m[5] });
    else if (m[6] !== undefined) out.push({ lit: +m[6] });
    else if (m[7] !== undefined || m[8] !== undefined) out.push({ lit: m[7] !== undefined ? m[7] : m[8] });
    else if (m[9]) out.push({ lit: m[9] === 'true' });
    else out.push({ op: m[10] });
  }
  return out;
}

const SCENE_JS_CMP = { '==': 0, '===': 0, '>=': 1, '<=': 2, '>': 3, '<': 4, '!=': 5, '!==': 5 };
const SCENE_JS_NOT = [5, 4, 3, 2, 1, 0];          // the opposite check
const SCENE_JS_FLIP = [0, 2, 1, 4, 3, 5];         // a OP b → b OP' a

// A script condition as a tree: { or / and: [...] }, { not }, { sw }, { pic }, { lit },
// or a comparison { v, cmp, rhs, left } (the variable on the left). null: unreadable.
function sceneJsParse(src) {
  const t = sceneJsTokens(src);
  if (!t || !t.length) return null;
  let k = 0;
  const peek = () => t[k] && t[k].op;
  function expr() {
    const parts = [and()];
    while (peek() === '||') { k++; parts.push(and()); }
    return parts.length > 1 ? { or: parts } : parts[0];
  }
  function and() {
    const parts = [unary()];
    while (peek() === '&&') { k++; parts.push(unary()); }
    return parts.length > 1 ? { and: parts } : parts[0];
  }
  function unary() {
    if (peek() === '!') { k++; return { not: unary() }; }
    if (peek() === '(') { k++; const e = expr(); if (peek() !== ')') throw 0; k++; return e; }
    const a = t[k++];
    if (!a || a.op) throw 0;
    const op = peek();
    if (!(op in SCENE_JS_CMP)) return a;
    k++;
    const b = t[k++];
    if (!b || b.op) throw 0;
    const loose = op.length === 2;
    if (a.v === undefined && b.v !== undefined) return { v: b.v, cmp: SCENE_JS_FLIP[SCENE_JS_CMP[op]], rhs: a, left: b, loose };
    return { v: a.v, cmp: SCENE_JS_CMP[op], rhs: b, left: a, loose };
  }
  try {
    const e = expr();
    return k === t.length ? e : null;
  } catch { return null; }
}

// One switch or variable check → Conditional Branch params, so an unknown one is tried
// both ways and remembered like the editor's own checks; else null.
function sceneJsNative(e, neg) {
  if (e.not) return sceneJsNative(e.not, !neg);
  if (e.sw !== undefined) return [0, e.sw, neg ? 1 : 0];
  if (e.cmp !== undefined && e.v !== undefined) {
    const cmp = neg ? SCENE_JS_NOT[e.cmp] : e.cmp;
    if (e.rhs.lit !== undefined) return [1, e.v, 0, e.rhs.lit, cmp];
    if (e.rhs.v !== undefined) return [1, e.v, 1, e.rhs.v, cmp];
  }
  return null;
}

// A value in a condition, null while unknown.
function sceneJsValueOf(st, a) {
  if (a.lit !== undefined) return a.lit;
  if (a.v !== undefined) return a.v in st.vars ? st.vars[a.v] : null;
  if (a.sw !== undefined) return a.sw in st.sw ? st.sw[a.sw] : null;
  if (a.pic !== undefined) return !!st.pics[a.pic];
  return null;
}

// true / false, or null when it depends on a value not known yet.
function sceneJsEval(st, e) {
  if (e.or || e.and) {
    const any = !!e.or;
    let unknown = false;
    for (const x of e.or || e.and) {
      const r = sceneJsEval(st, x);
      if (r === null) unknown = true;
      else if (r === any) return any;
    }
    return unknown ? null : !any;
  }
  if (e.not) { const r = sceneJsEval(st, e.not); return r === null ? null : !r; }
  if (e.cmp !== undefined) {
    const a = sceneJsValueOf(st, e.left), b = sceneJsValueOf(st, e.rhs);
    if (a === null || b === null) return null;
    const eq = e.loose ? a == b : a === b;
    return [eq, a >= b, a <= b, a > b, a < b, !eq][e.cmp];
  }
  const r = sceneJsValueOf(st, e);
  return r === null ? null : !!r;
}

// Script condition (111 [12, script]): true / false, Conditional Branch params for one
// unknown check, or true when it cannot be read (like before).
function sceneScriptCondition(st, src) {
  const e = sceneJsParse(src);
  if (!e) return true;
  const r = sceneJsEval(st, e);
  if (r !== null) return r;
  return sceneJsNative(e) || true;
}

// One script value: a literal, a variable or a switch (undefined: unknown or unreadable).
function sceneJsValue(st, src) {
  const t = sceneJsTokens(src);
  if (!t || t.length !== 1 || t[0].op) return undefined;
  const a = t[0];
  if (a.lit !== undefined) return a.lit;
  if (a.v !== undefined) return st.vars[a.v];
  if (a.sw !== undefined) return st.sw[a.sw];
  return undefined;
}

function sceneSetVar(st, id, op, src) {
  const v = sceneJsValue(st, src), cur = st.vars[id];
  if (v === undefined) delete st.vars[id];
  else if (op === '=') st.vars[id] = v;
  else if (typeof v === 'number' && typeof cur === 'number') st.vars[id] = op === '+=' ? cur + v : cur - v;
  else delete st.vars[id];
}

// Runs the statements of a Script command (355 + 655 lines) that we can follow.
// Returns true when the pictures changed.
function sceneScript(st, src) {
  let changed = false;
  const erase = id => { if (st.pics[id]) { delete st.pics[id]; changed = true; } };
  src = src.replace(/for\s*\(\s*(?:var|let)\s+(\w+)\s*=\s*(\d+)\s*;\s*\1\s*(<=?)\s*(\d+)\s*;\s*(?:\1\s*\+\+|\+\+\s*\1|\1\s*\+=\s*1)\s*\)\s*\{?\s*\$gameScreen\.erasePicture\(\s*\1\s*\)\s*;?\s*\}?/g,
    (_, v, a, op, b) => {
      const last = op === '<' ? +b - 1 : +b;
      for (const id of Object.keys(st.pics)) if (+id >= +a && +id <= last) erase(id);
      return ';';
    });
  for (const raw of src.split(/[;\n]/)) {
    const s = raw.trim();
    let m;
    if (!s || s.startsWith('//')) continue;
    if ((m = s.match(/^\$gameScreen\.erasePicture\((.+)\)$/))) {
      const id = sceneJsValue(st, m[1]);
      if (typeof id === 'number') erase(id);
    } else if ((m = s.match(/^\$gameScreen\.showPicture\((.+)\)$/))) {
      const a = m[1].split(',').map(x => sceneJsValue(st, x));
      if (a.length >= 9 && typeof a[0] === 'number' && typeof a[1] === 'string' && a.slice(2, 9).every(x => typeof x === 'number')) {
        if (a[1]) st.pics[a[0]] = Object.assign({ name: a[1], dur: 0 }, scenePlace([a[0], a[1], a[2], 0, a[3], a[4], a[5], a[6], a[7], a[8]]));
        else delete st.pics[a[0]];
        changed = true;
      }
    } else if ((m = s.match(/^\$gameVariables\.setValue\(\s*(\d+)\s*,(.+)\)$/))) sceneSetVar(st, +m[1], '=', m[2]);
    else if ((m = s.match(/^\$gameVariables\._data\[\s*(\d+)\s*\]\s*([-+]?=)(?!=)(.+)$/))) sceneSetVar(st, +m[1], m[2], m[3]);
    else if ((m = s.match(/^\$gameSwitches\.setValue\(\s*(\d+)\s*,(.+)\)$/) || s.match(/^\$gameSwitches\._data\[\s*(\d+)\s*\]\s*=(?!=)(.+)$/))) {
      const v = sceneJsValue(st, m[2]);
      if (typeof v === 'boolean') st.sw[+m[1]] = v;
      else delete st.sw[+m[1]];
    } else {
      // A change we cannot follow (inside an if, a computed value …): the value is unknown.
      for (const x of s.matchAll(/\$gameVariables(?:\.setValue\(\s*(\d+)|\._data\[\s*(\d+)\s*\]\s*[-+*\/%]?=(?!=))/g)) delete st.vars[x[1] || x[2]];
      for (const x of s.matchAll(/\$gameSwitches(?:\.setValue\(\s*(\d+)|\._data\[\s*(\d+)\s*\]\s*=(?!=))/g)) delete st.sw[x[1] || x[2]];
    }
  }
  return changed;
}

/* ── PictureVariableSetting (Triacontane), the usual picture plugin ──
   P_VARIABLE_VALID: picture numbers name a variable that holds the number;
   P_TARGET_ALL / P_TARGET_RANGE a b / P_TARGET_MULTI a,b: the next picture command
   applies to those pictures; P_D_FILENAME name\V[n]: the next Show Picture without a
   file uses that name. */
function scenePluginCommand(st, text) {
  const a = String(text || '').trim().split(/\s+/), cmd = (a[0] || '').toUpperCase();
  const num = x => { const m = String(x).match(/^\\v\[(\d+)\]$/i); return m ? st.vars[m[1]] : +x; };
  if (cmd === 'P_VARIABLE_VALID') st.picVar = true;
  else if (cmd === 'P_VARIABLE_INVALID') st.picVar = false;
  else if (cmd === 'P_TARGET_ALL') st.target = { all: true };
  else if (cmd === 'P_TARGET_RANGE') st.target = { from: num(a[1]), to: num(a[2]) };
  else if (cmd === 'P_TARGET_MULTI') st.target = { ids: String(a[1] || '').split(',').map(num) };
  else if (cmd === 'P_D_FILENAME') st.dname = a.slice(1).join(' ');
}

// The picture number a command means (P_VARIABLE_VALID: the variable's value, when known).
function scenePicId(st, id) {
  return st.picVar && typeof st.vars[id] === 'number' ? st.vars[id] : id;
}

// The pictures a Move / Erase Picture applies to (P_TARGET_* applies once).
function scenePicTargets(st, id) {
  const t = st.target;
  st.target = null;
  if (!t) return [scenePicId(st, id)];
  return Object.keys(st.pics).map(Number).filter(n =>
    t.all || (t.ids ? t.ids.indexOf(n) >= 0 : n >= t.from && n <= t.to));
}

// A Show Picture's file: P_D_FILENAME's (its \V[n] filled in) when the command has none.
function scenePicName(st, name) {
  if (name || st.dname === null) return name;
  const d = st.dname;
  st.dname = null;
  let unknown = false;
  const out = d.replace(/\\v\[(\d+)\]/gi, (_, n) => { if (st.vars[n] === undefined) unknown = true; return st.vars[n]; });
  return unknown ? '' : out;
}

function sceneAudio(a) {
  return a && a.name ? { name: a.name, volume: a.volume == null ? 90 : a.volume, pitch: a.pitch || 100 } : null;
}

// Show Picture (231) / Move Picture (232): [id, name, origin, designation, x, y, scaleX, scaleY, opacity, blend, …].
// Coordinates held in variables (designation 1): their value when known, else 0.
function scenePlace(p, st) {
  const at = k => !p[3] ? (+p[k] || 0) : (st && typeof st.vars[p[k]] === 'number' ? st.vars[p[k]] : 0);
  return {
    origin: p[2] || 0,
    x: at(4),
    y: at(5),
    sx: p[6] == null ? 100 : +p[6],
    sy: p[7] == null ? 100 : +p[7],
    opacity: p[8] == null ? 255 : +p[8],
    blend: p[9] || 0,
  };
}

// Text codes: actor names resolved, the speaker of "\n<Name>" (Yanfly message core)
// lifted out, HTML-like tags handled by textTags() (<br> = new line), every other
// control code (\C[2], \I[5], \., \| …) dropped.
function sceneText(str) {
  return textTags(str)
    .replace(/\\\\/g, '\u0000')
    .replace(/\\[Nn]\[(\d+)\]/g, (_, n) => (typeof S !== 'undefined' && S.actors[+n]) || '')
    .replace(/\\[Vv]\[(\d+)\]/g, '?')
    .replace(/\\[A-Za-z]+\[[^\]]*\]/g, '')
    .replace(/\\[A-Za-z]+<[^>]*>/g, '')
    .replace(/\\[.|!><^{}$]/g, '')
    .replace(/\\[A-Za-z]+/g, '')
    .replace(/\u0000/g, '\\');
}

// Show Text (101): [faceName, faceIndex, background, position, speakerName (MZ)].
function sceneMessage(p, lines) {
  let raw = lines.join('\n'), name = p[4] || '';
  const tag = raw.match(/\\n[cr]?<([^>]*)>/i);
  if (tag) { if (!name) name = tag[1]; raw = raw.replace(tag[0], '').replace(/^[ 	]+/, ''); }
  return {
    face: p[0] || '', faceIndex: p[1] || 0,
    background: p[2] || 0, position: p[3] == null ? 2 : p[3],
    name: sceneText(name).trim(),
    text: sceneText(raw).replace(/^\s*\n/, ''),
  };
}

function sceneSkipBranch(f, indent) {
  while (f.i < f.list.length && (f.list[f.i].indent || 0) > indent) f.i++;
}

// Runs until the next message and returns that step, or null at the end.
// How much a branch shows from here: its steps plus the different pictures in them
// (SCENE_LOOKAHEAD steps at most, taking the game's defaults on the way).
function sceneScore(t, getCommon) {
  const start = t.ran = SCENE_MAX_COMMANDS - SCENE_LOOKAHEAD_COMMANDS;
  const pics = new Set();
  let n = 0, s;
  while (n < SCENE_LOOKAHEAD && (s = sceneNext(t, getCommon, true))) {
    n++;
    for (const id in s.pics) pics.add(s.pics[id].name);
  }
  t.look.left -= Math.min(t.ran, SCENE_MAX_COMMANDS) - start;
  return n + pics.size;
}

// The option whose branch shows the most from here.
function sceneBestChoice(st, indent, count, fallback, getCommon) {
  let best = fallback, most = -1;
  for (let k = 0; k < count; k++) {
    const t = cloneSceneState(st);
    t.frames[t.frames.length - 1].branch[indent] = k;
    const n = sceneScore(t, getCommon);
    if (n > most || (n === most && k === fallback)) { best = k; most = n; }
  }
  return best;
}

// plain: take the game's default choices (used while looking ahead).
function sceneNext(st, getCommon, plain) {
  const sounds = [], anim = [];
  let changed = false, picsMoved = false;
  const frame = wait => {   // the pictures stay like this for `wait` frames
    if (plain || !picsMoved || anim.length >= SCENE_MAX_FRAMES) return;
    anim.push({ pics: clonePics(st.pics), wait });
    picsMoved = false;
  };
  // While looking ahead (plain) only the pictures are read, right away: no copies.
  const step = (msg, choices) => plain ? { msg, choices, pics: st.pics } : ({
    msg, choices, sounds, anim: anim.length ? anim : null,
    pics: clonePics(st.pics), bgm: st.bgm, bgs: st.bgs, fade: st.fade,
    state: cloneSceneState(st),
  });
  // Show Choices (102): [choices, cancelType, defaultType, …]. The richest branch is
  // taken until the viewer picks another one (sceneChoose).
  const choicesOf = cmd => {
    const p = cmd.parameters || [], items = (p[0] || []).map(t => sceneText(t));
    const def = p[2] >= 0 && p[2] < items.length ? p[2] : 0;
    const chosen = plain || items.length < 2 ? def : sceneBestChoice(st, cmd.indent || 0, items.length, def, getCommon);
    const top = st.frames[st.frames.length - 1];
    top.branch[cmd.indent || 0] = chosen;
    return { items, chosen, indent: cmd.indent || 0, frame: st.frames.length - 1 };
  };

  while (st.frames.length) {
    const f = st.frames[st.frames.length - 1];
    if (f.i >= f.list.length) { st.frames.pop(); continue; }
    if (++st.ran > SCENE_MAX_COMMANDS) { st.frames = []; break; }
    const cmd = f.list[f.i], p = cmd.parameters || [], ind = cmd.indent || 0;
    f.i++;
    switch (cmd.code) {
      case 101: {
        const lines = [];
        while (f.i < f.list.length && f.list[f.i].code === 401) lines.push(String(f.list[f.i++].parameters[0] ?? ''));
        const msg = sceneMessage(p, lines);
        let choices = null;
        if (f.i < f.list.length && f.list[f.i].code === 102) choices = choicesOf(f.list[f.i++]);
        return step(msg, choices);
      }
      case 105: {   // Scrolling text
        const lines = [];
        while (f.i < f.list.length && f.list[f.i].code === 405) lines.push(String(f.list[f.i++].parameters[0] ?? ''));
        return step({ face: '', faceIndex: 0, background: 1, position: 1, name: '', text: sceneText(lines.join('\n')), scroll: true }, null);
      }
      case 102: return step(null, choicesOf(cmd));
      case 402: if (f.branch[ind] !== p[0]) sceneSkipBranch(f, ind); break;
      case 403: sceneSkipBranch(f, ind); break;   // "When Cancel": never taken
      case 111: {
        const q = p[0] === 4 ? sceneActorCondition(st, p) : p[0] === 12 ? sceneScriptCondition(st, String(p[1] || '')) : p;
        let r = typeof q === 'boolean' ? q : sceneCondition(st, q);
        if (r === null) r = plain || st.look.left <= 0 ? sceneAssume(st, q, true) : sceneBestCondition(st, q, ind, getCommon);
        f.branch[ind] = r;
        if (!r) sceneSkipBranch(f, ind);
        break;
      }
      case 121: for (let id = p[0]; id <= p[1]; id++) st.sw[id] = p[2] === 0; break;
      case 122: sceneControlVariables(st, p); break;
      case 123: st.sw['self:' + p[0]] = p[1] === 0; break;
      case 411: if (f.branch[ind] !== false) sceneSkipBranch(f, ind); break;
      case 113: {   // Break Loop: past the matching Repeat Above
        let depth = 0;
        while (f.i < f.list.length) {
          const c = f.list[f.i++];
          if (c.code === 112) depth++;
          else if (c.code === 413) { if (depth > 0) depth--; else break; }
        }
        break;
      }
      case 115: f.i = f.list.length; break;   // Exit Event Processing
      case 117: {
        const list = getCommon && getCommon(p[0]);
        if (list && st.frames.length < SCENE_MAX_DEPTH) st.frames.push(sceneFrame(list));
        break;
      }
      case 119: {
        const to = f.list.findIndex(c => c.code === 118 && c.parameters && c.parameters[0] === p[0]);
        if (to < 0) break;
        if (to >= f.i) { f.i = to + 1; break; }                 // forward: always
        if (!f.jumps[p[0]]) { f.jumps[p[0]] = 1; f.i = to + 1; } // backward: once
        break;
      }
      case 221: st.fade = true; changed = true; break;
      case 222: st.fade = false; changed = true; break;
      case 231: {   // an empty name clears the picture, like the game
        const id = scenePicId(st, p[0]), name = scenePicName(st, p[1]);
        if (name) st.pics[id] = Object.assign({ name, dur: 0 }, scenePlace(p, st));
        else delete st.pics[id];
        changed = picsMoved = true;
        break;
      }
      case 232: {   // Move Picture: […, duration (frames), wait]
        let moved = false;
        for (const id of scenePicTargets(st, p[0])) {
          if (!st.pics[id]) continue;
          Object.assign(st.pics[id], scenePlace(p, st), { dur: +p[10] || 0 });
          moved = true;
        }
        if (!moved) break;
        changed = picsMoved = true;
        if (p[11]) frame(+p[10] || 0);
        break;
      }
      case 233: case 234: st.target = null; break;   // rotate / tint: not shown, but they use the targets up
      case 235:
        for (const id of scenePicTargets(st, p[0])) delete st.pics[id];
        changed = picsMoved = true;
        break;
      case 355: {   // Script (+ 655 lines)
        const lines = [String(p[0] ?? '')];
        while (f.i < f.list.length && f.list[f.i].code === 655) lines.push(String(f.list[f.i++].parameters[0] ?? ''));
        if (sceneScript(st, lines.join('\n'))) changed = picsMoved = true;
        break;
      }
      case 356: scenePluginCommand(st, p[0]); break;
      case 129: {   // Change Party Member: [actorId, 0 add / 1 remove, initialize]
        const party = sceneParty(st).filter(id => id !== p[0]);
        if (p[1] === 0) party.push(p[0]);
        st.party = party;
        break;
      }
      case 313: case 318:   // Change State / Skill: [0 fixed / 1 variable, actorId, 0 add / 1 remove, id]
        if (p[0] === 0 && p[1] > 0) st.sw[(cmd.code === 313 ? 'state:' : 'skill:') + p[1] + ':' + p[3]] = p[2] === 0;
        break;
      case 319: {   // Change Equipment: [actorId, equipment type, item id]; type n is slot n-1
        const a = sceneActorEdit(st, p[0]);
        if (a && p[1] > 0) a.equips[p[1] - 1] = p[2];
        break;
      }
      case 320: { const a = sceneActorEdit(st, p[0]); if (a) a.name = String(p[1] ?? ''); break; }   // Change Name
      case 230: frame(+p[0] || 0); break;
      case 241: st.bgm = sceneAudio(p[0]); break;
      case 242: st.bgm = null; break;
      case 243: st.savedBgm = st.bgm; break;
      case 244: st.bgm = st.savedBgm; break;
      case 245: st.bgs = sceneAudio(p[0]); break;
      case 246: st.bgs = null; break;
      case 249: case 250: {
        const a = sceneAudio(p[0]);
        if (a) { sounds.push(Object.assign({ kind: cmd.code === 249 ? 'me' : 'se', at: anim.length }, a)); changed = true; }
        break;
      }
      case 251: sounds.push({ kind: 'se', stop: true, at: anim.length }); break;   // Stop SE
    }
  }
  // After the last message: a closing picture or sound still gets its own step.
  return changed ? step(null, null) : null;
}

function sceneRun(st, getCommon) {
  const steps = [];
  let s;
  while (steps.length < SCENE_MAX_STEPS && (s = sceneNext(st, getCommon))) steps.push(s);
  return steps;
}

function sceneTimeline(list, getCommon) {
  return sceneRun(sceneState(list), getCommon);
}

// The viewer picked choice k at step i: the timeline from there follows that branch.
function sceneChoose(steps, i, k, getCommon) {
  const step = steps[i], c = step.choices;
  if (!c || k < 0 || k >= c.items.length) return steps;
  const st = cloneSceneState(step.state);
  st.look = { left: SCENE_LOOKAHEAD_BUDGET };
  st.frames[c.frame].branch[c.indent] = k;
  const picked = Object.assign({}, step, { choices: Object.assign({}, c, { chosen: k }) });
  return steps.slice(0, i).concat([picked], sceneRun(st, getCommon));
}
