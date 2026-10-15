import { jsonResponse, optionsResponse, protectedResourceDocument } from "@/lib/oauth/metadata";

export function GET(request: Request) {
  return jsonResponse(protectedResourceDocument(request));
}

export function OPTIONS() {
  return optionsResponse();
}

export const dynamic = "force-dynamic";
