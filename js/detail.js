/* ── DOM helpers ─────────────────────────────────────── */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// <svg><use href="#i-…"/></svg> from the icon sprite in index.html
function icon(name, size) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size || 16);
  svg.setAttribute('height', size || 16);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}

function iconEl(name, cls) {
  const wrap = el('span', cls || 'sb-icon');
  wrap.appendChild(icon(name));
  return wrap;
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
function showDetail(nodeData) {
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

function clearDetail() {
  EL.detailBody.innerHTML = '<div class="detail-empty">Click a node to inspect it</div>';
}
