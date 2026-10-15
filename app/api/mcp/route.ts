import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { baseUrl, MCP_SCOPE } from "@/lib/config";
import { registerTools } from "@/lib/mcp/register";
import { verifyAccessToken } from "@/lib/oauth/store";

const mcp = createMcpHandler(registerTools, {
  serverInfo: { name: "multi-gmail", version: "1.0.0" },
  instructions:
    "This connector belongs to one person and can read every Gmail account they have linked. Call list_accounts to see nicknames. search_threads with account 'all' searches every mailbox in parallel and tags each thread with its account. If one account fails, the others still return and the failure is in account_errors. Message ids only work with the account they came from. create_draft exists only when the deployment owner turned on drafts.",
});

async function route(request: Request): Promise<Response> {
  const origin = baseUrl(request);
  const resource = `${origin}/api/mcp`;
  const authed = withMcpAuth(
    mcp,
    async (_request, bearerToken) => verifyAccessToken(bearerToken, resource),
    {
      required: true,
      requiredScopes: [MCP_SCOPE],
      resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
      resourceUrl: origin,
    },
  );
  return authed(request);
}

export { route as GET, route as POST, route as DELETE };
