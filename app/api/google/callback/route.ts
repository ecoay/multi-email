import { redirect, unstable_rethrow } from "next/navigation";

import { getAccountById, saveLinkedAccount } from "@/lib/accounts";
import { googleRedirectUri } from "@/lib/config";
import { readPayload } from "@/lib/signed";
import { isOwnerSignedIn } from "@/lib/session";

export async function GET(request: Request) {
  if (!(await isOwnerSignedIn())) {
    redirect("/login?next=/accounts&error=Sign%20in%20again%2C%20then%20retry%20Add%20Gmail.");
  }
  const url = new URL(request.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const message = oauthError === "access_denied" ? "Google sign-in was cancelled." : `Google returned ${oauthError}.`;
    redirect(`/accounts?error=${encodeURIComponent(message)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const payload = state ? readPayload<{ nickname?: string | null; accountId?: string | null }>(state) : null;
  if (!code || !payload) {
    redirect("/accounts?error=That%20Google%20sign-in%20link%20expired.%20Try%20again.");
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    redirect("/accounts?error=Google%20client%20id%20and%20secret%20are%20not%20set.");
  }

  const redirectUri = googleRedirectUri(request);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenResponse.ok || !tokens.access_token) {
    const message = tokens.error_description || tokens.error || "Google did not return an access token.";
    redirect(`/accounts?error=${encodeURIComponent(message)}`);
  }

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = (await profileResponse.json().catch(() => ({}))) as { emailAddress?: string; error?: { message?: string } };
  if (!profileResponse.ok || !profile.emailAddress) {
    const message = profile.error?.message || "Could not read the Gmail address for that account.";
    redirect(`/accounts?error=${encodeURIComponent(message)}`);
  }

  if (payload.accountId) {
    const existing = await getAccountById(payload.accountId);
    if (existing && existing.email !== profile.emailAddress.toLowerCase()) {
      redirect(
        `/accounts?error=${encodeURIComponent(`Google signed in as ${profile.emailAddress}, not ${existing.email}. Pick that account on the Google screen.`)}`,
      );
    }
  }

  let notice = "";
  try {
    const saved = await saveLinkedAccount({
      email: profile.emailAddress,
      nickname: payload.nickname || profile.emailAddress.split("@")[0] || "mailbox",
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      scopes: tokens.scope || "",
      existingId: payload.accountId,
    });
    notice = saved.created
      ? `Linked ${saved.email} as ${saved.nickname}.`
      : `Updated the saved access for ${saved.email}.`;
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Could not save that Gmail account.";
    redirect(`/accounts?error=${encodeURIComponent(message)}`);
  }
  redirect(`/accounts?notice=${encodeURIComponent(notice)}`);
}

export const dynamic = "force-dynamic";
