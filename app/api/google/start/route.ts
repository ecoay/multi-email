import { redirect } from "next/navigation";

import { cleanNickname, getAccountById } from "@/lib/accounts";
import { googleRedirectUri, writeEnabled } from "@/lib/config";
import { googleScopes } from "@/lib/gmail/scopes";
import { signPayload } from "@/lib/signed";
import { isOwnerSignedIn } from "@/lib/session";

export async function GET(request: Request) {
  if (!(await isOwnerSignedIn())) {
    redirect("/login?next=/accounts");
  }
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  let nickname = "";
  try {
    nickname = cleanNickname(url.searchParams.get("nickname") || "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nickname is not valid.";
    redirect(`/accounts?error=${encodeURIComponent(message)}`);
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    redirect("/accounts?error=Google%20client%20id%20and%20secret%20are%20not%20set%20yet.");
  }

  let loginHint: string | undefined;
  if (accountId) {
    const account = await getAccountById(accountId);
    if (!account) redirect("/accounts?error=That%20account%20was%20not%20found.");
    loginHint = account.email;
  }

  const state = signPayload({ nickname: nickname || null, accountId: accountId || null }, 15 * 60);
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  auth.searchParams.set("redirect_uri", googleRedirectUri(request));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", googleScopes(writeEnabled()).join(" "));
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent");
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", state);
  if (loginHint) auth.searchParams.set("login_hint", loginHint);
  redirect(auth.toString());
}

export const dynamic = "force-dynamic";
