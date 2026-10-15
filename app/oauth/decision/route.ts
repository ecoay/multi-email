import { redirect } from "next/navigation";

import { checkOwnerPassword } from "@/lib/owner";
import { inspectAuthorizeRequest } from "@/lib/oauth/authorize-view";
import { issueAuthorizationCode } from "@/lib/oauth/store";
import { isOwnerSignedIn, setOwnerCookie } from "@/lib/session";

export async function POST(request: Request) {
  const form = await request.formData();
  const decision = String(form.get("decision") || "");
  const password = String(form.get("password") || "");
  const replay = new URL(request.url);
  replay.pathname = "/oauth/authorize";
  for (const key of ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"]) {
    const value = form.get(key);
    if (typeof value === "string") replay.searchParams.set(key, value);
  }

  const inspected = await inspectAuthorizeRequest(new Request(replay, { headers: request.headers }));
  if (!inspected.ok) {
    redirect(`/oauth/authorize?error=${encodeURIComponent(inspected.error)}`);
  }
  const view = inspected.view;

  if (decision !== "allow") {
    const denied = new URL(view.redirectUri);
    denied.searchParams.set("error", "access_denied");
    denied.searchParams.set("state", view.state);
    redirect(denied.toString());
  }

  const signedIn = await isOwnerSignedIn();
  if (!signedIn) {
    const check = await checkOwnerPassword(password);
    if (!check.ok) {
      replay.searchParams.set("error", check.error);
      redirect(`${replay.pathname}?${replay.searchParams.toString()}`);
    }
    await setOwnerCookie();
  }

  const code = await issueAuthorizationCode({
    clientId: view.clientId,
    redirectUri: view.redirectUri,
    codeChallenge: view.codeChallenge,
    scope: view.scope,
    resource: view.resource,
  });
  const back = new URL(view.redirectUri);
  back.searchParams.set("code", code);
  back.searchParams.set("state", view.state);
  redirect(back.toString());
}

export const dynamic = "force-dynamic";
