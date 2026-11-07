import assert from 'node:assert/strict';
import { test } from 'node:test';
import { c, load, plain } from './helpers.mjs';

const get = load(['constants.js', 'parser.js', 'state.js']);
const { parseEventPage, parseMapJson, parseCommonEvents, describeCondition, resolveTextCodes, S, VISIBLE_CODES } =
  get('({ parseEventPage, parseMapJson, parseCommonEvents, describeCondition, resolveTextCodes, S, VISIBLE_CODES })');

const parse = list => plain(parseEventPage(list, 'p'));
const edge = (edges, source, target) => edges.find(e => e.source === source && e.target === target);

function reset() {
  S.actors = ['', 'Harold'];
  S.variables = ['', 'Gold Count'];
  S.switches = ['', 'Met King', 'Door Open'];
}

test('an empty list gives an empty graph', () => {
  assert.deepEqual(parse([]), { nodes: [], edges: [] });
  assert.deepEqual(parse([c(0, 0)]), { nodes: [], edges: [] });
});

test('Show Text collects its 401 lines into one dialogue node (MZ speaker in parameters[4])', () => {
  const list = [
    c(101, 0, ['Actor1', 0, 0, 2, 'Harold']),
    c(401, 0, ['Hello.']),
    c(401, 0, ['How are you?']),
    c(0, 0),
  ];
  const { nodes, edges } = parse(list);
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0], {
    id: 'p_0', type: 'dialogue', speaker: 'Harold', faceFile: 'Actor1',
    lines: ['Hello.', 'How are you?'], listStart: 0, listEnd: 3,
  });
  assert.deepEqual(edges, []);
});

test('MV Show Text has no inline speaker', () => {
  const { nodes } = parse([c(101, 0, ['', 0, 0, 2]), c(401, 0, ['Hi'])]);
  assert.equal(nodes[0].speaker, '');
  assert.equal(nodes[0].faceFile, '');
});

test('consecutive nodes are chained in order; unknown commands are skipped', () => {
  const { nodes, edges } = parse([
    c(101, 0, ['']), c(401, 0, ['A']),
    c(230, 0, [60]),                     // Wait: not drawn
    c(101, 0, ['']), c(401, 0, ['B']),
  ]);
  assert.deepEqual(nodes.map(n => n.lines[0]), ['A', 'B']);
  assert.deepEqual(edges, [{ source: 'p_0', target: 'p_1' }]);
});

test('Show Choices: one edge per branch labelled with the choice text, empty choices dropped', () => {
  const list = [
    c(102, 0, [['Yes', '', 'No'], 1]),
    c(402, 0, [0, 'Yes']),
    c(101, 1, ['']), c(401, 1, ['Great']),
    c(0, 1),
    c(402, 0, [2, 'No']),
    c(101, 1, ['']), c(401, 1, ['Too bad']),
    c(0, 1),
    c(404, 0),
    c(101, 0, ['']), c(401, 0, ['After']),
  ];
  const { nodes, edges } = parse(list);
  assert.deepEqual(nodes[0].choices, ['Yes', 'No']);
  assert.equal(nodes[0].type, 'choice');
  const [yes, no, after] = nodes.slice(1);
  assert.deepEqual([yes.lines, no.lines, after.lines], [['Great'], ['Too bad'], ['After']]);
  assert.equal(edge(edges, 'p_0', yes.id).label, 'Yes');
  // Index 2 of the original list, not of the list without the blank entry.
  assert.equal(edge(edges, 'p_0', no.id).label, 'No');
  // Branches diverge: the node after "End" is not chained to the choice.
  assert.equal(edges.some(e => e.target === after.id), false);
});

test('a branch whose choice text is missing falls back to the When text, then to its number', () => {
  const { edges } = parse([
    c(102, 0, [['', ''], 1]),
    c(402, 0, [0, 'From When']), c(118, 1, ['a']), c(0, 1),
    c(402, 0, [1]), c(118, 1, ['b']), c(0, 1),
    c(404, 0),
  ]);
  assert.deepEqual(edges.map(e => e.label), ['From When', 'Choice 2']);
});

test('a choice branch with no commands adds no edge', () => {
  const { nodes, edges } = parse([
    c(102, 0, [['A', 'B'], 1]),
    c(402, 0, [0, 'A']), c(0, 1),
    c(402, 0, [1, 'B']), c(101, 1, ['']), c(401, 1, ['b']), c(0, 1),
    c(404, 0),
  ]);
  assert.equal(nodes.length, 2);
  assert.deepEqual(edges.map(e => e.label), ['B']);
});

test('Conditional Branch: True and Else edges, switch name in the label', () => {
  reset();
  const list = [
    c(111, 0, [0, 1, 0]),
    c(101, 1, ['']), c(401, 1, ['Welcome back']),
    c(0, 1),
    c(411, 0),
    c(101, 1, ['']), c(401, 1, ['Who are you?']),
    c(0, 1),
    c(412, 0),
  ];
  const { nodes, edges } = parse(list);
  assert.equal(nodes[0].type, 'condition');
  assert.equal(nodes[0].label, 'If [Switch: Met King]');
  assert.deepEqual(nodes[0].params, [0, 1, 0]);
  assert.equal(edge(edges, 'p_0', nodes[1].id).label, 'True');
  assert.equal(edge(edges, 'p_0', nodes[2].id).label, 'Else');
});

test('Conditional Branch without Else only has a True edge', () => {
  reset();
  const { edges } = parse([
    c(111, 0, [0, 2, 0]), c(101, 1, ['']), c(401, 1, ['open']), c(0, 1), c(412, 0),
  ]);
  assert.deepEqual(edges.map(e => e.label), ['True']);
});

test('nested branches recurse one indent deeper', () => {
  reset();
  const list = [
    c(111, 0, [0, 1, 0]),
    c(102, 1, [['Left', 'Right'], 1]),
    c(402, 1, [0, 'Left']), c(101, 2, ['']), c(401, 2, ['L']), c(0, 2),
    c(402, 1, [1, 'Right']), c(101, 2, ['']), c(401, 2, ['R']), c(0, 2),
    c(404, 1),
    c(0, 1),
    c(412, 0),
  ];
  const { nodes, edges } = parse(list);
  assert.deepEqual(nodes.map(n => n.type), ['condition', 'choice', 'dialogue', 'dialogue']);
  assert.equal(edge(edges, 'p_0', 'p_1').label, 'True');
  assert.equal(edge(edges, 'p_1', 'p_2').label, 'Left');
  assert.equal(edge(edges, 'p_1', 'p_3').label, 'Right');
});

test('jumps resolve to their label as dashed back-edges, even when the label comes later', () => {
  const { nodes, edges } = parse([
    c(119, 0, ['end']),
    c(118, 0, ['start']),
    c(101, 0, ['']), c(401, 0, ['loop']),
    c(119, 0, ['start']),
    c(118, 0, ['end']),
  ]);
  assert.deepEqual(nodes.map(n => n.type), ['jump', 'label', 'dialogue', 'jump', 'label']);
  const jumps = edges.filter(e => e.isJump);
  assert.deepEqual(jumps, [
    { source: 'p_0', target: 'p_4', label: '↩ jump', isJump: true },
    { source: 'p_3', target: 'p_1', label: '↩ jump', isJump: true },
  ]);
});

test('a jump to a missing label stays as a node without a back-edge', () => {
  const { nodes, edges } = parse([c(119, 0, ['nowhere'])]);
  assert.deepEqual(nodes, [{ id: 'p_0', type: 'jump', target: 'nowhere' }]);
  assert.deepEqual(edges, []);
});

test('node ids are namespaced by the prefix and stable across runs', () => {
  const list = [c(118, 0, ['a']), c(118, 0, ['b'])];
  assert.deepEqual(plain(parseEventPage(list, 'm1_e2_p0')).nodes.map(n => n.id), ['m1_e2_p0_0', 'm1_e2_p0_1']);
  assert.deepEqual(plain(parseEventPage(list, 'x')), plain(parseEventPage(list, 'x')));
});

test('the parser never mutates the command list', () => {
  const list = [c(111, 0, [0, 1, 0]), c(101, 1, ['']), c(401, 1, ['x']), c(411, 0), c(412, 0), c(119, 0, ['z'])];
  const before = JSON.stringify(list);
  parseEventPage(list, 'p');
  assert.equal(JSON.stringify(list), before);
});

test('describeCondition names switches, variables and actors, falls back to ids', () => {
  reset();
  assert.equal(describeCondition([0, 2, 0]), 'If [Switch: Door Open]');
  assert.equal(describeCondition([0, 99, 0]), 'If [Switch #99]');
  assert.equal(describeCondition([1, 1, 0, 0, 5, 0]), 'If [Variable: Gold Count]');
  assert.equal(describeCondition([4, 1, 0]), 'If [Actor: Harold]');
  assert.equal(describeCondition([2, 'A', 0]), 'If [Self Switch]');
  assert.equal(describeCondition([12, 'true']), 'If [Script]');
  assert.equal(describeCondition([42]), 'If [Cond]');
  assert.equal(describeCondition([]), 'Condition');
  assert.equal(describeCondition(undefined), 'Condition');
});

test('resolveTextCodes expands \\N[n] and \\V[n], keeps unknown codes', () => {
  reset();
  assert.equal(resolveTextCodes('\\N[1] has \\V[1] gold'), 'Harold has Gold Count(1) gold');
  assert.equal(resolveTextCodes('\\n[1]/\\v[1]'), 'Harold/Gold Count(1)');
  assert.equal(resolveTextCodes('\\N[7] \\V[7]'), '\\N[7] \\V[7]');
  assert.equal(resolveTextCodes(''), '');
  assert.equal(resolveTextCodes(undefined), '');
});

test('parseMapJson keeps events and pages, names from MapInfos or a Map### fallback', () => {
  const json = {
    events: [
      null,
      { id: 1, name: 'King', x: 3, y: 4, pages: [{ list: [c(0, 0)] }, {}] },
      { id: 2, name: '', x: 0, y: 0 },
    ],
  };
  const m = plain(parseMapJson(json, 5, { 5: { name: 'Castle' } }));
  assert.equal(m.mapName, 'Castle');
  assert.equal(m.mapId, 5);
  assert.deepEqual(m.events.map(e => e.name), ['King', 'EV2']);
  assert.deepEqual(m.events[0].pages, [{ pageIndex: 0, list: [c(0, 0)] }, { pageIndex: 1, list: [] }]);
  assert.deepEqual(m.events[1].pages, []);
  assert.equal(parseMapJson({}, 7, {}).mapName, 'Map007');
  assert.equal(parseMapJson({ events: [] }, 12, null).mapName, 'Map012');
});

test('parseCommonEvents drops empty slots and names unnamed events', () => {
  const out = plain(parseCommonEvents([null, { id: 1, name: 'Heal', list: [c(0, 0)] }, { id: 2, name: '' }, { name: 'no id' }]));
  assert.deepEqual(out, [
    { id: 1, name: 'Heal', list: [c(0, 0)] },
    { id: 2, name: 'Common Event 2', list: [] },
  ]);
  assert.deepEqual(plain(parseCommonEvents(null)), []);
});

test('VISIBLE_CODES lists exactly the commands the parser draws', () => {
  assert.deepEqual([...VISIBLE_CODES].sort((a, b) => a - b), [101, 102, 111, 118, 119]);
});

test('layoutPlan: big pages defer the layout, huge ones also use the cheaper ranking', () => {
  const get = load(['constants.js']);
  const plan = get('layoutPlan');
  assert.deepEqual(plain(plan(10)),   { defer: false, ranker: 'network-simplex' });
  assert.deepEqual(plain(plan(119)),  { defer: false, ranker: 'network-simplex' });
  assert.deepEqual(plain(plan(120)),  { defer: true,  ranker: 'network-simplex' });
  assert.deepEqual(plain(plan(399)),  { defer: true,  ranker: 'network-simplex' });
  assert.deepEqual(plain(plan(400)),  { defer: true,  ranker: 'longest-path' });
});

test('resolveTextCodes turns <br> into a line break and drops other HTML-like tags', () => {
  reset();
  assert.equal(resolveTextCodes('Hello<br>there<BR/>you'), 'Hello\nthere\nyou');
  assert.equal(resolveTextCodes('<b>Bold</b> and <font color="red">red</font>'), 'Bold and red');
  assert.equal(resolveTextCodes('<WordWrap>Long line'), 'Long line');
  assert.equal(resolveTextCodes('I <3 you, 1 < 2 &amp; a&nbsp;b'), 'I <3 you, 1 < 2 & a b');
  assert.equal(resolveTextCodes('\\n<Harold>Hi'), '\\n<Harold>Hi');
});
