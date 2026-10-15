import { jsonResponse, optionsResponse } from "@/lib/oauth/metadata";
import { parseRegistration } from "@/lib/oauth/registration";
import { registerClient } from "@/lib/oauth/store";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, 400);
  }
  try {
    const parsed = parseRegistration(body);
    const created = await registerClient(parsed);
    return jsonResponse(
      {
        client_id: created.clientId,
        client_secret: created.clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        client_name: parsed.clientName,
        redirect_uris: parsed.redirectUris,
        grant_types: parsed.grantTypes,
        response_types: ["code"],
        token_endpoint_auth_method: parsed.tokenEndpointAuthMethod,
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed.";
    return jsonResponse({ error: "invalid_client_metadata", error_description: message }, 400);
  }
}

export function OPTIONS() {
  return optionsResponse();
}

export const dynamic = "force-dynamic";
