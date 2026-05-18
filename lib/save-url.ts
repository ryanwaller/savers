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

  // Token provided — build an iframe overlay using DOM methods.
  // No innerHTML parsing, no cookie dependency, no popup blocker issues.
  const token = options.token?.trim();
  if (token) {
    const t = JSON.stringify(token);
    return `javascript:(function(){if(document.getElementById('savers-bm-root'))return;var b=${base},t=${t},u=b+'/save-overlay?url='+encodeURIComponent(location.href)+'&token='+encodeURIComponent(t),r=document.createElement('div');r.id='savers-bm-root';var d=document.createElement('div');d.id='savers-bm-backdrop';d.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.52);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:24px';var i=document.createElement('iframe');i.id='savers-bm-iframe';i.src=u;i.style.cssText='border:0;width:min(540px,calc(100vw - 48px));height:min(680px,calc(100vh - 48px));border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,0.32)';i.allow='clipboard-write';i.title='Save to Savers';d.appendChild(i);r.appendChild(d);document.body.appendChild(r);d.addEventListener('click',function(e){if(e.target===e.currentTarget)r.remove()});window.addEventListener('message',function(e){if(e.origin!==b)return;if(e.data&&(e.data.type==='close'||e.data.type==='saved'))r.remove()});document.addEventListener('keydown',function(e){if(e.key==='Escape')r.remove()})})()`;
  }

  // No token — fall back to popup (cookie-based auth, works if signed in)
  return `javascript:(function(){var b=${base},u=b+'/save-overlay?url='+encodeURIComponent(location.href);var p=window.open(u,'savers-save');if(p){p.focus();return}var f=document.createElement('form');f.method='GET';f.action=u;f.target='savers-save';f.style.display='none';document.body.appendChild(f);f.submit();document.body.removeChild(f)})()`;
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
