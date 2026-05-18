/**
 * Savers Bookmarklet — injected script for cross-browser quick-save.
 *
 * Opens a popup window to the Savers save-overlay page.
 * Auth works via your existing session cookie — no token needed.
 * A popup is a first-party context, so cookies are sent unlike in a cross-site iframe.
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
  var width = Math.min(540, screen.width - 48);
  var height = Math.min(680, screen.height - 48);
  var left = Math.round((screen.width - width) / 2);
  var top = Math.round((screen.height - height) / 2);

  var popup = window.open(
    apiBase + "/save-overlay?url=" + pageUrl,
    "savers-save",
    "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top + ",popup=yes"
  );

  if (!popup) {
    // Popup blocked — open a new tab instead
    window.open(apiBase + "/save?url=" + pageUrl, "_blank");
    return;
  }

  popup.focus();
})();
