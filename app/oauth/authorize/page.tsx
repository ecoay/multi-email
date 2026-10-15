import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inspectAuthorizeRequest } from "@/lib/oauth/authorize-view";
import { pageRequest } from "@/lib/page-request";
import { isOwnerSignedIn } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const request = await pageRequest("/oauth/authorize", params);
  const inspected = await inspectAuthorizeRequest(request);
  const signedIn = await isOwnerSignedIn();
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Allow this agent</CardTitle>
          <CardDescription>
            {inspected.ok
              ? `${inspected.view.clientName} is asking to use the Gmail accounts linked on this site.`
              : "This sign-in request cannot continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!inspected.ok ? (
            <p role="alert" className="text-sm text-amber-200">
              {inspected.error}
            </p>
          ) : (
            <>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-zinc-500">App</dt>
                  <dd className="text-zinc-100">{inspected.view.clientName}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Will return to</dt>
                  <dd className="break-all font-mono text-xs text-zinc-300">{inspected.view.redirectHost}</dd>
                </div>
              </dl>
              {inspected.view.localhostWarning ? (
                <p className="text-sm leading-6 text-amber-100">
                  This app will receive the sign-in code on your own computer. Continue only if you just started this
                  from an app you trust.
                </p>
              ) : null}
              <p className="text-sm leading-6 text-zinc-400">
                Allowing it does not give the app your Google password. It can use the connector tools on the accounts
                you linked. You can remove those accounts later.
              </p>
              {error ? (
                <p role="alert" className="text-sm text-amber-200">
                  {error}
                </p>
              ) : null}
              <form action="/oauth/decision" method="post" className="flex flex-col gap-4">
                <Hidden name="client_id" value={inspected.view.clientId} />
                <Hidden name="redirect_uri" value={inspected.view.redirectUri} />
                <Hidden name="response_type" value="code" />
                <Hidden name="code_challenge" value={inspected.view.codeChallenge} />
                <Hidden name="code_challenge_method" value="S256" />
                <Hidden name="state" value={inspected.view.state} />
                <Hidden name="scope" value={inspected.view.scope} />
                <Hidden name="resource" value={inspected.view.resource} />
                {signedIn ? (
                  <p className="text-sm text-zinc-300">You are already signed in as the owner of this site.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="password">Owner password</Label>
                    <Input id="password" name="password" type="password" autoComplete="current-password" required />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="decision" value="allow">
                    Allow
                  </SubmitButton>
                  <Button type="submit" name="decision" value="deny" variant="outline">
                    Deny
                  </Button>
                </div>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
