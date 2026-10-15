import { authorizationServerDocument, jsonResponse, optionsResponse } from "@/lib/oauth/metadata";

export function GET(request: Request) {
  return jsonResponse(authorizationServerDocument(request));
}

export function OPTIONS() {
  return optionsResponse();
}

export const dynamic = "force-dynamic";
