import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, plain } from './helpers.mjs';

// No #feedback element: the card wiring is skipped, the pure helpers stay testable.
const run = load(['feedback.js'], {
  document: { getElementById: () => null },
  location: { hostname: 'makerlens.kokoroou.workers.dev', search: '' },
  navigator: {}, URLSearchParams,
});

test('uses its own inbox project and storage key, not the ones of MakerLens Assets', () => {
  assert.equal(run('FB_PROJECT'), 'makerlens-events');
  assert.equal(run('FB_STORE'), 'mle-feedback');
  assert.equal(typeof run('Feedback.noteOpen'), 'function');
});

test('body carries only the fields the inbox accepts', () => {
  const body = plain(run(`fbBody({ kind: 'rating', rating: 5 }, 2, 'vi-VN', '')`));
  assert.deepEqual(body, { project: 'makerlens-events', kind: 'rating', rating: 5, comment: '', lang: 'vi', meta: { opens: '2' } });

  const bug = plain(run(`fbBody({ kind: 'bug', comment: 'x'.repeat(1500), meta: { browser: 'Chrome 131 · Windows', map: 'Map001' } }, 7, 'en', '')`));
  assert.deepEqual(Object.keys(bug).sort(), ['comment', 'kind', 'lang', 'meta', 'project', 'rating']);
  assert.equal(bug.rating, null);
  assert.equal(bug.comment.length, 1000);
  assert.deepEqual(bug.meta, { opens: '6-10', browser: 'Chrome 131 · Windows' });   // unknown meta never sent

  const follow = plain(run(`fbBody({ kind: 'idea', rating: 4, comment: 'more', ref: '12.abc' }, 3, '', 'bot')`));
  assert.equal(follow.ref, '12.abc');
  assert.equal(follow.website, 'bot');
  assert.equal(follow.meta.opens, '3-5');
  assert.equal(plain(run(`fbBody({ kind: 'idea', rating: 4, comment: 'more', ref: '' }, 3, '', '')`)).ref, undefined);
});

test('opens buckets match the inbox enum', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 10, 11, 999].map(n => run(`fbBucket(${n})`)),
    ['', '1', '2', '3-5', '3-5', '6-10', '6-10', '11+', '11+']);
});

test('asks from the 2nd game, again 5 games after "Not now", never after two skips or an answer', () => {
  const ask = s => run(`fbShouldAsk(${JSON.stringify(s)})`);
  assert.equal(ask({ opens: 1, done: false, skips: 0, nextAt: 2 }), false);
  assert.equal(ask({ opens: 2, done: false, skips: 0, nextAt: 2 }), true);
  assert.equal(ask({ opens: 6, done: false, skips: 1, nextAt: 7 }), false);
  assert.equal(ask({ opens: 7, done: false, skips: 1, nextAt: 7 }), true);
  assert.equal(ask({ opens: 20, done: false, skips: 2, nextAt: 12 }), false);
  assert.equal(ask({ opens: 20, done: true, skips: 0, nextAt: 2 }), false);
});

test('browser label is short and matches the inbox short_text type', () => {
  const ua = {
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36': 'Chrome 131 · Windows',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0': 'Edge 131 · Windows',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1': 'Safari 18 · iOS',
    'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0': 'Firefox 132 · Linux',
  };
  for (const [u, want] of Object.entries(ua)) {
    const got = run(`fbBrowser(${JSON.stringify(u)})`);
    assert.equal(got, want);
    assert.match(got, /^[\p{L}\p{N} .·()/_-]{1,60}$/u);
  }
});
