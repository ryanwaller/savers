// Helpers for extracting URLs from files/text dropped into the page.
// .webloc is macOS's URL shortcut format — a small XML plist containing
// <key>URL</key><string>…</string>. .url is a Windows INI variant.

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function parseWeblocXml(text: string): string | null {
  // Prefer proper XML parsing
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (!doc.querySelector("parsererror")) {
      const keys = Array.from(doc.querySelectorAll("key"));
      for (const k of keys) {
        if ((k.textContent ?? "").trim() === "URL") {
          const sib = k.nextElementSibling;
          if (sib && sib.tagName.toLowerCase() === "string") {
            const v = (sib.textContent ?? "").trim();
            if (isValidHttpUrl(v)) return v;
          }
        }
      }
    }
  } catch {
    // fall through to regex
  }
  // Regex fallback for anything the parser trips over
  const m = text.match(/<key>\s*URL\s*<\/key>\s*<string>([^<]+)<\/string>/i);
  if (m && isValidHttpUrl(m[1].trim())) return m[1].trim();
  return null;
}

function parseWindowsUrl(text: string): string | null {
  // .url files are INI: look for a `URL=…` line under [InternetShortcut]
  const m = text.match(/^\s*URL\s*=\s*(\S.*?)\s*$/im);
  if (m && isValidHttpUrl(m[1])) return m[1];
  return null;
}

export async function extractUrlsFromDataTransfer(
  dt: DataTransfer
): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const v = u.trim();
    if (!v || seen.has(v) || !isValidHttpUrl(v)) return;
    seen.add(v);
    urls.push(v);
  };

  // Dropped files (webloc / url / plain text with a URL)
  const files = Array.from(dt.files || []);
  for (const f of files) {
    const name = f.name.toLowerCase();
    try {
      const text = await f.text();
      if (name.endsWith(".webloc")) {
        const u = parseWeblocXml(text);
        if (u) push(u);
      } else if (name.endsWith(".url")) {
        const u = parseWindowsUrl(text);
        if (u) push(u);
      } else {
        // Try both parsers as a best-effort
        const w = parseWeblocXml(text);
        if (w) push(w);
        else {
          const u = parseWindowsUrl(text);
          if (u) push(u);
          else {
            // Last resort: first http(s) URL in the text
            const m = text.match(/https?:\/\/\S+/);
            if (m) push(m[0]);
          }
        }
      }
    } catch {
      // skip unreadable file
    }
  }

  // Plain URL drops (dragging the URL from Safari's address bar, etc.)
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    uriList
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#"))
      .forEach(push);
  }
  const plain = dt.getData("text/plain");
  if (plain) {
    plain
      .split(/\s+/)
      .filter(Boolean)
      .forEach(push);
  }

  return urls;
}

export function hasDroppableContent(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  const types = Array.from(dt.types || []);
  return types.includes("Files") || types.includes("text/uri-list");
}
