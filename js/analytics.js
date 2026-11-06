// ─── Anonymous page-view counter (GoatCounter) ────────
// Same counter as the rest of the MakerLens family (see MakerLens Assets
// js/analytics.js and https://makerlens.kokoroou.workers.dev/assets/privacy.html#analytics).
// Sends ONE request per page load to GoatCounter's documented /count endpoint
// (https://www.goatcounter.com/help/pixel). No cookies, no localStorage,
// no fingerprinting. GoatCounter does not store IP addresses.
//
// Sent:       page path, referrer, and the traffic-source query params below.
// NEVER sent: file or folder names, game titles, map/event names, dialogue or
//             any other game data. Do not add any of those here (CLAUDE.md).
//
// The Content-Security-Policy in index.html allows only this host in img-src.
(function () {
  'use strict';
  var GC_ENDPOINT = 'https://kokoroou.goatcounter.com/count';
  var PUBLIC_HOST = 'makerlens.kokoroou.workers.dev';
  // Query params GoatCounter reads as traffic source / campaign. Nothing else is sent.
  var SOURCE_PARAMS = ['utm_source', 'ref', 'src', 'source', 'utm_campaign', 'campaign'];

  // Only count the public site, not local copies or previews.
  if (location.hostname !== PUBLIC_HOST) return;
  // Respect Do Not Track / Global Privacy Control.
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;

  var here = new URLSearchParams(location.search), q = new URLSearchParams();
  SOURCE_PARAMS.forEach(function (k) { if (here.get(k)) q.set(k, here.get(k)); });

  var params = new URLSearchParams({
    p: location.pathname,
    r: document.referrer,
    rnd: Math.random().toString(36).slice(2)
  });
  if (q.toString()) params.set('q', '?' + q.toString());
  new Image().src = GC_ENDPOINT + '?' + params.toString();
}());
