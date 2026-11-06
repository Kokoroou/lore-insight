/* ── Feedback: 1-tap star rating + bug/idea form ─────────
   Same card, rules and payload as MakerLens Assets js/feedback.js, under this
   tool's own inbox project and storage key. One card (#feedback in index.html),
   one view at a time:
     rate   — asked automatically ONCE, when the 2nd game is loaded (coming back
              with another game means the tool was useful). Tapping a star SENDS
              the rating. Non-modal; ignored for IDLE_MS it slips away (counts as
              "not now"). Not shown with Do Not Track / Global Privacy Control,
              off the public site, or when localStorage is unavailable.
     follow — right after the star: an optional one-line comment, Enter sends it
              (kind 'idea' with the same stars plus the signed `ref` the inbox
              returned for the star, so both become ONE entry).
     report — from About ("Report a bug or idea"): Bug / Idea + message.
     thanks — short confirmation, closes by itself.

   Remembered in localStorage['mle-feedback'] (own key: the MakerLens family
   shares one origin, Assets uses 'feedback'), never sent:
     { v: 1, opens, done, skips, nextAt }

   Sent ONLY when the user taps a star or presses Send, to the feedback inbox
   (Cloudflare Worker, private repo Kokoroou/feedbacks, project 'makerlens-events'):
     { project, kind, rating, comment, lang, meta: { opens (bucket), browser (bug only, removable) }, ref }
   NEVER sent: file, map, event or switch names, dialogue, game titles or any
   other game data. Documented in MakerLens Assets privacy.html#feedback; update
   it if the payload changes. The endpoint is the only extra host in the CSP. */

const FB_ENDPOINT = 'https://feedback.kokoroou.workers.dev/api/submit';
const FB_PROJECT  = 'makerlens-events';
const FB_STORE    = 'mle-feedback';
const FB_HOST     = 'makerlens.kokoroou.workers.dev';
const FB_ASK_AT   = 2;   // ask on the 2nd loaded game
const FB_SKIP_GAP = 5;   // "Not now" → ask again 5 games later…
const FB_MAX_SKIP = 2;   // …and never after the 2nd "Not now"
const FB_MAX_LEN  = 1000;

const fbFresh  = () => ({ v: 1, opens: 0, done: false, skips: 0, nextAt: FB_ASK_AT });
const fbBucket = n => n <= 0 ? '' : n <= 2 ? String(n) : n <= 5 ? '3-5' : n <= 10 ? '6-10' : '11+';
const fbShouldAsk = s => !s.done && s.skips < FB_MAX_SKIP && s.opens >= s.nextAt;
const fbLang = l => String(l || '').slice(0, 2).toLowerCase().replace(/[^a-z]/g, '');

// "Chrome 131 · Windows": shown in the bug form, so the user sees exactly what is sent.
function fbBrowser(ua) {
  const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/g) || [];
  const v = n => { const x = m.find(s => s.startsWith(n + '/')); return x && x.split('/')[1]; };
  const b = v('Edg') ? 'Edge ' + v('Edg')
    : v('OPR') ? 'Opera ' + v('OPR')
    : v('Firefox') ? 'Firefox ' + v('Firefox')
    : v('Chrome') ? 'Chrome ' + v('Chrome')
    : /Safari/.test(ua) && v('Version') ? 'Safari ' + v('Version')
    : 'Other browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS'
    : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other OS';
  return `${b} · ${os}`;
}

// The whole request body. Only these keys ever leave the page.
function fbBody(fields, opens, lang, honeypot) {
  const meta = { opens: fbBucket(opens) };
  if (fields.meta && fields.meta.browser) meta.browser = fields.meta.browser;
  const body = {
    project: FB_PROJECT, kind: fields.kind, rating: fields.rating ?? null,
    comment: String(fields.comment || '').slice(0, FB_MAX_LEN), lang: fbLang(lang), meta,
  };
  if (fields.ref) body.ref = fields.ref;
  if (honeypot) body.website = honeypot;   // bots fill it; the inbox drops those
  return body;
}

const Feedback = (() => {
  const $f = id => document.getElementById(id);
  const card = $f('feedback');
  if (!card) return { noteOpen() {} };

  const IDLE_MS = 45000, FOLLOW_MS = 20000;
  const publicSite = location.hostname === FB_HOST;
  const forced  = new URLSearchParams(location.search).has('feedback'); // test the prompt anywhere
  const noTrack = navigator.doNotTrack === '1' || !!navigator.globalPrivacyControl;

  const errEl = $f('fb-error'), note = $f('fb-note'), noteSend = $f('fb-note-send');
  const msg = $f('fb-msg'), sendBtn = $f('fb-send'), env = $f('fb-env');

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(FB_STORE) || 'null');
      return s && s.v === 1 ? s : fbFresh();
    } catch { return null; }
  }
  function save(s) {
    try { localStorage.setItem(FB_STORE, JSON.stringify(s)); return true; } catch { return false; }
  }

  let view = null, rating = 0, ratingRef = '', sending = false, showTimer = 0, idleTimer = 0, touched = false;

  function setView(v) {
    view = v;
    card.dataset.view = v;
    errEl.textContent = '';
    clearTimeout(idleTimer);
    touched = false;
    if (v === 'rate') idleTimer = setTimeout(() => { if (!touched) dismiss(); }, IDLE_MS);
    if (v === 'follow') idleTimer = setTimeout(() => { if (!touched && !note.value) close(); }, FOLLOW_MS);
    if (v === 'thanks') idleTimer = setTimeout(close, 1600);
  }

  function open(v) {
    card.querySelectorAll('form').forEach(f => f.reset());
    card.querySelectorAll('input[name="fb-rating"]').forEach(r => { r.checked = false; });
    rating = 0;
    ratingRef = '';
    note.style.height = '';
    noteSend.disabled = sendBtn.disabled = true;
    env.setAttribute('aria-pressed', 'true');
    $f('fb-env-value').textContent = fbBrowser(navigator.userAgent);
    syncKind();
    setView(v);
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('open'));
  }

  function close() {
    clearTimeout(idleTimer);
    card.classList.remove('open');
    card.hidden = true;
    view = null;
  }

  function syncKind() {
    const bug = $f('fb-kind-bug').checked;
    card.dataset.kind = bug ? 'bug' : 'idea';
    msg.placeholder = bug ? 'What happened? What did you do just before?' : 'Your idea or comment';
  }

  // Called by loadFolder() [loader.js] after a game loaded successfully.
  function noteOpen() {
    if ((!publicSite || noTrack) && !forced) return;
    const s = load();
    if (!s) return;                       // cannot remember the answer → never ask
    s.opens = Math.min((s.opens || 0) + 1, 999);
    if (!save(s)) return;
    if (forced || fbShouldAsk(s)) scheduleShow();
  }

  // A moment after the graph appears, and only when nothing else is in front.
  function scheduleShow() {
    clearTimeout(showTimer);
    let tries = 0;
    const busy = () => $f('about-modal').classList.contains('open') || document.visibilityState !== 'visible';
    const tryShow = () => {
      if (!card.hidden) return;
      if (busy()) { if (++tries < 120) showTimer = setTimeout(tryShow, 1000); return; }
      open('rate');
    };
    showTimer = setTimeout(tryShow, 1500);
  }

  function dismiss() {
    if (sending) return;
    if (view === 'rate') {
      const s = load();
      if (s && !s.done) { s.skips = (s.skips || 0) + 1; s.nextAt = s.opens + FB_SKIP_GAP; save(s); }
    }
    close();
  }

  async function post(fields) {
    const s = load() || fbFresh();
    // text/plain keeps it a "simple" CORS request (no preflight round trip).
    const res = await fetch(FB_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(fbBody(fields, s.opens || 0, navigator.language, $f('fb-website').value)),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (res.status === 429) throw new Error('Too many messages from your network. Try again in a minute.');
    if (!res.ok) throw new Error(`Couldn't send (error ${res.status}).`);
    if (res.status !== 200) return null;  // a star answers { ref }; the rest 204
    try { return await res.json(); } catch { return null; }
  }

  async function run(task, busyEl) {
    if (sending) return false;
    sending = true;
    errEl.textContent = '';
    busyEl?.classList.add('fb-busy');
    try {
      await task();
      return true;
    } catch (e) {
      errEl.textContent = e instanceof TypeError || !e.message
        ? (publicSite ? "Couldn't send. Check your connection and try again."
                      : 'Feedback can only be sent from the online site.')
        : e.message;
      return false;
    } finally {
      sending = false;
      busyEl?.classList.remove('fb-busy');
    }
  }

  async function rate(n) {
    rating = n;
    const ok = await run(async () => {
      const r = await post({ kind: 'rating', rating: n });
      ratingRef = typeof r?.ref === 'string' ? r.ref : '';
    }, card.querySelector('.fb-stars'));
    if (!ok) { card.querySelectorAll('input[name="fb-rating"]').forEach(r => { r.checked = false; }); return; }
    const s = load();
    if (s) { s.done = true; save(s); }
    $f('fb-follow-q').textContent = n <= 3 ? 'What went wrong?' : n === 4 ? 'What would make it 5?' : 'What do you like most?';
    setView('follow');
  }

  async function sendNote() {
    const text = note.value.trim();
    if (!text) return;
    const ok = await run(() => post({ kind: 'idea', rating, comment: text, ref: ratingRef }), card.querySelector('.fb-follow'));
    if (ok) { $f('fb-thanks-text').textContent = 'Thanks!'; setView('thanks'); }
  }

  async function sendReport() {
    const text = msg.value.trim();
    if (!text) return;
    const bug = $f('fb-kind-bug').checked;
    const browser = bug && env.getAttribute('aria-pressed') === 'true' ? fbBrowser(navigator.userAgent) : '';
    const ok = await run(() => post({ kind: bug ? 'bug' : 'idea', comment: text, meta: { browser } }),
      card.querySelector('.fb-report'));
    if (ok) { $f('fb-thanks-text').textContent = 'Sent. Thanks!'; setView('thanks'); }
  }

  card.querySelectorAll('input[name="fb-rating"]').forEach(r =>
    r.addEventListener('change', () => { if (r.checked) rate(+r.value); }));

  const grow = el => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };
  note.addEventListener('input', () => { touched = true; noteSend.disabled = !note.value.trim(); grow(note); });
  note.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendNote(); }
  });
  noteSend.closest('form').addEventListener('submit', e => { e.preventDefault(); sendNote(); });

  msg.addEventListener('input', () => { sendBtn.disabled = !msg.value.trim(); });
  msg.addEventListener('keydown', e => {   // multi-line reports: Ctrl/Cmd+Enter sends
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReport(); }
  });
  sendBtn.closest('form').addEventListener('submit', e => { e.preventDefault(); sendReport(); });
  card.querySelectorAll('input[name="fb-kind"]').forEach(r => r.addEventListener('change', syncKind));
  env.addEventListener('click', () => env.setAttribute('aria-pressed', env.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'));

  // Any interaction keeps the card from slipping away.
  ['pointerdown', 'focusin', 'keydown'].forEach(t => card.addEventListener(t, () => { touched = true; }));
  // Keys typed in the card stay in the card (app.js uses Ctrl+Z / Esc on the document).
  card.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') dismiss();
  });
  $f('fb-close').addEventListener('click', dismiss);

  $f('about-feedback-btn').addEventListener('click', () => {
    clearTimeout(showTimer);
    $f('about-modal').classList.remove('open');
    open('report');
    setTimeout(() => msg.focus(), 50);
  });

  return { noteOpen };
})();
