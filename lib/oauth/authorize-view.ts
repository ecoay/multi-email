import { MCP_SCOPE, mcpResourceUrl } from "@/lib/config";
import { ClientMetadataError } from "@/lib/oauth/cimd";
import { redirectHost } from "@/lib/oauth/redirect";
import { clientAllowsRedirect, normalizeResource, resolveClient } from "@/lib/oauth/store";

export type AuthorizeView = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  redirectHost: string;
  scope: string;
  resource: string;
  state: string;
  codeChallenge: string;
  localhostWarning: boolean;
};

export async function inspectAuthorizeRequest(request: Request): Promise<{ ok: true; view: AuthorizeView } | { ok: false; error: string }> {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("client_id")?.trim() || "";
  const redirectUri = params.get("redirect_uri")?.trim() || "";
  const responseType = params.get("response_type")?.trim() || "";
  const challenge = params.get("code_challenge")?.trim() || "";
  const method = params.get("code_challenge_method")?.trim() || "";
  const state = params.get("state") ?? "";
  const scopeParam = params.get("scope")?.trim() || "";
  const resourceParam = params.get("resource")?.trim() || "";
  const resource = mcpResourceUrl(request);

  if (!clientId) return { ok: false, error: "The sign-in request is missing a client id." };
  if (responseType !== "code") return { ok: false, error: "Only the authorization code flow is supported." };
  if (!challenge) return { ok: false, error: "The client did not send a PKCE code challenge." };
  if (method && method !== "S256") return { ok: false, error: "PKCE must use the S256 method." };
  if (!state) return { ok: false, error: "The client did not send a state value." };
  if (scopeParam && scopeParam.split(" ").some((scope) => scope && scope !== MCP_SCOPE)) {
    return { ok: false, error: `The only scope this connector grants is ${MCP_SCOPE}.` };
  }
  if (resourceParam && normalizeResource(resourceParam) !== normalizeResource(resource)) {
    return { ok: false, error: "This sign-in request is for a different connector URL." };
  }

  try {
    const client = await resolveClient(clientId);
    if (!client) return { ok: false, error: "This connector does not recognize that client. Add it again from the AI app." };
    if (!redirectUri || !clientAllowsRedirect(client, redirectUri)) {
      return { ok: false, error: "The redirect address is not registered for that client." };
    }
    const host = redirectHost(redirectUri);
    return {
      ok: true,
      view: {
        clientId,
        clientName: client.clientName,
        redirectUri,
        redirectHost: host,
        scope: MCP_SCOPE,
        resource,
        state,
        codeChallenge: challenge,
        localhostWarning: host.startsWith("localhost") || host.startsWith("127.0.0.1"),
      },
    };
  } catch (error) {
    if (error instanceof ClientMetadataError) return { ok: false, error: error.message };
    console.error("authorize lookup failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "Could not check that client. Try again." };
  }
}
