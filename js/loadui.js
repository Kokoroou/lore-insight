/* ── Loading overlay ─────────────────────────────────────
   Same card as MakerLens Assets (css/loader.css): named steps, a determinate or
   sweeping progress bar, Cancel and an error state. Cancel only aborts a load
   that has not replaced the open game yet; after commit() the button says Hide
   and just closes the card while the maps keep loading in the background. */
const LOADER_STEPS = {
  detect: 'Find the data folder',
  read:   'Read map list and names',
  map:    'Open the first map',
};

const Loader = (() => {
  const $ = id => document.getElementById(id);
  const root = $('loader'), titleEl = $('loader-title'), nameEl = $('loader-name'),
        pctEl = $('loader-pct'), bar = $('loader-bar'), fill = $('loader-fill'),
        stepsEl = $('loader-steps'), errEl = $('loader-error'), live = $('loader-live'),
        cancel = $('loader-cancel');
  const MARK = '<span class="ls-mark" aria-hidden="true">'
    + '<svg class="ls-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
    + '<svg class="ls-x" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>';

  let active = false, cancelled = false, committed = false, prevFocus = null;
  const rows = new Map();   // step id → <li>

  function progress(done, total) {
    if (!total) {
      bar.classList.add('indeterminate');
      bar.removeAttribute('aria-valuenow');
      pctEl.textContent = '';
      return;
    }
    const pct = Math.min(100, Math.floor(done / total * 100));
    bar.classList.remove('indeterminate');
    bar.setAttribute('aria-valuenow', pct);
    fill.style.width = pct + '%';
    pctEl.textContent = pct + '%';
  }

  function detail(id, text) {
    const li = rows.get(id);
    if (li) li.lastElementChild.textContent = text || '';
  }

  // state: '' (waiting) | 'active' | 'done' | 'error'. Re-sending the same
  // state only updates the detail, so the live region does not re-announce.
  function step(id, state, text) {
    const li = rows.get(id);
    if (!li) return;
    const cls = ('loader-step ' + state).trim();
    const changed = li.className !== cls;
    li.className = cls;
    if (state === 'active') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    if (text !== undefined) detail(id, text);
    if (state === 'active' && changed) { progress(0, 0); live.textContent = LOADER_STEPS[id] + '…'; }
  }

  function open({ name, steps }) {
    active = true; cancelled = false; committed = false;
    prevFocus = document.activeElement;
    root.classList.remove('failed');
    titleEl.textContent = 'Opening game folder';
    nameEl.textContent = name || '';
    errEl.textContent = '';
    fill.style.width = '0';
    rows.clear();
    stepsEl.innerHTML = '';
    for (const id of steps) {
      const li = document.createElement('li');
      li.className = 'loader-step';
      li.innerHTML = MARK + `<span class="ls-label">${LOADER_STEPS[id]}</span><span class="ls-detail"></span>`;
      rows.set(id, li);
      stepsEl.appendChild(li);
    }
    progress(0, 0);
    cancel.textContent = 'Cancel';
    cancel.disabled = false;
    document.body.setAttribute('aria-busy', 'true');
    root.classList.add('active');
    cancel.focus({ preventScroll: true });
  }

  function close() {
    if (!active) return;
    active = false;
    root.classList.remove('active', 'failed');
    document.body.removeAttribute('aria-busy');
    live.textContent = '';
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  }

  // The new game replaced the open one: Cancel can no longer undo anything.
  function commit() {
    committed = true;
    cancel.textContent = 'Hide';
    cancel.disabled = false;
  }

  function fail(message) {
    if (!active) return;
    for (const li of rows.values()) if (li.classList.contains('active')) li.className = 'loader-step error';
    root.classList.add('failed');
    titleEl.textContent = 'Could not open this game';
    errEl.textContent = message;
    progress(1, 1);
    pctEl.textContent = '';
    cancel.textContent = 'Close';
    cancel.disabled = false;
    committed = true;   // nothing left to cancel: the button closes the card
    document.body.removeAttribute('aria-busy');
    cancel.focus({ preventScroll: true });
  }

  function requestCancel() {
    if (!active) return;
    if (committed) { close(); return; }
    cancelled = true;
    cancel.disabled = true;
    cancel.textContent = 'Cancelling…';
  }

  // Throws AbortError once Cancel was pressed; called at the loader's yield points.
  function check() {
    if (cancelled) throw new DOMException('Loading cancelled', 'AbortError');
  }

  cancel.addEventListener('click', requestCancel);
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); requestCancel(); }
    if (e.key === 'Tab') { e.preventDefault(); cancel.focus(); }   // one control: keep focus inside
  });

  return { open, close, commit, fail, step, detail, progress, check, get active() { return active; } };
})();
