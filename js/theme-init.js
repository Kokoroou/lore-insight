/* Applied before first paint to avoid a theme flash. External file so the CSP needs no inline script.
   Same rule as MakerLens Assets: a stored 'light' / 'dark' is an explicit choice, otherwise
   css/tokens.css follows prefers-color-scheme. */
(function () {
  try {
    var t = localStorage.getItem('mle-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system theme */ }
}());
