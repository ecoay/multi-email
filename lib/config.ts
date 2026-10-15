import { deriveEncryptionKey } from "@/lib/crypto";

export const MCP_SCOPE = "accounts";
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
export const AUTH_CODE_TTL_SECONDS = 60 * 10;

export function writeEnabled(): boolean {
  const value = process.env.GMAIL_ENABLE_WRITE?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function baseUrl(request?: Request): string {
  const fromEnv = process.env.BASE_URL?.trim();
  if (fromEnv) return stripSlash(fromEnv);

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host")?.trim();
    if (host) {
      const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const proto =
        forwardedProto ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://127.0.0.1:43123";
}

export function mcpResourceUrl(request?: Request): string {
  return `${baseUrl(request)}/api/mcp`;
}

export function googleRedirectUri(request?: Request): string {
  return `${baseUrl(request)}/api/google/callback`;
}

export function encryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENC_KEY?.trim();
  if (!secret) {
    throw new Error("TOKEN_ENC_KEY is not set.");
  }
  return deriveEncryptionKey(secret);
}

export function ownerPassword(): string {
  const value = process.env.OWNER_PASSWORD;
  if (!value) throw new Error("OWNER_PASSWORD is not set.");
  return value;
}

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/accounts";
  }
  return value;
}
