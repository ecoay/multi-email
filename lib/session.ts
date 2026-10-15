import { cookies } from "next/headers";

import { readPayload, signPayload } from "@/lib/signed";

export const OWNER_COOKIE = "mg_owner";
const SESSION_TTL = 60 * 60 * 24 * 14;

export function createSessionToken(): string {
  return signPayload({ kind: "owner" }, SESSION_TTL);
}

export function sessionIsValid(token: string | undefined): boolean {
  if (!token) return false;
  const payload = readPayload<{ kind?: string }>(token);
  return payload?.kind === "owner";
}

export async function isOwnerSignedIn(): Promise<boolean> {
  const jar = await cookies();
  return sessionIsValid(jar.get(OWNER_COOKIE)?.value);
}

export async function setOwnerCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(OWNER_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearOwnerCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(OWNER_COOKIE);
}
