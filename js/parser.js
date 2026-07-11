/* ── RPG Maker MV/MZ event parser ────────────────────── */

function describeCondition(params) {
  if (!params || !params.length) return 'Condition';
  return `If [${CONDITION_TYPES[params[0]] ?? 'Cond'}]`;
}

// Parse a single event page command list → { nodes, edges }
// prefix: unique string to namespace node IDs
function parseEventPage(list, prefix) {
  const nodes = [];
  const edges = [];
  let seq = 0;
  const labelMap  = {};  // label name → node id
  const jumpQueue = [];  // {id, target} to resolve after

  function nid() { return `${prefix}_${seq++}`; }

  function parseBlock(startIdx, indent) {
    let i = startIdx;
    let prev  = null;
    let first = null;

    function add(node) {
      nodes.push(node);
      if (prev)  edges.push({ source: prev, target: node.id });
      if (!first) first = node.id;
      prev = node.id;
    }

    while (i < list.length) {
      const cmd = list[i];

      if (cmd.indent < indent) break;
      // Branch-boundary codes at the same indent belong to the parent caller
      if (cmd.indent === indent &&
          (cmd.code === CMD.WHEN_CHOICE || cmd.code === CMD.CHOICE_END ||
           cmd.code === CMD.ELSE        || cmd.code === CMD.IF_END)) break;
      if (cmd.indent > indent) { i++; continue; }

      switch (cmd.code) {

        case CMD.SHOW_TEXT_CFG: {
          const id = nid();
          // MV: params[4] is speaker name (MZ), params[0] is face filename
          const speaker = (cmd.parameters && cmd.parameters[4]) || '';
          const faceFile = (cmd.parameters && cmd.parameters[0]) || '';
          const lines = [];
          i++;
          while (i < list.length && list[i].code === CMD.SHOW_TEXT) {
            lines.push(list[i].parameters[0] || '');
            i++;
          }
          add({ id, type: 'dialogue', speaker, faceFile, lines });
          break;
        }

        case CMD.SHOW_CHOICES: {
          const id = nid();
          const choices = (cmd.parameters && cmd.parameters[0] || []).filter(c => c !== '');
          add({ id, type: 'choice', choices });
          i++;

          while (i < list.length) {
            const c = list[i];
            if (c.code === CMD.CHOICE_END && c.indent === indent) { i++; break; }
            if (c.code === CMD.WHEN_CHOICE && c.indent === indent) {
              const ci    = c.parameters[0];
              const clabel = choices[ci] ?? `Choice ${ci}`;
              i++;
              const sub = parseBlock(i, indent + 1);
              i = sub.nextIdx;
              if (sub.first) edges.push({ source: id, target: sub.first, label: clabel });
            } else {
              i++;
            }
          }
          prev = null; // branches diverge; no single successor
          break;
        }

        case CMD.IF_CONDITION: {
          const id = nid();
          add({ id, type: 'condition', label: describeCondition(cmd.parameters), params: cmd.parameters });
          i++;

          const tb = parseBlock(i, indent + 1);
          i = tb.nextIdx;
          if (tb.first) edges.push({ source: id, target: tb.first, label: 'True' });

          if (i < list.length && list[i].code === CMD.ELSE && list[i].indent === indent) {
            i++;
            const eb = parseBlock(i, indent + 1);
            i = eb.nextIdx;
            if (eb.first) edges.push({ source: id, target: eb.first, label: 'Else' });
          }
          if (i < list.length && list[i].code === CMD.IF_END && list[i].indent === indent) i++;

          prev = null;
          break;
        }

        case CMD.LABEL: {
          const id = nid();
          const name = cmd.parameters[0];
          add({ id, type: 'label', name });
          labelMap[name] = id;
          i++;
          break;
        }

        case CMD.JUMP_TO_LABEL: {
          const id = nid();
          const target = cmd.parameters[0];
          add({ id, type: 'jump', target });
          jumpQueue.push({ id, target });
          i++;
          break;
        }

        case CMD.EVENT_END: { i++; break; }
        default:            { i++; break; }
      }
    }

    return { nextIdx: i, first, last: prev };
  }

  parseBlock(0, 0);

  // Resolve label jumps
  for (const j of jumpQueue) {
    if (labelMap[j.target]) {
      edges.push({ source: j.id, target: labelMap[j.target], label: '↩ jump', isJump: true });
    }
  }

  return { nodes, edges };
}

// Parse Map###.json → array of { mapId, mapName, events }
// Each event: { id, name, x, y, pages: [{pageIndex, list}] }
function parseMapJson(json, mapId, mapInfos) {
  const mapName = (mapInfos && mapInfos[mapId]?.name) || `Map${String(mapId).padStart(3,'0')}`;
  const events = [];
  for (const ev of (json.events || [])) {
    if (!ev) continue;
    const pages = (ev.pages || []).map((page, pi) => ({
      pageIndex: pi,
      list: page.list || [],
    }));
    events.push({ id: ev.id, name: ev.name || `EV${ev.id}`, x: ev.x, y: ev.y, pages });
  }
  return { mapId, mapName, events };
}

// Parse CommonEvents.json → array of { id, name, list }
function parseCommonEvents(json) {
  return (json || [])
    .filter(ev => ev && ev.id)
    .map(ev => ({ id: ev.id, name: ev.name || `Common Event ${ev.id}`, list: ev.list || [] }));
}
