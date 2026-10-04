/*
 * F20 (DoD 12; audit R-10) — the one piece of the web app written in plain
 * ES5, so it runs on browsers too old to parse the application bundle.
 * The app marks <html data-app-ready> as soon as it starts (root layout).
 * If that has not happened shortly after the page finished loading, the
 * bundle could not run here: show a plain, static notice instead of a blank
 * screen. Declared baseline: docs/operations/browser-and-hardware-baseline.md.
 */
(function () {
  var GRACE_MS = 4000;
  function ready() {
    return document.documentElement.hasAttribute('data-app-ready');
  }
  function showNotice() {
    if (ready() || document.getElementById('atlas-unsupported-browser')) return;
    var box = document.createElement('div');
    box.id = 'atlas-unsupported-browser';
    box.setAttribute('role', 'alert');
    box.setAttribute(
      'style',
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:16px 20px;' +
        'background:#fef3c7;color:#78350f;font:16px/1.5 Arial,sans-serif;' +
        'border-bottom:2px solid #b45309'
    );
    var title = document.createElement('strong');
    title.appendChild(document.createTextNode('This browser cannot run the exam application. '));
    box.appendChild(title);
    box.appendChild(
      document.createTextNode(
        'Please use Google Chrome or Microsoft Edge (version 111 or newer) or Mozilla Firefox ' +
          '(version 115 or newer). On Windows 7 or 8.1, install Firefox ESR. ' +
          'Ask your teacher or the lab administrator for help.'
      )
    );
    document.body.appendChild(box);
  }
  function check() {
    setTimeout(showNotice, GRACE_MS);
  }
  if (document.readyState === 'complete') check();
  else if (window.addEventListener) window.addEventListener('load', check);
  else if (window.attachEvent) window.attachEvent('onload', check);
})();
