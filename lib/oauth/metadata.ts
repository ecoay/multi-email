import { generateProtectedResourceMetadata } from "mcp-handler";

import { baseUrl, MCP_SCOPE, mcpResourceUrl } from "@/lib/config";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export function protectedResourceDocument(request: Request) {
  const origin = baseUrl(request);
  return generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: mcpResourceUrl(request),
    additionalMetadata: {
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ["header"],
    },
  });
}

export function authorizationServerDocument(request: Request) {
  const origin = baseUrl(request);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    scopes_supported: [MCP_SCOPE],
    client_id_metadata_document_supported: true,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
