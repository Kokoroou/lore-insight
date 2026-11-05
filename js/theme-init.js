/* Applied before first paint to avoid a theme flash. External file so the CSP needs no inline script. */
(function () {
  try {
    if (localStorage.getItem('mle-theme') === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) { /* storage blocked: keep the default dark theme */ }
}());
