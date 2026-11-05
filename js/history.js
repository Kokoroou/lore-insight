/* ── Undo / redo (node moves only; game data is read-only) ── */
function undo() {
  if (!S.history.length) return;
  const h = S.history.pop();
  S.future.push(h);
  if (h.type === 'move' && cy) cy.getElementById(h.nodeId).position(h.oldPos);
}

function redo() {
  if (!S.future.length) return;
  const h = S.future.pop();
  S.history.push(h);
  if (h.type === 'move' && cy) cy.getElementById(h.nodeId).position(h.newPos);
}
