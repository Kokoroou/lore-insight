import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './helpers.mjs';

// Runs js/analytics.js with a fake browser and returns the URLs it requested.
function run({ host = 'makerlens.kokoroou.workers.dev', path = '/events/', search = '', referrer = '', dnt, gpc } = {}) {
  const sent = [];
  class Image { set src(u) { sent.push(new URL(u)); } }
  load(['analytics.js'], {
    location: { hostname: host, pathname: path, search },
    navigator: { doNotTrack: dnt, globalPrivacyControl: gpc },
    document: { referrer },
    Image, URLSearchParams, Math,
  });
  return sent;
}

test('sends one page view with only path, referrer and the random cache-buster', () => {
  const sent = run({ referrer: 'https://makerlens.kokoroou.workers.dev/assets/' });
  assert.equal(sent.length, 1);
  const u = sent[0];
  assert.equal(u.origin + u.pathname, 'https://makerlens.goatcounter.com/count');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['p', 'r', 'rnd']);
  assert.equal(u.searchParams.get('p'), '/events/');
  assert.equal(u.searchParams.get('r'), 'https://makerlens.kokoroou.workers.dev/assets/');
});

test('forwards only the listed traffic-source params', () => {
  const [u] = run({ search: '?utm_source=reddit&map=Map001&ref=forum' });
  assert.equal(u.searchParams.get('q'), '?utm_source=reddit&ref=forum');
  assert.doesNotMatch(u.href, /Map001/);
});

test('sends nothing on local copies, previews, Do Not Track or GPC', () => {
  assert.equal(run({ host: 'localhost' }).length, 0);
  assert.equal(run({ host: 'kokoroou.github.io' }).length, 0);
  assert.equal(run({ dnt: '1' }).length, 0);
  assert.equal(run({ gpc: true }).length, 0);
});
