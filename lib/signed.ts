import { createHmac, timingSafeEqual } from "node:crypto";

import { encryptionKey } from "@/lib/config";

export function signPayload(data: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const signature = createHmac("sha256", encryptionKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readPayload<T extends Record<string, unknown>>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature || token.split(".").length !== 2) return null;
  const expected = createHmac("sha256", encryptionKey()).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
