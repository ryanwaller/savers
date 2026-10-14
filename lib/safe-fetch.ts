import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { normalizeUrl } from "./normalizeUrl";
import { isPublicUrl } from "./public-url";

type SafeFetchOptions = {
  method?: "GET" | "HEAD";
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  redirect?: "follow" | "manual";
};

function headersFromIncoming(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, values] of Object.entries(incoming)) {
    if (Array.isArray(values)) values.forEach((value) => headers.append(name, value));
    else if (values !== undefined) headers.set(name, values);
  }
  return headers;
}

function decodeBody(body: Buffer, headers: Headers, maxBytes: number): Buffer {
  const encoding = headers.get("content-encoding")?.toLowerCase();
  let decoded = body;
  if (encoding === "gzip") decoded = gunzipSync(body, { maxOutputLength: maxBytes });
  else if (encoding === "br") decoded = brotliDecompressSync(body, { maxOutputLength: maxBytes });
  else if (encoding === "deflate") decoded = inflateSync(body, { maxOutputLength: maxBytes });
  if (decoded.byteLength > maxBytes) throw new Error("Remote response is too large");
  if (decoded !== body) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return decoded;
}

async function pinnedAddress(url: URL, signal?: AbortSignal): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  if (literalFamily) return { address: hostname, family: literalFamily as 4 | 6 };
  const dnsLookup = lookup(hostname, { all: true, verbatim: true });
  let addresses: Awaited<typeof dnsLookup>;
  if (signal) {
    const onAbort = () => rejectAbort(signal);
    let rejectAbort: (signal: AbortSignal) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = (current) => reject(current.reason);
    });
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal.aborted) throw signal.reason;
      addresses = await Promise.race([dnsLookup, aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  } else {
    addresses = await dnsLookup;
  }
  if (addresses.length === 0 || addresses.some(({ address, family }) =>
    !isPublicUrl(`http://${family === 6 ? `[${address}]` : address}/`)
  )) {
    throw new Error("Remote host resolves to a non-public address");
  }
  return addresses[0] as { address: string; family: 4 | 6 };
}

export async function assertPublicDestination(rawUrl: string): Promise<void> {
  if (!isPublicUrl(rawUrl)) throw new Error("URL must be a public HTTP or HTTPS address");
  await pinnedAddress(new URL(rawUrl));
}

async function requestOnce(url: URL, options: Required<Pick<SafeFetchOptions, "method" | "maxBytes">> & SafeFetchOptions, signal: AbortSignal) {
  const address = await pinnedAddress(url, signal);
  const headers = new Headers(options.headers);
  if (!headers.has("accept-encoding")) headers.set("accept-encoding", "identity");
  return new Promise<{ status: number; headers: Headers; body: Buffer }>((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: options.method,
      headers: Object.fromEntries(headers.entries()),
      signal,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, (response) => {
      const responseHeaders = headersFromIncoming(response.headers);
      const status = response.statusCode ?? 502;
      if ((status >= 300 && status < 400 && responseHeaders.has("location")) || options.method === "HEAD") {
        response.destroy();
        resolve({ status, headers: responseHeaders, body: Buffer.alloc(0) });
        return;
      }
      const declaredLength = Number(responseHeaders.get("content-length"));
      if (declaredLength > options.maxBytes) {
        response.destroy();
        reject(new Error("Remote response is too large"));
        return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > options.maxBytes) {
          response.destroy(new Error("Remote response is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          resolve({ status, headers: responseHeaders, body: decodeBody(Buffer.concat(chunks), responseHeaders, options.maxBytes) });
        } catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

/** Fetch a public HTTP resource with DNS pinning, checked redirects and a hard body cap. */
export async function safePublicFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
  const normalized = normalizeUrl(rawUrl);
  if (!isPublicUrl(normalized)) throw new Error("URL must be a public HTTP or HTTPS address");
  const method = options.method ?? "GET";
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  let url = new URL(normalized);

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    if (!isPublicUrl(url.href)) throw new Error("Redirected to a non-public URL");
    const result = await requestOnce(url, { ...options, method, maxBytes }, signal);
    if (result.status >= 300 && result.status < 400 && result.headers.has("location")) {
      if (options.redirect === "manual") return new Response(null, { status: result.status, headers: result.headers });
      if (redirects === maxRedirects) throw new Error("Too many redirects");
      const nextUrl = new URL(result.headers.get("location")!, url);
      if (nextUrl.origin !== url.origin && options.headers) {
        const headers = new Headers(options.headers);
        for (const name of ["authorization", "cookie", "proxy-authorization", "x-api-key", "referer"]) headers.delete(name);
        options = { ...options, headers };
      }
      url = nextUrl;
      continue;
    }
    return new Response(method === "HEAD" || result.status === 204 || result.status === 304 ? null : new Uint8Array(result.body), {
      status: result.status,
      headers: result.headers,
    });
  }
  throw new Error("Too many redirects");
}
