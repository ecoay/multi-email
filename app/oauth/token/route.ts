import { ClientMetadataError } from "@/lib/oauth/cimd";
import { jsonResponse, optionsResponse } from "@/lib/oauth/metadata";
import {
  authenticateClient,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  OAuthGrantError,
  resolveClient,
} from "@/lib/oauth/store";

export async function POST(request: Request) {
  const params = await readParams(request);
  const basic = readBasicAuth(request);
  const clientId = basic?.clientId || params.get("client_id") || "";
  const clientSecret = basic?.clientSecret || params.get("client_secret") || undefined;

  try {
    const client = await resolveClient(clientId);
    if (!client || !authenticateClient(client, clientSecret)) {
      return jsonResponse({ error: "invalid_client", error_description: "Unknown client or bad client secret." }, 401);
    }
    const grant = params.get("grant_type");
    if (grant === "authorization_code") {
      const tokens = await exchangeAuthorizationCode({
        code: params.get("code") || "",
        client,
        redirectUri: params.get("redirect_uri") || "",
        codeVerifier: params.get("code_verifier") || "",
        resource: params.get("resource") || undefined,
      });
      return jsonResponse(tokens);
    }
    if (grant === "refresh_token") {
      const tokens = await exchangeRefreshToken({
        refreshToken: params.get("refresh_token") || "",
        client,
        resource: params.get("resource") || undefined,
      });
      return jsonResponse(tokens);
    }
    return jsonResponse({ error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token." }, 400);
  } catch (error) {
    if (error instanceof OAuthGrantError) {
      return jsonResponse({ error: error.code, error_description: error.message }, error.status);
    }
    if (error instanceof ClientMetadataError) {
      return jsonResponse({ error: "invalid_client", error_description: error.message }, 401);
    }
    console.error("token endpoint failed", error instanceof Error ? error.message : error);
    return jsonResponse({ error: "server_error", error_description: "Could not issue a token." }, 500);
  }
}

export function OPTIONS() {
  return optionsResponse();
}

async function readParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string") params.set(key, value);
    }
    return params;
  }
  return new URLSearchParams(await request.text());
}

function readBasicAuth(request: Request): { clientId: string; clientSecret: string } | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  const index = decoded.indexOf(":");
  if (index < 0) return null;
  return { clientId: decodeURIComponent(decoded.slice(0, index)), clientSecret: decodeURIComponent(decoded.slice(index + 1)) };
}

export const dynamic = "force-dynamic";
