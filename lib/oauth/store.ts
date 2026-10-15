import { randomUUID } from "node:crypto";

import {
  ACCESS_TOKEN_TTL_SECONDS,
  MCP_SCOPE,
  REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/config";
import { randomToken, sha256Hex, safeEqualString } from "@/lib/crypto";
import { ensureSchema, getSql } from "@/lib/db";
import { fetchClientMetadata, type ResolvedClient } from "@/lib/oauth/cimd";
import { isAllowedRedirectUri } from "@/lib/oauth/redirect";
import { verifyPkceS256 } from "@/lib/oauth/pkce";

export type StoredClient = ResolvedClient;

type ClientRow = {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string | null;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
};

export async function registerClient(input: {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  grantTypes: string[];
}): Promise<{ clientId: string; clientSecret?: string }> {
  await ensureSchema();
  const sql = getSql();
  const clientId = `mcp_${randomToken(18)}`;
  const clientSecret = input.tokenEndpointAuthMethod === "none" ? undefined : randomToken(32);
  await sql`
    INSERT INTO oauth_clients (
      client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method, grant_types
    ) VALUES (
      ${clientId},
      ${clientSecret ? sha256Hex(clientSecret) : null},
      ${input.clientName},
      ${sql.json(input.redirectUris)},
      ${input.tokenEndpointAuthMethod},
      ${sql.json(input.grantTypes)}
    )
  `;
  return { clientId, clientSecret };
}

export async function resolveClient(clientId: string): Promise<StoredClient | null> {
  if (clientId.startsWith("https://")) {
    return fetchClientMetadata(clientId);
  }
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql<ClientRow[]>`SELECT * FROM oauth_clients WHERE client_id = ${clientId}`;
  if (!row) return null;
  const method = row.token_endpoint_auth_method;
  if (method !== "none" && method !== "client_secret_basic" && method !== "client_secret_post") return null;
  return {
    clientId: row.client_id,
    clientName: row.client_name || "MCP client",
    redirectUris: row.redirect_uris ?? [],
    tokenEndpointAuthMethod: method,
    clientSecretHash: row.client_secret_hash,
  };
}

export function clientAllowsRedirect(client: StoredClient, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri) && isAllowedRedirectUri(redirectUri);
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const code = randomToken(32);
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await sql`
    INSERT INTO oauth_codes (
      code_hash, client_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at
    ) VALUES (
      ${sha256Hex(code)},
      ${input.clientId},
      ${input.redirectUri},
      ${input.codeChallenge},
      'S256',
      ${input.scope},
      ${input.resource},
      ${expires}
    )
  `;
  return code;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  client: StoredClient;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<TokenResponse> {
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql<
    {
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      scope: string;
      resource: string;
    }[]
  >`
    UPDATE oauth_codes
    SET used_at = now()
    WHERE code_hash = ${sha256Hex(input.code)}
      AND used_at IS NULL
      AND expires_at > now()
    RETURNING client_id, redirect_uri, code_challenge, scope, resource
  `;
  if (!row) throw new OAuthGrantError("invalid_grant", "That authorization code is expired or already used.");
  if (row.client_id !== input.client.clientId || row.redirect_uri !== input.redirectUri) {
    throw new OAuthGrantError("invalid_grant", "The authorization code does not match this client.");
  }
  if (input.resource && normalizeResource(input.resource) !== normalizeResource(row.resource)) {
    throw new OAuthGrantError("invalid_target", "The resource does not match this authorization code.");
  }
  if (!verifyPkceS256(input.codeVerifier, row.code_challenge)) {
    throw new OAuthGrantError("invalid_grant", "PKCE verification failed.");
  }
  return issueTokenPair({
    clientId: input.client.clientId,
    scope: row.scope || MCP_SCOPE,
    resource: row.resource,
  });
}

export async function exchangeRefreshToken(input: {
  refreshToken: string;
  client: StoredClient;
  resource?: string;
}): Promise<TokenResponse> {
  await ensureSchema();
  const sql = getSql();
  const hash = sha256Hex(input.refreshToken);
  return sql.begin(async (tx) => {
    const [row] = await tx<
      {
        client_id: string;
        scope: string;
        resource: string;
        family_id: string;
        expires_at: Date;
        revoked_at: Date | null;
        replaced_by_hash: string | null;
      }[]
    >`SELECT * FROM oauth_refresh_tokens WHERE token_hash = ${hash} FOR UPDATE`;

    if (!row || row.client_id !== input.client.clientId) {
      throw new OAuthGrantError("invalid_grant", "Unknown refresh token.");
    }
    if (row.revoked_at || row.replaced_by_hash) {
      await tx`UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE family_id = ${row.family_id} AND revoked_at IS NULL`;
      await tx`UPDATE oauth_access_tokens SET revoked_at = now() WHERE family_id = ${row.family_id} AND revoked_at IS NULL`;
      throw new OAuthGrantError("invalid_grant", "This refresh token was already used. Sign in again.");
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw new OAuthGrantError("invalid_grant", "The refresh token has expired. Sign in again.");
    }
    if (input.resource && normalizeResource(input.resource) !== normalizeResource(row.resource)) {
      throw new OAuthGrantError("invalid_target", "The resource does not match this refresh token.");
    }

    const next = newTokenValues();
    await tx`
      UPDATE oauth_refresh_tokens
      SET revoked_at = now(), replaced_by_hash = ${sha256Hex(next.refreshToken)}
      WHERE token_hash = ${hash} AND revoked_at IS NULL
    `;
    await tx`
      INSERT INTO oauth_refresh_tokens (
        token_hash, client_id, scope, resource, family_id, expires_at
      ) VALUES (
        ${sha256Hex(next.refreshToken)},
        ${row.client_id},
        ${row.scope},
        ${row.resource},
        ${row.family_id},
        ${next.refreshExpires}
      )
    `;
    await tx`
      INSERT INTO oauth_access_tokens (
        token_hash, client_id, scope, resource, family_id, expires_at
      ) VALUES (
        ${sha256Hex(next.accessToken)},
        ${row.client_id},
        ${row.scope},
        ${row.resource},
        ${row.family_id},
        ${next.accessExpires}
      )
    `;
    return {
      access_token: next.accessToken,
      token_type: "Bearer" as const,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: next.refreshToken,
      scope: row.scope,
    };
  });
}

export async function verifyAccessToken(
  token: string | undefined,
  expectedResource: string,
): Promise<
  | {
      token: string;
      clientId: string;
      scopes: string[];
      expiresAt: number;
      resource: URL;
    }
  | undefined
> {
  if (!token) return undefined;
  await ensureSchema();
  const sql = getSql();
  const [row] = await sql<
    { client_id: string; scope: string; resource: string; expires_at: Date; revoked_at: Date | null }[]
  >`SELECT client_id, scope, resource, expires_at, revoked_at FROM oauth_access_tokens WHERE token_hash = ${sha256Hex(token)}`;
  if (!row || row.revoked_at || row.expires_at.getTime() <= Date.now()) return undefined;
  if (normalizeResource(row.resource) !== normalizeResource(expectedResource)) return undefined;
  return {
    token,
    clientId: row.client_id,
    scopes: row.scope.split(" ").filter(Boolean),
    expiresAt: Math.floor(row.expires_at.getTime() / 1000),
    resource: new URL(row.resource),
  };
}

export function authenticateClient(
  client: StoredClient,
  presentedSecret: string | undefined,
): boolean {
  if (client.tokenEndpointAuthMethod === "none") return true;
  if (!presentedSecret || !client.clientSecretHash) return false;
  return safeEqualString(sha256Hex(presentedSecret), client.clientSecretHash);
}

async function issueTokenPair(input: { clientId: string; scope: string; resource: string }): Promise<TokenResponse> {
  const sql = getSql();
  const next = newTokenValues();
  const familyId = randomUUID();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO oauth_refresh_tokens (
        token_hash, client_id, scope, resource, family_id, expires_at
      ) VALUES (
        ${sha256Hex(next.refreshToken)},
        ${input.clientId},
        ${input.scope},
        ${input.resource},
        ${familyId},
        ${next.refreshExpires}
      )
    `;
    await tx`
      INSERT INTO oauth_access_tokens (
        token_hash, client_id, scope, resource, family_id, expires_at
      ) VALUES (
        ${sha256Hex(next.accessToken)},
        ${input.clientId},
        ${input.scope},
        ${input.resource},
        ${familyId},
        ${next.accessExpires}
      )
    `;
  });
  return {
    access_token: next.accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: next.refreshToken,
    scope: input.scope,
  };
}

function newTokenValues() {
  return {
    accessToken: randomToken(32),
    refreshToken: randomToken(32),
    accessExpires: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    refreshExpires: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  };
}

export function normalizeResource(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export class OAuthGrantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OAuthGrantError";
  }
}

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};
