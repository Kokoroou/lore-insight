/* ── Theme ───────────────────────────────────────────── */
// Same rule as MakerLens Assets: html[data-theme] is an explicit choice,
// otherwise the OS preference (prefers-color-scheme) decides.
const DARK_MQ = window.matchMedia('(prefers-color-scheme: dark)');
const systemTheme  = () => DARK_MQ.matches ? 'dark' : 'light';
const currentTheme = () => document.documentElement.dataset.theme || systemTheme();

// Design tokens from css/tokens.css (the shared MakerLens palette), so the
// canvas uses the same colours and font as the rest of the page.
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ── Cytoscape instance ──────────────────────────────── */
let cy = null;

function activeNodeColors() {
  return currentTheme() === 'light' ? NODE_COLORS_LIGHT : NODE_COLORS;
}

function initCy() {
  if (cy) { cy.destroy(); cy = null; }
  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: [],
    style: cyStyle(),
    layout: { name: 'preset' },
    minZoom: 0.1,
    maxZoom: 3,
    wheelSensitivity: 0.3,
  });
  cy.on('tap', 'node', e => showDetail(e.target.data('nodeData')));
  cy.on('tap', e => { if (e.target === cy) clearDetail(); });
  cy.on('grab', 'node', e => {
    e.target.data('grabPos', { x: e.target.position().x, y: e.target.position().y });
  });
  cy.on('dragfree', 'node', e => {
    const nd = e.target;
    const oldPos = nd.data('grabPos');
    if (!oldPos) return;
    const newPos = { x: nd.position().x, y: nd.position().y };
    S.history.push({ type: 'move', nodeId: nd.id(), oldPos, newPos });
    S.future = [];
  });
}

function cyStyle() {
  const bgBase = token('--bg');
  const line   = token('--bd2');
  const muted  = token('--t2');
  const font   = token('--font');
  const jump   = token('--c-jump');
  const accent = token('--a');
  return [
    {
      selector: 'node',
      style: {
        'shape': 'round-rectangle',
        'background-color': NODE_COLORS.dialogue.bg,
        'border-color':     NODE_COLORS.dialogue.border,
        'border-width': 1.5,
        'color': NODE_COLORS.dialogue.text,
        'label': 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': 200,
        'font-size': 12,
        'font-family': font,
        'padding': 12,
        'width': 'label',
        'height': 'label',
        'text-valign': 'center',
        'text-halign': 'center',
        'min-width': 120,
        'min-height': 36,
      }
    },
    nodeTypeStyle('dialogue',  activeNodeColors().dialogue,  'round-rectangle'),
    nodeTypeStyle('choice',    activeNodeColors().choice,    'diamond'),
    nodeTypeStyle('condition', activeNodeColors().condition, 'diamond'),
    nodeTypeStyle('label',     activeNodeColors().label,     'ellipse'),
    nodeTypeStyle('jump',      activeNodeColors().jump,      'ellipse'),
    ...Object.entries(activeNodeColors()).map(([type, colors]) => ({
      selector: `node[nodeType="${type}"]:selected`,
      style: {
        'border-width': 3,
        'border-color': colors.border,
        'underlay-color': colors.border,
        'underlay-opacity': 0.4,
        'underlay-padding': 9,
      },
    })),
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': line,
        'target-arrow-color': line,
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': 11,
        'font-family': font,
        'color': muted,
        'text-background-color': bgBase,
        'text-background-opacity': 0.85,
        'text-background-padding': '3px',
        'text-rotation': 'autorotate',
      }
    },
    {
      selector: 'edge[?isJump]',
      style: {
        'line-style': 'dashed',
        'line-color': jump,
        'target-arrow-color': jump,
        'line-dash-pattern': [6, 3],
      }
    },
    {
      selector: 'edge:selected',
      style: { 'line-color': accent, 'target-arrow-color': accent, 'width': 2 }
    },
  ];
}

function nodeTypeStyle(type, colors, shape) {
  return {
    selector: `node[nodeType="${type}"]`,
    style: {
      'background-color': colors.bg,
      'border-color':     colors.border,
      'color':            colors.text,
      'shape':            shape,
    }
  };
}

/* ── Render graph ────────────────────────────────────── */
function renderGraph(nodes, edges) {
  if (!cy) initCy();
  S.currentNodes = nodes;

  const elements = [];
  for (const n of nodes) {
    elements.push({ data: {
      id: n.id,
      label: nodeLabel(n),
      nodeType: n.type,
      nodeData: n,
      glowColor: activeNodeColors()[n.type]?.border || '#f59e0b',
    }});
  }
  for (const e of edges) {
    const eid = `e_${e.source}_${e.target}_${Math.random().toString(36).slice(2,6)}`;
    elements.push({ data: { id: eid, source: e.source, target: e.target, label: e.label || '', isJump: e.isJump || false } });
  }

  const emptyNotice = document.getElementById('empty-page-notice');
  if (emptyNotice) emptyNotice.hidden = true;

  cy.elements().remove();
  cy.add(elements);
  cy.style(cyStyle());

  const layout = cy.layout({
    name: 'dagre',
    rankDir: 'TB',
    nodeSep: 40,
    rankSep: 60,
    edgeSep: 10,
    padding: 32,
    animate: false,
  });
  layout.run();

  setTimeout(() => cy.fit(undefined, 32), 50);
}

function nodeLabel(n) {
  switch (n.type) {
    case 'dialogue': {
      const spk = n.speaker ? n.speaker + '\n' : '';
      const full = n.lines.map(l => formatText(l)).join('\n');
      const txt = full.length > 120 ? full.slice(0, 120) + '…' : full;
      return (spk + txt).trim() || '(empty text)';
    }
    case 'choice': {
      const full = n.choices.map((c, i) => `${i+1}. ${formatText(c)}`).join('\n');
      return full.length > 120 ? full.slice(0, 120) + '…' : full;
    }
    case 'condition': return n.label;
    case 'label':     return `▸ ${n.name}`;
    case 'jump':      return `↩ ${n.target}`;
    default:          return n.type;
  }
}

function formatText(str) {
  const resolved = resolveTextCodes(str || '');
  return resolved.replace(/\\[A-Za-z]\[\d+\]/g, '').replace(/\\\./g, '').replace(/\\!/g, '').trim();
}

function stripCodes(str) { return formatText(str); }
