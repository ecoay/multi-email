const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "blob:", "vbscript:"]);

export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (BLOCKED_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "https:") return Boolean(url.hostname);
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  }
  if (!/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) return false;
  return url.hostname.length > 0 || url.pathname.length > 1;
}

export function redirectHost(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || url.protocol.replace(":", "");
  } catch {
    return "unknown";
  }
}
