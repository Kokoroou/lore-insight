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
   - loops (112/413) run once, backward label jumps (119) once, calls (117) inline.
   Picture changes split by waits (230, or a Move Picture that waits) are kept as the
   step's ANIMATION frames ({ pics, wait } in 1/60 s), played before its message; each
   sound remembers the frame it starts on (at). */
const SCENE_MAX_STEPS = 5000;
const SCENE_MAX_COMMANDS = 300000;
const SCENE_MAX_DEPTH = 20;
const SCENE_LOOKAHEAD = 400;            // steps tried ahead per option
const SCENE_LOOKAHEAD_COMMANDS = 20000;
const SCENE_MAX_FRAMES = 240;           // animation frames kept per step

function sceneState(list) {
  return { frames: [sceneFrame(list)], pics: {}, bgm: null, bgs: null, savedBgm: null, fade: false, ran: 0, sw: {}, vars: {}, ne: {} };
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
    pics: clonePics(st.pics), bgm: st.bgm, bgs: st.bgs, savedBgm: st.savedBgm, fade: st.fade, ran: st.ran,
    sw: Object.assign({}, st.sw), vars: Object.assign({}, st.vars), ne: Object.assign({}, st.ne),
  };
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
    const rhs = p[2] === 0 ? +p[3] : st.vars[p[3]];
    const cmp = SCENE_COMPARE[p[4]];
    if (rhs === undefined || !cmp) return true;
    if (p[1] in st.vars) return cmp(st.vars[p[1]], rhs);
    if (st.ne[p[1] + ':' + rhs]) return p[4] === 5;          // known "!= rhs"
    return SCENE_SATISFY[p[4]](rhs) === null ? true : null;   // "!=" on an unknown: true
  }
  return true;
}

// Remember the answer taken for an unknown value, so later checks agree with it.
function sceneAssume(st, p, truth) {
  if (p[0] === 0 || p[0] === 2) {
    st.sw[p[0] === 0 ? p[1] : 'self:' + p[1]] = (p[2] === 0) === truth;
  } else if (p[0] === 1) {
    const rhs = p[2] === 0 ? +p[3] : st.vars[p[3]];
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

function sceneAudio(a) {
  return a && a.name ? { name: a.name, volume: a.volume == null ? 90 : a.volume, pitch: a.pitch || 100 } : null;
}

// Show Picture (231) / Move Picture (232): [id, name, origin, designation, x, y, scaleX, scaleY, opacity, blend, …].
// Coordinates held in variables (designation 1) are unknown here: 0.
function scenePlace(p) {
  const direct = !p[3];
  return {
    origin: p[2] || 0,
    x: direct ? (+p[4] || 0) : 0,
    y: direct ? (+p[5] || 0) : 0,
    sx: p[6] == null ? 100 : +p[6],
    sy: p[7] == null ? 100 : +p[7],
    opacity: p[8] == null ? 255 : +p[8],
    blend: p[9] || 0,
  };
}

// Text codes: actor names resolved, the speaker of "\n<Name>" (Yanfly message core)
// lifted out, every other control code (\C[2], \I[5], \., \| …) dropped.
function sceneText(str) {
  return String(str || '')
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
  t.ran = SCENE_MAX_COMMANDS - SCENE_LOOKAHEAD_COMMANDS;
  const pics = new Set();
  let n = 0, s;
  while (n < SCENE_LOOKAHEAD && (s = sceneNext(t, getCommon, true))) {
    n++;
    for (const id in s.pics) pics.add(s.pics[id].name);
  }
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
        let r = sceneCondition(st, p);
        if (r === null) r = plain ? sceneAssume(st, p, true) : sceneBestCondition(st, p, ind, getCommon);
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
      case 231:   // an empty name clears the picture, like the game
        if (p[1]) st.pics[p[0]] = Object.assign({ name: p[1], dur: 0 }, scenePlace(p));
        else delete st.pics[p[0]];
        changed = picsMoved = true;
        break;
      case 232:   // Move Picture: […, duration (frames), wait]
        if (!st.pics[p[0]]) break;
        Object.assign(st.pics[p[0]], scenePlace(p), { dur: +p[10] || 0 });
        changed = picsMoved = true;
        if (p[11]) frame(+p[10] || 0);
        break;
      case 235: delete st.pics[p[0]]; changed = picsMoved = true; break;
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
  st.frames[c.frame].branch[c.indent] = k;
  const picked = Object.assign({}, step, { choices: Object.assign({}, c, { chosen: k }) });
  return steps.slice(0, i).concat([picked], sceneRun(st, getCommon));
}
