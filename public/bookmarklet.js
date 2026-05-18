/**
 * Savers Bookmarklet — injected script for cross-browser quick-save.
 *
 * Creates an iframe overlay that loads the Savers save-overlay page.
 * Auth works via your existing session cookie — no token needed.
 *
 * Usage: bookmark the minified one-liner below:
 *   javascript:var d=document,s=d.createElement('script');s.src='https://savers-production.up.railway.app/bookmarklet.js';d.head.appendChild(s);
 */
(function () {
  if (document.getElementById("savers-bm-root")) return;

  var apiBase = "https://savers-production.up.railway.app";
  try {
    var me = document.currentScript;
    if (me && me.src) {
      var origin = new URL(me.src).origin;
      if (origin) apiBase = origin;
    }
  } catch (_) {}

  var pageUrl = encodeURIComponent(location.href);

  var root = document.createElement("div");
  root.id = "savers-bm-root";
  root.innerHTML =
    '<div id="savers-bm-backdrop" style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.52);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:24px">' +
    '<iframe id="savers-bm-iframe" src="' + apiBase + '/save-overlay?url=' + pageUrl + '" ' +
    'style="border:0;width:min(540px,calc(100vw - 48px));height:min(680px,calc(100vh - 48px));border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,0.32)" ' +
    'allow="clipboard-write" ' +
    'title="Save to Savers"></iframe>' +
    "</div>";
  document.body.appendChild(root);

  var backdrop = root.querySelector("#savers-bm-backdrop");
  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop) root.remove();
  });

  window.addEventListener("message", function (e) {
    if (e.origin !== apiBase) return;
    if (!e.data || typeof e.data.type !== "string") return;
    if (e.data.type === "close" || e.data.type === "saved") {
      root.remove();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") root.remove();
  });
})();
