import { normalizeUrl } from "./normalizeUrl";

function isPublicIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(host: string): boolean {
  const value = host.slice(1, -1).toLowerCase();
  // IPv4-mapped addresses can hide a loopback or private IPv4 destination.
  if (value.startsWith("::ffff:") || value.startsWith("0:0:0:0:0:ffff:")) return false;
  const first = Number.parseInt(value.split(":", 1)[0], 16);
  // Globally routable unicast is 2000::/3. Exclude the documentation range.
  return first >= 0x2000 && first <= 0x3fff && !value.startsWith("2001:db8:");
}

export function isPublicUrl(input: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(input));
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) return isPublicIpv6(host);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPublicIpv4(host);
    if (!host.includes(".")) return false;
    return !["localhost", "local", "localdomain", "internal", "test", "invalid", "example", "onion"]
      .some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) &&
      host !== "metadata.google.internal";
  } catch {
    return false;
  }
}
