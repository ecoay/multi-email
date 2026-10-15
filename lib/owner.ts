import { safeEqualString } from "@/lib/crypto";
import { ensureSchema, getSql } from "@/lib/db";

const MAX_FAILURES = 8;
const LOCK_MS = 15 * 60 * 1000;

type GuardRow = { failures: number; locked_until: Date | null };

export async function checkOwnerPassword(
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = process.env.OWNER_PASSWORD?.trim();
  if (!expected) {
    return { ok: false, error: "OWNER_PASSWORD is not set on this deployment yet." };
  }
  if (!process.env.TOKEN_ENC_KEY?.trim()) {
    return { ok: false, error: "TOKEN_ENC_KEY is not set, so this site cannot start a session yet." };
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return { ok: false, error: "DATABASE_URL is not set. Connect Neon, then redeploy." };
  }

  await ensureSchema();
  const sql = getSql();
  const [guard] = await sql<GuardRow[]>`
    SELECT failures, locked_until FROM owner_guard WHERE id = 1
  `;
  if (guard?.locked_until && guard.locked_until.getTime() > Date.now()) {
    return { ok: false, error: "Too many tries. Wait 15 minutes, then try again." };
  }

  const matches = safeEqualString(password, expected);
  if (!matches) {
    const failures = (guard?.failures ?? 0) + 1;
    if (failures >= MAX_FAILURES) {
      await sql`
        UPDATE owner_guard
        SET failures = 0, locked_until = ${new Date(Date.now() + LOCK_MS)}
        WHERE id = 1
      `;
      return { ok: false, error: "Too many tries. Wait 15 minutes, then try again." };
    }
    await sql`UPDATE owner_guard SET failures = ${failures}, locked_until = NULL WHERE id = 1`;
    return { ok: false, error: "That password does not match." };
  }

  await sql`UPDATE owner_guard SET failures = 0, locked_until = NULL WHERE id = 1`;
  return { ok: true };
}
