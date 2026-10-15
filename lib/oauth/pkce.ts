import { createHash, timingSafeEqual } from "node:crypto";

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[\w.~-]+$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const left = Buffer.from(computed);
  const right = Buffer.from(challenge);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
