import { deriveEncryptionKey } from "@/lib/crypto";
import { databaseUrl, ensureSchema, getSql } from "@/lib/db";
import { baseUrl, writeEnabled } from "@/lib/config";

export type SetupStatus = {
  ownerPassword: boolean;
  tokenKey: boolean;
  tokenKeyError?: string;
  googleClient: boolean;
  googleSecret: boolean;
  database: "missing" | "ok" | "error";
  databaseError?: string;
  writeEnabled: boolean;
  siteUrl: string;
  mcpUrl: string;
  googleRedirect: string;
};

export async function setupStatus(): Promise<SetupStatus> {
  const siteUrl = baseUrl();
  let tokenKey = false;
  let tokenKeyError: string | undefined;
  if (process.env.TOKEN_ENC_KEY?.trim()) {
    try {
      deriveEncryptionKey(process.env.TOKEN_ENC_KEY);
      tokenKey = true;
    } catch (error) {
      tokenKeyError = error instanceof Error ? error.message : "TOKEN_ENC_KEY is not valid.";
    }
  }

  let database: SetupStatus["database"] = databaseUrl() ? "ok" : "missing";
  let databaseError: string | undefined;
  if (database === "ok") {
    try {
      await ensureSchema();
      const sql = getSql();
      await sql`select 1 as ok`;
    } catch (error) {
      database = "error";
      databaseError = publicError(error);
    }
  }

  return {
    ownerPassword: Boolean(process.env.OWNER_PASSWORD),
    tokenKey,
    tokenKeyError,
    googleClient: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
    googleSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
    database,
    databaseError,
    writeEnabled: writeEnabled(),
    siteUrl,
    mcpUrl: `${siteUrl}/api/mcp`,
    googleRedirect: `${siteUrl}/api/google/callback`,
  };
}

export function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  if (/postgres(ql)?:\/\//i.test(message) || /password authentication/i.test(message)) {
    return "The database refused the connection. In Vercel, confirm the Neon integration is connected, then redeploy.";
  }
  return message.slice(0, 180);
}
