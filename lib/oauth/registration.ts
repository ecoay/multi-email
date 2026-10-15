import { isAllowedRedirectUri } from "@/lib/oauth/redirect";

export type RegistrationRequest = {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  grantTypes: string[];
};

export function parseRegistration(body: unknown): RegistrationRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Registration body must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  const redirectUris = Array.isArray(record.redirect_uris)
    ? record.redirect_uris.filter((item): item is string => typeof item === "string")
    : [];
  if (redirectUris.length === 0 || redirectUris.length > 10) {
    throw new Error("Provide between 1 and 10 redirect URIs.");
  }
  for (const uri of redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      throw new Error(`Redirect URI is not allowed: ${uri}`);
    }
  }

  const method = typeof record.token_endpoint_auth_method === "string" ? record.token_endpoint_auth_method : "none";
  if (method !== "none" && method !== "client_secret_basic" && method !== "client_secret_post") {
    throw new Error("token_endpoint_auth_method must be none, client_secret_basic, or client_secret_post.");
  }

  const grantTypes = Array.isArray(record.grant_types)
    ? record.grant_types.filter((item): item is string => typeof item === "string")
    : ["authorization_code", "refresh_token"];
  if (!grantTypes.includes("authorization_code")) {
    throw new Error("authorization_code is required.");
  }
  if (grantTypes.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")) {
    throw new Error("Only authorization_code and refresh_token grants are supported.");
  }

  if (Array.isArray(record.response_types)) {
    const responseTypes = record.response_types.filter((item): item is string => typeof item === "string");
    if (responseTypes.some((item) => item !== "code")) {
      throw new Error("Only the code response type is supported.");
    }
  }

  const clientName = typeof record.client_name === "string" && record.client_name.trim()
    ? record.client_name.trim().slice(0, 120)
    : "MCP client";

  return {
    clientName,
    redirectUris,
    tokenEndpointAuthMethod: method,
    grantTypes,
  };
}
