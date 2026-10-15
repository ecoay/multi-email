import Link from "next/link";
import { redirect } from "next/navigation";

import { removeAccount, updateNickname } from "@/app/accounts/actions";
import { RemoveAccount } from "@/components/remove-account";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listPublicAccounts } from "@/lib/accounts";
import { writeEnabled } from "@/lib/config";
import { scopeLabel } from "@/lib/gmail/scopes";
import { isOwnerSignedIn } from "@/lib/session";
import { publicError } from "@/lib/setup-status";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  if (!(await isOwnerSignedIn())) redirect("/login?next=/accounts");
  const params = await searchParams;
  let accounts: Awaited<ReturnType<typeof listPublicAccounts>> = [];
  let loadError = "";
  try {
    accounts = await listPublicAccounts();
  } catch (error) {
    loadError = publicError(error);
  }
  const drafts = writeEnabled();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Linked Gmail accounts</h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          Add each inbox you want the agent to read. Nicknames are how you tell the agent which mailbox to use.{" "}
          {drafts ? "Drafts are enabled for this deployment." : "This deployment is read-only."}
        </p>
      </div>

      {params.error ? (
        <p role="alert" className="rounded-xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {params.error}
        </p>
      ) : null}
      {params.notice ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-200">{params.notice}</p>
      ) : null}
      {loadError ? (
        <p role="alert" className="rounded-xl border border-amber-900/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          {loadError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add Gmail</CardTitle>
          <CardDescription>
            A nickname is optional. Google will ask you to allow access. If it says the app is not verified, choose
            Advanced, then continue. That screen is expected for a private test app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/api/google/start" method="get" className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="nickname">Nickname</Label>
              <Input id="nickname" name="nickname" placeholder="receipts" maxLength={40} />
            </div>
            <Button type="submit" className="sm:mb-0">
              Add Gmail
            </Button>
          </form>
        </CardContent>
      </Card>

      {accounts.length === 0 && !loadError ? (
        <Card>
          <CardHeader>
            <CardTitle>No accounts yet</CardTitle>
            <CardDescription>Link the first inbox. You can add more after that, including other Gmail addresses you listed as Google test users.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ul className="flex flex-col gap-3">
        {accounts.map((account) => (
          <li key={account.id}>
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>{account.nickname}</CardTitle>
                  <CardDescription>{account.email}</CardDescription>
                </div>
                <span
                  className={
                    account.status === "active"
                      ? "w-fit rounded-full border border-emerald-900/70 px-2.5 py-1 text-xs text-emerald-200"
                      : "w-fit rounded-full border border-amber-900/70 px-2.5 py-1 text-xs text-amber-100"
                  }
                >
                  {account.status === "active" ? "Active" : "Needs re-auth"}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-zinc-400">
                  {scopeLabel(account.scopes)}
                  {account.statusError ? ` · ${account.statusError}` : ""}
                </p>
                <form action={updateNickname} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="id" value={account.id} />
                  <Label htmlFor={`nick-${account.id}`} className="sr-only">
                    Nickname for {account.email}
                  </Label>
                  <Input id={`nick-${account.id}`} name="nickname" defaultValue={account.nickname} maxLength={40} />
                  <SubmitButton variant="outline" pendingLabel="Saving...">
                    Save nickname
                  </SubmitButton>
                </form>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/api/google/start?accountId=${account.id}`}>Re-auth</Link>
                  </Button>
                  <RemoveAccount id={account.id} nickname={account.nickname} action={removeAccount} />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="text-sm leading-6 text-zinc-500">
        If the Google app stays in Testing, refresh access lasts about 7 days. When a row says Needs re-auth, or a
        search starts failing for one inbox, click Re-auth. The other accounts keep working.
      </p>
    </main>
  );
}
