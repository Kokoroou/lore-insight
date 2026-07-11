/* ── DOM helpers ─────────────────────────────────────── */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fieldEl(label, value) {
  const wrap = el('div', 'detail-field');
  wrap.appendChild(el('div', 'detail-field-label', label));
  wrap.appendChild(el('div', 'detail-field-value', value ?? '—'));
  return wrap;
}

function typeName(t) {
  return { dialogue:'Dialogue', choice:'Choice', condition:'Condition', label:'Label', jump:'Jump' }[t] ?? t;
}

/* ── Detail panel ────────────────────────────────────── */
function showDetail(nodeData, editMode) {
  if (!nodeData) return;
  if (!S.detailOpen) {
    S.detailOpen = true;
    EL.detailPanel.classList.remove('hidden');
    EL.detailToggle.classList.add('active');
  }
  const body = EL.detailBody;
  body.innerHTML = '';

  const badge = el('span', `detail-type-badge badge-${nodeData.type}`, typeName(nodeData.type));
  body.appendChild(badge);

  if (nodeData.type === 'dialogue' && editMode) {
    renderDetailEdit(body, nodeData);
    return;
  }

  switch (nodeData.type) {
    case 'dialogue': {
      if (nodeData.speaker) {
        body.appendChild(el('div', 'detail-speaker', nodeData.speaker));
      }
      const linesWrap = el('div', 'detail-lines');
      for (const line of nodeData.lines) {
        linesWrap.appendChild(el('div', 'detail-line', resolveTextCodes(line) || '(empty)'));
      }
      body.appendChild(linesWrap);

      const editBtn = el('button', 'btn-edit', 'Edit');
      editBtn.style.marginTop = '8px';
      editBtn.addEventListener('click', () => showDetail(nodeData, true));
      body.appendChild(editBtn);
      break;
    }
    case 'choice': {
      body.appendChild(el('div', 'detail-field-label', 'Choices'));
      const cw = el('div', 'detail-choices');
      nodeData.choices.forEach((c, i) => {
        const row = el('div', 'detail-choice-item');
        row.appendChild(el('span', 'detail-choice-num', `${i+1}`));
        row.appendChild(el('span', '', resolveTextCodes(c)));
        cw.appendChild(row);
      });
      body.appendChild(cw);
      break;
    }
    case 'condition': {
      body.appendChild(fieldEl('Condition', nodeData.label));
      if (nodeData.params) {
        body.appendChild(fieldEl('Type', CONDITION_TYPES[nodeData.params[0]] ?? nodeData.params[0]));
      }
      break;
    }
    case 'label': {
      body.appendChild(fieldEl('Label name', nodeData.name));
      break;
    }
    case 'jump': {
      body.appendChild(fieldEl('Jump target', nodeData.target));
      break;
    }
  }
}

function renderDetailEdit(body, nodeData) {
  const spkWrap = el('div', 'detail-edit-field');
  spkWrap.appendChild(el('div', 'detail-edit-label', 'Speaker'));
  const spkInput = el('input', 'detail-edit-input');
  spkInput.type = 'text';
  spkInput.value = nodeData.speaker || '';
  spkWrap.appendChild(spkInput);
  body.appendChild(spkWrap);

  const txtWrap = el('div', 'detail-edit-field');
  txtWrap.appendChild(el('div', 'detail-edit-label', 'Text (one line per row)'));
  const txtArea = document.createElement('textarea');
  txtArea.className = 'detail-edit-input';
  txtArea.rows = 6;
  txtArea.value = nodeData.lines.join('\n');
  txtWrap.appendChild(txtArea);
  body.appendChild(txtWrap);

  const actions = el('div', 'detail-edit-actions');

  const saveBtn = el('button', 'btn-save', 'Save');
  saveBtn.addEventListener('click', () => {
    const newSpeaker = spkInput.value.trim();
    const newLines = txtArea.value.split('\n');
    const oldSpeaker = nodeData.speaker;
    const oldLines = [...nodeData.lines];
    const pageRef = S.currentPage;

    nodeData.speaker = newSpeaker;
    nodeData.lines = [...newLines];

    if (pageRef && nodeData.listStart !== undefined) {
      const list = pageRef.list;
      list[nodeData.listStart].parameters[4] = newSpeaker;
      let li = 0;
      for (let i = nodeData.listStart + 1; i < nodeData.listEnd && i < list.length; i++) {
        if (list[i].code === 401) {
          list[i].parameters[0] = newLines[li] ?? '';
          li++;
        }
      }
    }

    S.history.push({ type: 'dialogue', nodeData, page: pageRef, oldSpeaker, oldLines, newSpeaker, newLines: [...newLines] });
    S.future = [];

    cy?.getElementById(nodeData.id)?.data('label', nodeLabel(nodeData));
    S.dirty = true;
    showDownloadBtn();
    showDetail(nodeData, false);
  });
  actions.appendChild(saveBtn);

  const cancelBtn = el('button', 'btn-cancel-edit', 'Cancel');
  cancelBtn.addEventListener('click', () => showDetail(nodeData, false));
  actions.appendChild(cancelBtn);
  body.appendChild(actions);
}

function clearDetail() {
  EL.detailBody.innerHTML = '<div class="detail-empty">Click a node to inspect it</div>';
}
