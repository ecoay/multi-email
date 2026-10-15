import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isAllowedRedirectUri } from "@/lib/oauth/redirect";

export class ClientMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientMetadataError";
  }
}

export type ResolvedClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  clientSecretHash: string | null;
};

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata.internal"]);

export async function fetchClientMetadata(
  clientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedClient> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new ClientMetadataError("client_id is not a URL.");
  }
  if (url.protocol !== "https:") throw new ClientMetadataError("Client metadata must use https.");
  if (url.username || url.password) throw new ClientMetadataError("Client metadata URL cannot include a password.");
  if (BLOCKED_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
    throw new ClientMetadataError("That client metadata host is not allowed.");
  }
  await assertPublicHost(url.hostname);

  const response = await fetchImpl(url, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new ClientMetadataError("Could not fetch the client metadata document.");
  const text = await response.text();
  if (text.length > 65_536) throw new ClientMetadataError("The client metadata document is too large.");

  let document: {
    client_id?: string;
    client_name?: string;
    redirect_uris?: unknown;
    token_endpoint_auth_method?: string;
  };
  try {
    document = JSON.parse(text) as typeof document;
  } catch {
    throw new ClientMetadataError("The client metadata document is not JSON.");
  }
  if (document.client_id !== clientId) {
    throw new ClientMetadataError("client_id in the metadata document does not match the URL.");
  }
  const redirectUris = stringArray(document.redirect_uris).filter(isAllowedRedirectUri);
  if (redirectUris.length === 0) throw new ClientMetadataError("The client metadata has no usable redirect URI.");
  const method = document.token_endpoint_auth_method ?? "none";
  if (method !== "none" && method !== "client_secret_basic" && method !== "client_secret_post") {
    throw new ClientMetadataError("Unsupported token endpoint auth method.");
  }
  return {
    clientId,
    clientName: document.client_name?.slice(0, 120) || "MCP client",
    redirectUris,
    tokenEndpointAuthMethod: method,
    clientSecretHash: null,
  };
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new ClientMetadataError("That client metadata host is not allowed.");
    return;
  }
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new ClientMetadataError("That client metadata host is not allowed.");
  }
}

export function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().replace(/^::ffff:/, "");
  if (mapped === "::1" || mapped === "0.0.0.0") return true;
  if (mapped.startsWith("fe80:") || mapped.startsWith("fc") || mapped.startsWith("fd")) return true;
  if (mapped.includes(":")) return false;
  const parts = mapped.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
