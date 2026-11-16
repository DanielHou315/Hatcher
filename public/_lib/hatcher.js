// Hatcher frame helper, injected into every sandboxed page and figure.
// Talks to the page only through postMessage: size, theme, anchors, and internal links.
// Page code can use window.hatcher: theme() returns 'light' | 'dark'; onTheme(fn) calls fn on change.
(function () {
  'use strict';
  var parentWindow = window.parent !== window ? window.parent : null;
  var themeListeners = [];

  function post(message) {
    if (parentWindow) parentWindow.postMessage(message, '*');
  }

  function resolvedTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    var before = resolvedTheme();
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    var after = resolvedTheme();
    if (after !== before) themeListeners.forEach(function (fn) { try { fn(after); } catch (e) { console.error(e); } });
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!document.documentElement.hasAttribute('data-theme')) {
        var now = resolvedTheme();
        themeListeners.forEach(function (fn) { fn(now); });
      }
    });
  }

  window.hatcher = {
    theme: resolvedTheme,
    onTheme: function (fn) { if (typeof fn === 'function') themeListeners.push(fn); },
  };

  if (!parentWindow) return; // opened directly: nothing to talk to

  function anchorTop(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    return el.getBoundingClientRect().top + window.scrollY;
  }

  window.addEventListener('message', function (event) {
    if (event.source !== parentWindow) return;
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'hatcher:hello') {
      // The page attached its listener (possibly after we started): repeat size and readiness.
      lastHeight = 0;
      reportSize();
      post({ type: 'hatcher:ready' });
    }
    if (data.type === 'hatcher:theme') setTheme(data.theme);
    if (data.type === 'hatcher:scroll-to' && typeof data.id === 'string') {
      var top = anchorTop(data.id);
      if (top !== null) post({ type: 'hatcher:anchor', id: data.id, top: top });
    }
  });

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (href.charAt(0) === '#' && href.length > 1) {
      var id = decodeURIComponent(href.slice(1));
      var top = anchorTop(id);
      if (top !== null) {
        event.preventDefault();
        post({ type: 'hatcher:anchor', id: id, top: top });
      }
    } else if (/^\/(?![\/\\])/.test(href) && !/^\/(c|_lib|api)\//.test(href)) {
      event.preventDefault();
      post({ type: 'hatcher:navigate', href: href });
    } else if (/^https?:\/\//i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  });

  // Chrome pauses rendering (and requestAnimationFrame) in off-screen cross-origin frames, so
  // measure directly: on load, on resize, and on a slow timer, which keeps running when throttled.
  var lastHeight = 0;
  function reportSize() {
    var height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (height > 0 && height !== lastHeight) {
      lastHeight = height;
      post({ type: 'hatcher:resize', height: height });
    }
  }

  function start() {
    if (window.renderMathInElement) {
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
        ],
        throwOnError: false,
      });
    }
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(reportSize);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    }
    window.addEventListener('load', reportSize);
    window.addEventListener('resize', reportSize);
    setInterval(reportSize, 500);
    reportSize();
    post({ type: 'hatcher:ready' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
