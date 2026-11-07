import { test } from 'node:test';
import assert from 'node:assert/strict';
import { c, load, plain } from './helpers.mjs';

function setup(commons = {}) {
  const run = load(['scenes.js', 'scene-script.js']);
  run(`var S = { actors: ['', 'Harold'], variables: [], switches: [], commonEvents: [], maps: new Map() }`);
  run('globalThis').__commons = commons;
  const timeline = list => plain(run('sceneTimeline')(list, id => commons[id] || null));
  return { run, timeline };
}

const pic = (id, name, x = 0, y = 0) => c(231, 0, [id, name, 0, 0, x, y, 100, 100, 255, 0]);
const say = (lines, indent = 0, head = ['', 0, 0, 2]) => [c(101, indent, head), ...lines.map(l => c(401, indent, [l]))];
const lines = steps => steps.map(s => s.msg ? s.msg.text : null);

test('one step per message, holding the pictures shown so far', () => {
  const { timeline } = setup();
  const steps = timeline([
    pic(1, 'bg'), ...say(['Hello', 'there']),
    pic(2, 'girl', 400, 10), ...say(['Second']),
    c(235, 0, [1]), ...say(['Third']), c(0, 0),
  ]);
  assert.deepEqual(lines(steps), ['Hello\nthere', 'Second', 'Third']);
  assert.deepEqual(Object.keys(steps[0].pics), ['1']);
  assert.deepEqual(Object.keys(steps[1].pics).sort(), ['1', '2']);
  assert.equal(steps[1].pics[2].x, 400);
  assert.deepEqual(Object.keys(steps[2].pics), ['2']);
});

test('move picture updates place, music carries over, sounds belong to their step', () => {
  const { timeline } = setup();
  const steps = timeline([
    c(241, 0, [{ name: 'Theme', volume: 50, pitch: 100, pan: 0 }]),
    pic(1, 'cg'), ...say(['A']),
    c(232, 0, [1, 0, 1, 0, 300, 200, 50, 50, 128, 0, 30, true]),
    c(250, 0, [{ name: 'Slap', volume: 90, pitch: 100, pan: 0 }]), ...say(['B']),
    c(242, 0, [1]), ...say(['C']),
  ]);
  assert.equal(steps[0].bgm.name, 'Theme');
  assert.deepEqual(steps[0].sounds, []);
  assert.deepEqual(steps[1].sounds.map(s => [s.kind, s.name]), [['se', 'Slap']]);
  assert.deepEqual([steps[1].pics[1].origin, steps[1].pics[1].x, steps[1].pics[1].sx, steps[1].pics[1].opacity], [1, 300, 50, 128]);
  assert.equal(steps[0].pics[1].x, 0, 'earlier steps keep their own copy');
  assert.equal(steps[2].bgm, null);
});

test('Stop SE travels with the step sounds, after the sounds before it', () => {
  const { timeline } = setup();
  const steps = timeline([
    c(250, 0, [{ name: 'Rain', volume: 90, pitch: 100, pan: 0 }]), ...say(['A']),
    c(251, 0, []), c(249, 0, [{ name: 'Fanfare', volume: 90, pitch: 100, pan: 0 }]), ...say(['B']),
  ]);
  assert.deepEqual(steps[0].sounds.map(s => [s.kind, s.name]), [['se', 'Rain']]);
  assert.deepEqual(steps[1].sounds.map(s => [s.kind, s.stop ? 'stop' : s.name]), [['se', 'stop'], ['me', 'Fanfare']]);
});

test('picture changes split by waits become animation frames, sounds keep their frame', () => {
  const { timeline } = setup();
  const se = name => c(250, 0, [{ name, volume: 90, pitch: 100, pan: 0 }]);
  const steps = timeline([
    ...say(['Before']),
    pic(1, 'f1'), c(230, 0, [3]), se('pop'), pic(1, 'f2'), c(230, 0, [3]), pic(1, 'f3'),
    c(232, 0, [1, 0, 0, 0, 50, 0, 100, 100, 255, 0, 20, true]), se('end'),
    ...say(['After']),
  ]);
  assert.equal(steps[0].anim, null);
  assert.deepEqual(steps[1].anim.map(f => [f.pics[1].name, f.pics[1].x, f.wait]), [['f1', 0, 3], ['f2', 0, 3], ['f3', 50, 20]]);
  assert.equal(steps[1].anim[2].pics[1].dur, 20);
  assert.deepEqual(steps[1].sounds.map(x => [x.name, x.at]), [['pop', 1], ['end', 3]]);
  assert.equal(steps[1].pics[1].name, 'f3');
});

test('speaker from MZ name or \\n<Name>, text codes resolved or dropped', () => {
  const { timeline } = setup();
  const steps = timeline([
    ...say(['\\n<Yuri> Hi \\C[2]\\N[1]\\C[0]!\\.', 'Got \\V[3] coins\\|'], 0),
    ...say(['Plain'], 0, ['Actor1', 5, 1, 0, 'Mia']),
  ]);
  assert.equal(steps[0].msg.name, 'Yuri');
  assert.equal(steps[0].msg.text, 'Hi Harold!\nGot ? coins');
  assert.deepEqual([steps[1].msg.name, steps[1].msg.face, steps[1].msg.faceIndex, steps[1].msg.background, steps[1].msg.position], ['Mia', 'Actor1', 5, 1, 0]);
});

const choiceScene = () => [
  ...say(['Pick one']),
  c(102, 0, [['Left', 'Right'], -1, 0, 2, 0]),
  c(402, 0, [0, 'Left']), ...say(['Went left'], 1), c(0, 1),
  c(402, 0, [1, 'Right']), ...say(['Went right'], 1), c(0, 1),
  c(404, 0),
  ...say(['The end']), c(0, 0),
];

test('a choice follows the default branch, and the viewer can pick another', () => {
  const { run } = setup();
  const steps = run('sceneTimeline')(choiceScene(), () => null);
  assert.deepEqual(lines(plain(steps)), ['Pick one', 'Went left', 'The end']);
  assert.deepEqual(plain(steps[0].choices.items), ['Left', 'Right']);
  const right = run('sceneChoose')(steps, 0, 1, () => null);
  assert.deepEqual(lines(plain(right)), ['Pick one', 'Went right', 'The end']);
  assert.equal(right[0].choices.chosen, 1);
  const back = run('sceneChoose')(right, 0, 0, () => null);
  assert.deepEqual(lines(plain(back)), ['Pick one', 'Went left', 'The end']);
});

test('"Skip the scene?" preselects the branch with the scene, not the skip', () => {
  const { timeline } = setup();
  const steps = timeline([
    c(102, 0, [['Skip', 'Watch'], 1, 0, 2, 0]),
    c(402, 0, [0, 'Skip']), ...say(['Skipped.'], 1), c(0, 1),
    c(402, 0, [1, 'Watch']), c(119, 1, ['scene']), c(0, 1),
    c(404, 0),
    c(115, 0),
    c(118, 0, ['scene']), pic(1, 'cg'), ...say(['One']), ...say(['Two']), ...say(['Three']), c(0, 0),
  ]);
  assert.equal(steps[0].choices.chosen, 1);
  assert.deepEqual(lines(steps), [null, 'One', 'Two', 'Three']);
});

test('conditions take the true branch, never the else', () => {
  const { timeline } = setup();
  const steps = timeline([
    c(111, 0, [0, 1, 0]), ...say(['Yes'], 1), c(0, 1),
    c(411, 0), ...say(['No'], 1), c(0, 1),
    c(412, 0), ...say(['After']), c(0, 0),
  ]);
  assert.deepEqual(lines(steps), ['Yes', 'After']);
});

test('an unknown variable is assumed once, then later checks are evaluated', () => {
  const { timeline } = setup();
  const ifVar = (id, value, op, text) => [c(111, 0, [1, id, 0, value, op]), ...say([text], 1), c(0, 1), c(412, 0)];
  const steps = timeline([
    ...ifVar(41, 24, 0, 'Day 24'), ...ifVar(41, 25, 0, 'Day 25'), ...ifVar(41, 20, 1, 'After the 20th'),
    c(121, 0, [5, 5, 1]), c(111, 0, [0, 5, 0]), ...say(['Switch on'], 1), c(0, 1), c(411, 0), ...say(['Switch off'], 1), c(0, 1), c(412, 0),
    c(122, 0, [9, 9, 0, 2, 3, 7]), c(122, 0, [9, 9, 1, 0, 2]),   // random 3..7 → 3, then +2
    ...ifVar(9, 5, 0, 'Five'), ...ifVar(9, 3, 0, 'Three'),
    c(0, 0),
  ]);
  assert.deepEqual(lines(steps), ['Day 24', 'After the 20th', 'Switch off', 'Five']);
});

test('an unknown check takes the answer that shows more: the bed plays its night scene', () => {
  const { timeline } = setup();
  const steps = timeline([
    c(111, 0, [1, 19, 0, 18, 2]), ...say(['Not sleepy yet.'], 1), c(0, 1), c(412, 0),
    c(111, 0, [1, 19, 0, 19, 1]), c(231, 1, [1, 'night', 0, 0, 0, 0, 100, 100, 255, 0]), ...say(['Night 1'], 1), ...say(['Night 2'], 1), c(0, 1), c(412, 0),
    c(111, 0, [1, 19, 0, 18, 2]), ...say(['Contradiction'], 1), c(0, 1), c(412, 0),
    c(0, 0),
  ]);
  assert.deepEqual(lines(steps), ['Night 1', 'Night 2']);
});

test('common events run inline; loops and backward jumps cannot run forever', () => {
  const { timeline } = setup({ 7: [pic(3, 'inner'), ...say(['Inside']), c(0, 0)] });
  const steps = timeline([
    c(117, 0, [7]),
    c(118, 0, ['top']), ...say(['Loop body']), c(119, 0, ['top']),
    c(112, 0), ...say(['Repeat'], 1), c(0, 1), c(413, 0),
    c(112, 0), c(113, 1), ...say(['Never'], 1), c(0, 1), c(413, 0),
    ...say(['Done']), c(0, 0),
  ]);
  assert.deepEqual(lines(steps), ['Inside', 'Loop body', 'Loop body', 'Repeat', 'Done']);
  assert.equal(steps[0].pics[3].name, 'inner');
});

test('a call to itself stops at the depth limit, and a closing picture gets a step', () => {
  const commons = {};
  commons[1] = [...say(['Again']), c(117, 0, [1]), c(0, 0)];
  const { timeline } = setup(commons);
  assert.equal(timeline([c(117, 0, [1])]).length, 19, 'the outer list + 19 nested calls = SCENE_MAX_DEPTH frames');
  assert.deepEqual(lines(timeline([...say(['Text']), pic(1, 'ending')])), ['Text', null]);
  assert.deepEqual(timeline([c(121, 0, [1, 1, 0])]), []);
});

test('sceneStats / isSceneList: pictures with dialogue make a scene', () => {
  const { run } = setup();
  const scene = [pic(1, 'a'), pic(2, 'b'), ...say(['1']), ...say(['2']), ...say(['3'])];
  assert.deepEqual(plain(run('sceneStats')(scene)), { pictures: 2, messages: 3, sounds: 0 });
  assert.equal(run('isSceneList')(scene), true);
  assert.equal(run('isSceneList')(scene.slice(1)), false);
  run(`S.commonEvents = [{ id: 4, name: 'CG', list: ${JSON.stringify(scene)} }, { id: 5, name: 'Heal', list: [] }];
       S.maps.set(2, { mapId: 2, mapName: 'Room', events: [{ id: 9, name: 'Bed', pages: [{ list: [] }, { list: ${JSON.stringify(scene)} }] }] });`);
  assert.deepEqual(plain(run('findScenes()')).map(s => [s.kind, s.evId, s.page, s.name, s.where]),
    [['common', 4, 0, 'CG', 'Common'], ['map', 9, 1, 'Bed · p2', 'Room']]);
});

const ids = step => Object.keys(step.pics).sort((a, b) => a - b).map(Number);
const names = step => ids(step).map(id => step.pics[id].name);

test('pictures erased by a script or PictureVariableSetting do not stay on screen', () => {
  const { timeline } = setup();
  const steps = timeline([
    pic(1, 'bg'), pic(2, 'girl'), pic(50, 'ui'), ...say(['A']),
    c(355, 0, ['for(var i = 1; i <= 40; i++){$gameScreen.erasePicture(i)}']), pic(3, 'cg'), ...say(['B']),
    c(355, 0, ['$gameScreen.erasePicture(3);']), c(655, 0, ["$gameScreen.showPicture(4, 'next', 0, 10, 20, 100, 100, 255, 0);"]), ...say(['C']),
    pic(5, 'x'), pic(6, 'y'), c(356, 0, ['P_TARGET_RANGE 4 5']), c(235, 0, [1]), ...say(['D']),
    c(356, 0, ['P_TARGET_ALL']), c(235, 0, [1]), ...say(['E']),
  ]);
  assert.deepEqual(steps.map(names), [['bg', 'girl', 'ui'], ['cg', 'ui'], ['next', 'ui'], ['y', 'ui'], []]);
  assert.equal(steps[2].pics[4].x, 10);
});

test('outfit layers chosen by a script variable: one outfit, not all of them', () => {
  const { timeline } = setup();
  const layer = (outfit, name) => [c(111, 0, [12, `$gameVariables._data[266] == '${outfit}'`]), c(231, 1, [2, name, 0, 0, 0, 0, 100, 100, 255, 0]), c(0, 1), c(412, 0)];
  const steps = timeline([
    pic(1, 'body'), ...layer('NAKED', 'none'), ...layer('NORMAL', 'dress'), ...layer('SWIM', 'swimsuit'), ...say(['Hi']),
    c(355, 0, ["$gameVariables._data[266] = 'SWIM'"]), ...layer('NAKED', 'none'), ...layer('NORMAL', 'dress'), ...layer('SWIM', 'swimsuit'), ...say(['Beach']),
  ]);
  assert.equal(steps[0].pics[2].name, 'none', 'an unknown value is assumed once, then kept');
  assert.equal(steps[1].pics[2].name, 'swimsuit', 'a value set by a script is followed');
});

test('script conditions: switches, comparisons, shown pictures, && and ||', () => {
  const { timeline } = setup();
  const when = (script, text) => [c(111, 0, [12, script]), ...say([text], 1), c(0, 1), c(412, 0)];
  const steps = timeline([
    c(355, 0, ['$gameSwitches.setValue(3, true); $gameVariables.setValue(7, 12)']), pic(9, 'cg'),
    ...when('$gameSwitches.value(3)', 'sw on'),
    ...when('!$gameSwitches.value(3)', 'sw off'),
    ...when('$gameVariables.value(7) >= 10 && $gameVariables.value(7) < 20', 'teen'),
    ...when('$gameVariables.value(7) == 1 || $gameScreen.picture(9)', 'or'),
    ...when('$gameScreen.picture(8)', 'no pic'),
    ...when('Math.random() < 0.5', 'unreadable: true'),
  ]);
  assert.deepEqual(lines(steps), ['sw on', 'teen', 'or', 'unreadable: true']);
});

test('actor checks use the starting equipment, name and party, changed by the scene', () => {
  const { run, timeline } = setup();
  run(`S.actorStart = [null, { name: 'Harold', classId: 2, equips: [1, 0, 0, 5, 0] }]; S.party = [1];`);
  const ifActor = (kind, operand, name) => [c(111, 0, [4, 1, kind, operand]), c(231, 1, [2, name, 0, 0, 0, 0, 100, 100, 255, 0]), c(0, 1), c(412, 0)];
  const outfits = [...ifActor(5, 5, 'robe'), ...ifActor(5, 6, 'armor'), ...ifActor(5, 7, 'bikini')];
  const steps = timeline([
    ...outfits, ...say(['Start']),
    c(319, 0, [1, 4, 7]), ...outfits, ...say(['Changed']),
    ...ifActor(1, 'Harold', 'named'), ...say(['Name']),
    ...ifActor(6, 3, 'poisoned'), c(129, 0, [1, 1, false]), ...ifActor(0, 0, 'in party'), ...say(['Left']),
  ]);
  assert.deepEqual(steps.map(s => s.pics[2] && s.pics[2].name), ['robe', 'bikini', 'named', 'named']);
});

test('PictureVariableSetting: picture numbers from variables, file names with \\V[n]', () => {
  const { timeline } = setup();
  const steps = timeline([
    c(122, 0, [20, 20, 0, 0, 7]), c(122, 0, [21, 21, 0, 0, 3]),
    c(356, 0, ['P_VARIABLE_VALID']), pic(20, 'face'), c(356, 0, ['P_VARIABLE_INVALID']),
    c(356, 0, ['P_D_FILENAME stand_\\V[21]']), pic(1, ''), ...say(['A']),
  ]);
  assert.deepEqual(ids(steps[0]), [1, 7]);
  assert.equal(steps[0].pics[1].name, 'stand_3');
});
