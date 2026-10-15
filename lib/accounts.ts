import { decryptString, encryptString } from "@/lib/crypto";
import { encryptionKey } from "@/lib/config";
import { ensureSchema, getSql } from "@/lib/db";
import type { GmailRuntimeAccount, TokenStore } from "@/lib/gmail/api";

type AccountRow = {
  id: string;
  email: string;
  nickname: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: Date | null;
  scopes: string;
  status: string;
  status_error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PublicAccount = {
  id: string;
  email: string;
  nickname: string;
  scopes: string;
  status: string;
  statusError: string | null;
  createdAt: string;
  updatedAt: string;
};

export function cleanNickname(input: string): string {
  const cleaned = input.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!cleaned) return "";
  if (cleaned.toLowerCase() === "all") {
    throw new Error('Nickname "all" is reserved. Pick another name.');
  }
  if (!/^[\p{L}\p{N} ._@+-]+$/u.test(cleaned)) {
    throw new Error("Use letters, numbers, spaces, or . _ @ + - in the nickname.");
  }
  return cleaned;
}

export async function listPublicAccounts(): Promise<PublicAccount[]> {
  const rows = await listRows();
  return rows.map(toPublic);
}

export async function listRuntimeAccounts(): Promise<GmailRuntimeAccount[]> {
  const rows = await listRows();
  const key = encryptionKey();
  return rows.map((row) => {
    try {
      return {
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        refreshToken: decryptString(row.refresh_token_enc, key),
        accessToken: row.access_token_enc ? decryptString(row.access_token_enc, key) : null,
        accessTokenExpiresAt: row.access_token_expires_at,
        scopes: row.scopes,
        status: row.status,
        statusError: row.status_error,
      };
    } catch {
      return {
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        refreshToken: "",
        accessToken: null,
        accessTokenExpiresAt: null,
        scopes: row.scopes,
        status: "error",
        statusError: "Saved keys could not be unlocked. TOKEN_ENC_KEY may have changed. Link this account again.",
      };
    }
  });
}

export async function getAccountById(id: string): Promise<PublicAccount | null> {
  if (!isUuid(id)) return null;
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql<AccountRow[]>`SELECT * FROM gmail_accounts WHERE id = ${id}`;
  return row ? toPublic(row) : null;
}

export async function saveLinkedAccount(input: {
  email: string;
  nickname: string;
  refreshToken: string | null;
  accessToken: string;
  accessTokenExpiresAt: Date;
  scopes: string;
  existingId?: string | null;
}): Promise<{ email: string; nickname: string; created: boolean }> {
  await ensureSchema();
  const sql = getSql();
  const key = encryptionKey();
  const email = input.email.trim().toLowerCase();
  const [existing] = await sql<AccountRow[]>`SELECT * FROM gmail_accounts WHERE email = ${email}`;

  const refreshToken = input.refreshToken || (existing ? decryptString(existing.refresh_token_enc, key) : "");
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Remove the app from your Google account permissions and try Add Gmail again.");
  }
  const refreshEnc = encryptString(refreshToken, key);
  const accessEnc = encryptString(input.accessToken, key);

  if (existing) {
    await sql`
      UPDATE gmail_accounts
      SET refresh_token_enc = ${refreshEnc},
          access_token_enc = ${accessEnc},
          access_token_expires_at = ${input.accessTokenExpiresAt},
          scopes = ${input.scopes},
          status = 'active',
          status_error = NULL,
          updated_at = now()
      WHERE id = ${existing.id}
    `;
    return { email, nickname: existing.nickname, created: false };
  }

  const nickname = await uniqueNickname(input.nickname || email.split("@")[0] || "mailbox", email);
  await sql`
    INSERT INTO gmail_accounts (
      email, nickname, refresh_token_enc, access_token_enc, access_token_expires_at, scopes, status
    ) VALUES (
      ${email}, ${nickname}, ${refreshEnc}, ${accessEnc}, ${input.accessTokenExpiresAt}, ${input.scopes}, 'active'
    )
  `;
  return { email, nickname, created: true };
}

export async function renameAccount(id: string, nickname: string): Promise<void> {
  if (!isUuid(id)) throw new Error("Unknown account.");
  const cleaned = cleanNickname(nickname);
  if (!cleaned) throw new Error("Enter a nickname.");
  await ensureSchema();
  const sql = getSql();
  const [clash] = await sql<{ id: string }[]>`
    SELECT id FROM gmail_accounts WHERE lower(nickname) = lower(${cleaned}) AND id <> ${id}
  `;
  if (clash) throw new Error("Another account already uses that nickname.");
  const updated = await sql`
    UPDATE gmail_accounts SET nickname = ${cleaned}, updated_at = now() WHERE id = ${id}
  `;
  if (updated.count === 0) throw new Error("Unknown account.");
}

export async function deleteAccount(id: string): Promise<void> {
  if (!isUuid(id)) return;
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM gmail_accounts WHERE id = ${id}`;
}

export function dbTokenStore(): TokenStore {
  return {
    async saveTokens(accountId, update) {
      const key = encryptionKey();
      const sql = getSql();
      const accessEnc = encryptString(update.accessToken, key);
      if (update.refreshToken) {
        const refreshEnc = encryptString(update.refreshToken, key);
        await sql`
          UPDATE gmail_accounts
          SET access_token_enc = ${accessEnc},
              access_token_expires_at = ${update.accessTokenExpiresAt},
              refresh_token_enc = ${refreshEnc},
              updated_at = now()
          WHERE id = ${accountId}
        `;
        return;
      }
      await sql`
        UPDATE gmail_accounts
        SET access_token_enc = ${accessEnc},
            access_token_expires_at = ${update.accessTokenExpiresAt},
            updated_at = now()
        WHERE id = ${accountId}
      `;
    },
    async markError(accountId, error) {
      const sql = getSql();
      await sql`
        UPDATE gmail_accounts
        SET status = 'error', status_error = ${error.slice(0, 500)}, updated_at = now()
        WHERE id = ${accountId}
      `;
    },
    async markActive(accountId) {
      const sql = getSql();
      await sql`
        UPDATE gmail_accounts
        SET status = 'active', status_error = NULL, updated_at = now()
        WHERE id = ${accountId}
      `;
    },
  };
}

async function uniqueNickname(desired: string, email: string): Promise<string> {
  const sql = getSql();
  let base = "mailbox";
  try {
    base = cleanNickname(desired) || email.split("@")[0] || "mailbox";
  } catch {
    base = email.split("@")[0]?.replace(/[^\p{L}\p{N}._+-]/gu, "").slice(0, 40) || "mailbox";
  }
  if (base.toLowerCase() === "all") base = "mailbox";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0 ? base.slice(0, 40) : `${base.slice(0, 34)}-${attempt + 1}`;
    const [row] = await sql<{ email: string }[]>`
      SELECT email FROM gmail_accounts WHERE lower(nickname) = lower(${candidate})
    `;
    if (!row || row.email === email) return candidate;
  }
  throw new Error("Could not choose a nickname. Enter one yourself.");
}

async function listRows(): Promise<AccountRow[]> {
  await ensureSchema();
  const sql = getSql();
  return sql<AccountRow[]>`SELECT * FROM gmail_accounts ORDER BY nickname ASC`;
}

function toPublic(row: AccountRow): PublicAccount {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    scopes: row.scopes,
    status: row.status,
    statusError: row.status_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
