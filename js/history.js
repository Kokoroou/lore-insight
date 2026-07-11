/* ── Undo / redo ─────────────────────────────────────── */
function applyDialogueEdit(h, speaker, lines) {
  h.nodeData.speaker = speaker;
  h.nodeData.lines = [...lines];
  if (h.page && h.nodeData.listStart !== undefined) {
    const list = h.page.list;
    list[h.nodeData.listStart].parameters[4] = speaker;
    let li = 0;
    for (let i = h.nodeData.listStart + 1; i < h.nodeData.listEnd && i < list.length; i++) {
      if (list[i].code === 401) {
        list[i].parameters[0] = lines[li] ?? '';
        li++;
      }
    }
  }
  cy?.getElementById(h.nodeData.id)?.data('label', nodeLabel(h.nodeData));
  S.dirty = true;
  showDownloadBtn();
}

function undo() {
  if (!S.history.length) return;
  const h = S.history.pop();
  S.future.push(h);
  if (h.type === 'dialogue') applyDialogueEdit(h, h.oldSpeaker, h.oldLines);
  else if (h.type === 'move' && cy) cy.getElementById(h.nodeId).position(h.oldPos);
}

function redo() {
  if (!S.future.length) return;
  const h = S.future.pop();
  S.history.push(h);
  if (h.type === 'dialogue') applyDialogueEdit(h, h.newSpeaker, h.newLines);
  else if (h.type === 'move' && cy) cy.getElementById(h.nodeId).position(h.newPos);
}
