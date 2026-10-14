/**
 * Savers Bookmarklet — injected script for cross-browser quick-save.
 *
 * Opens a popup window that saves the current page to Unsorted.
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
  } catch {}

  var pageUrl = encodeURIComponent(location.href);
  var pageTitle = encodeURIComponent(document.title);
  var width = Math.min(540, screen.width - 48);
  var height = Math.min(680, screen.height - 48);
  var left = Math.round((screen.width - width) / 2);
  var top = Math.round((screen.height - height) / 2);

  var popup = window.open(
    apiBase + "/quick-save.html?url=" + pageUrl + "&title=" + pageTitle,
    "savers-save",
    "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top + ",popup=yes"
  );

  if (!popup) {
    // A form-targeted tab still works when the popup window is blocked.
    var form = document.createElement("form");
    form.method = "GET";
    form.action = apiBase + "/quick-save.html";
    form.target = "savers-save";
    form.style.display = "none";
    var urlInput = document.createElement("input");
    urlInput.name = "url";
    urlInput.value = location.href;
    form.appendChild(urlInput);
    var titleInput = document.createElement("input");
    titleInput.name = "title";
    titleInput.value = document.title;
    form.appendChild(titleInput);
    document.body.appendChild(form);
    form.submit();
    form.remove();
    return;
  }

  popup.focus();
})();
