#!/usr/bin/env node
// Static checks for the site (no dependencies; run with `node scripts/check-site.mjs`).
// CI runs it as the lint step (.github/workflows/ci.yml). It guards the rules in
// CLAUDE.md that a browser would only reveal at runtime:
//   1. every js/*.js parses (`node --check`);
//   2. each page has a CSP that allows 'self' only, plus the GoatCounter pixel in img-src and
//      the feedback inbox (js/feedback.js) in connect-src;
//   3. no inline <script> and no on*="" handler attributes (the CSP would block them);
//   4. every js/*.js is loaded by index.html, and every local src/href (and CSS @import) exists.
//      Links that leave this tool (`../assets/...`, the MakerLens family on the same origin)
//      are not checked here; the makerlens repo checks the assembled site;
//   5. JSON-LD parses, and faq.html's FAQPage entries match its visible questions and answers.
// Checks 2-5 run on every page in PAGES (the feedback inbox is allowed in index.html only).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'index.html';
const PAGES = [APP, 'faq.html'];
const COUNTER = 'https://makerlens.goatcounter.com';
const FEEDBACK = 'https://feedback.kokoroou.workers.dev';   // inbox in the private repo Kokoroou/feedbacks

const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

// 1. JavaScript syntax
const jsFiles = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).sort();
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', join(root, 'js', f)], { stdio: 'pipe' });
  } catch (e) {
    fail(`js/${f}`, String(e.stderr || e.message).trim());
  }
}

const loaded = new Set();
const isLocal = u => u && !/^(?:[a-z]+:|\/\/|#|\.\.\/)/i.test(u);
const target = u => u.split(/[?#]/)[0];
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const text = h => decode(h.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

for (const PAGE of PAGES) {
  const html = readFileSync(join(root, PAGE), 'utf8');

  // 2. CSP: 'self' only, plus the counter pixel (and the feedback inbox on the app page)
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  if (!csp) {
    fail(PAGE, 'no Content-Security-Policy <meta> tag');
  } else {
    const directives = Object.fromEntries(csp[1].split(';').map(d => d.trim()).filter(Boolean)
      .map(d => { const [name, ...vals] = d.split(/\s+/); return [name, vals]; }));
    for (const name of ['default-src', 'script-src']) {
      if ((directives[name] || []).join(' ') !== "'self'") fail(PAGE, `CSP ${name} must be exactly 'self'`);
    }
    for (const [name, vals] of Object.entries(directives)) {
      for (const v of vals) {
        if (!/^https?:/.test(v) && !/\*/.test(v)) continue;
        if (name === 'img-src' && v === COUNTER) continue;
        if (name === 'connect-src' && v === FEEDBACK && PAGE === APP) continue;
        fail(PAGE, `CSP ${name} allows the external source ${v} (only ${COUNTER} in img-src and, in ${APP}, ${FEEDBACK} in connect-src are allowed)`);
      }
    }
  }

  // 3. No inline scripts or event-handler attributes
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (!/\bsrc=/.test(attrs) && !/type="application\/ld\+json"/.test(attrs) && m[2].trim()) {
      fail(PAGE, 'inline <script> (move the code to js/, the CSP blocks it)');
    }
  }
  for (const m of html.matchAll(/<[a-z][^>]*\son[a-z]+\s*=/gi)) {
    fail(PAGE, `event-handler attribute in ${m[0].slice(0, 60)}… (use addEventListener in js/)`);
  }

  // 4. Local files
  for (const m of html.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
    if (!isLocal(m[1])) continue;
    const t = target(m[1]);
    if (PAGE === APP && t.startsWith('js/')) loaded.add(t.slice(3));
    const file = t === '' || t === './' || t.endsWith('/') ? t.replace(/^\.\/$/, '') + 'index.html' : t;
    if (!existsSync(join(root, file))) fail(PAGE, `missing local file ${t}`);
  }

  // 5. JSON-LD parses; a FAQPage matches the visible questions and answers
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { fail(PAGE, `invalid JSON-LD: ${e.message}`); continue; }
    if (data['@type'] !== 'FAQPage') continue;
    const visible = [...html.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
      .map(d => ({ q: text(d[1]), a: text(d[2]) }));
    const ld = (data.mainEntity || []).map(e => ({ q: e.name, a: (e.acceptedAnswer || {}).text }));
    if (ld.length !== visible.length) fail(PAGE, `FAQPage JSON-LD has ${ld.length} questions, the page shows ${visible.length}`);
    ld.forEach((e, i) => {
      const v = visible[i];
      if (!v) return;
      if (e.q !== v.q) fail(PAGE, `FAQ question ${i + 1} differs: JSON-LD "${e.q}" vs page "${v.q}"`);
      else if (e.a !== v.a) fail(PAGE, `FAQ answer to "${e.q}" differs between JSON-LD and the page`);
    });
  }
}
for (const f of jsFiles) {
  if (!loaded.has(f)) fail(APP, `js/${f} exists but is not loaded by ${APP}`);
}
for (const f of readdirSync(join(root, 'css')).filter(f => f.endsWith('.css'))) {
  const css = readFileSync(join(root, 'css', f), 'utf8');
  for (const m of css.matchAll(/@import\s+(?:url\()?["']?([^"')\s]+)/g)) {
    if (isLocal(m[1]) && !existsSync(join(root, 'css', target(m[1])))) fail(`css/${f}`, `missing import ${m[1]}`);
  }
}

if (errors.length) {
  console.error(errors.map(e => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK: ${PAGES.join(', ')}, ${jsFiles.length} js files checked.`);
