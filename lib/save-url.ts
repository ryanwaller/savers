import { getPublicSiteUrl } from "@/lib/site-url";

type BuildSaveUrlOptions = {
  baseUrl?: string;
  token?: string | null;
  sourceUrl?: string | null;
};

export function buildSaveUrl({
  baseUrl = getPublicSiteUrl(),
  token,
  sourceUrl,
}: BuildSaveUrlOptions = {}): string {
  const url = new URL("/save", baseUrl);
  if (token?.trim()) {
    url.searchParams.set("token", token.trim());
  }
  if (sourceUrl?.trim()) {
    url.searchParams.set("u", sourceUrl.trim());
  }
  return url.toString();
}

type BuildBookmarkletCodeOptions = {
  baseUrl?: string;
  token?: string | null;
};

export function buildBookmarkletCode(options: BuildBookmarkletCodeOptions = {}): string {
  const base = JSON.stringify((options.baseUrl || getPublicSiteUrl()).replace(/\/$/, ""));

  // Token provided: show feedback immediately, then save through a hidden
  // first-party iframe so the request does not depend on third-party cookies.
  const token = options.token?.trim();
  if (token) {
    const t = JSON.stringify(token);
    return [
      "javascript:(function(){",
      "if(document.getElementById('savers-bm-root'))return;",
      `var b=${base},t=${t},u=b+'/quick-save.html?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&token='+encodeURIComponent(t);`,
      "var r=document.createElement('div');r.id='savers-bm-root';r.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 24px);pointer-events:none';",
      "var p=document.createElement('div');p.style.cssText='box-sizing:border-box;display:flex;align-items:center;gap:8px;max-width:360px;padding:9px 12px;border-radius:9px;background:#111;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.24);font:13px/1.35 system-ui,sans-serif;pointer-events:auto';",
      "var s=document.createElement('div');s.textContent='Saving to Unsorted…';s.style.cssText='min-width:0;flex:1';p.appendChild(s);",
      "var retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.style.cssText='display:none;border:0;border-radius:4px;padding:4px 6px;background:#333;color:#fff;font:12px system-ui,sans-serif;cursor:pointer';p.appendChild(retry);",
      "var c=document.createElement('button');c.type='button';c.textContent='×';c.title='Close';c.style.cssText='border:0;padding:0 2px;background:transparent;color:#fff;font:18px/1 system-ui,sans-serif;cursor:pointer';p.appendChild(c);",
      "var i=document.createElement('iframe');i.title='Saving to Savers';i.style.display='none';r.appendChild(p);r.appendChild(i);(document.body||document.documentElement).appendChild(r);",
      "var timeout,done=false;function close(){clearTimeout(timeout);window.removeEventListener('message',onMessage);document.removeEventListener('keydown',onKey);r.remove()}",
      "function onKey(e){if(e.key==='Escape')close()}function onMessage(e){if(e.origin!==b||e.source!==i.contentWindow||!e.data||e.data.type!=='savers-quick-save')return;clearTimeout(timeout);done=true;s.textContent=e.data.message||'Could not save this page.';retry.style.display=e.data.state==='error'?'inline-block':'none';if(e.data.state==='saved')timeout=setTimeout(close,1200)}",
      "function start(){done=false;retry.style.display='none';s.textContent='Saving to Unsorted…';i.src=u;timeout=setTimeout(function(){if(!done)s.textContent='Still saving. Savers is taking longer than usual.'},20000)}",
      "c.onclick=close;retry.onclick=function(){clearTimeout(timeout);i.src='about:blank';setTimeout(start,0)};window.addEventListener('message',onMessage);document.addEventListener('keydown',onKey);start()",
      "})()",
    ].join("");
  }

  // No token: open the quick-save page in a first-party popup for cookie auth.
  return `javascript:(function(){var b=${base},u=b+'/quick-save.html?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title);var p=window.open(u,'savers-save');if(p){p.focus();return}var f=document.createElement('form');f.method='GET';f.action=b+'/quick-save.html';f.target='savers-save';f.style.display='none';var a=document.createElement('input');a.name='url';a.value=location.href;f.appendChild(a);var t=document.createElement('input');t.name='title';t.value=document.title;f.appendChild(t);document.body.appendChild(f);f.submit();document.body.removeChild(f)})()`;
}

export function resolveSaveSource(
  params: URLSearchParams,
  referrer?: string | null,
): string | null {
  const direct = params.get("u") || params.get("url");
  if (direct?.trim()) return direct.trim();

  const fallback = String(referrer || "").trim();
  return fallback || null;
}
