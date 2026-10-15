import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setupStatus } from "@/lib/setup-status";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const status = await setupStatus();
  const checks = [
    ["Owner password", status.ownerPassword],
    ["Lock key", status.tokenKey],
    ["Google client id", status.googleClient],
    ["Google client secret", status.googleSecret],
    ["Database", status.database === "ok"],
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12">
      <section className="flex flex-col gap-4">
        <p className="text-xs font-medium tracking-[0.18em] text-zinc-500 uppercase">Self-hosted connector</p>
        <h1 className="max-w-xl text-4xl font-medium tracking-tight text-zinc-50 sm:text-5xl">
          Search every inbox from one agent.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-400">
          This copy is yours alone. Sign in with the owner password, link the Gmail accounts you use, and point an AI
          agent at the connector URL. A receipt search can cover a personal inbox and a work inbox in one request.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/accounts">Linked accounts</Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Connector URL</CardTitle>
          <CardDescription>Paste this into Cursor, Claude, or any MCP client that supports Streamable HTTP.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 px-3 py-3 font-mono text-sm text-zinc-100">
            {status.mcpUrl}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup on this deployment</CardTitle>
          <CardDescription>
            Missing items are filled in Vercel, then you redeploy. Nothing here shows secret values.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {checks.map(([label, ok]) => (
              <li key={label} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-zinc-300">{label}</span>
                <span className={ok ? "text-emerald-300" : "text-amber-200"}>{ok ? "Ready" : "Missing"}</span>
              </li>
            ))}
          </ul>
          {status.tokenKeyError ? <p className="text-sm text-amber-200">{status.tokenKeyError}</p> : null}
          {status.databaseError ? <p className="text-sm text-amber-200">{status.databaseError}</p> : null}
          <p className="text-sm leading-6 text-zinc-500">
            Google redirect URI for this site:{" "}
            <span className="font-mono text-zinc-300">{status.googleRedirect}</span>
          </p>
          <p className="text-sm leading-6 text-zinc-500">
            {status.writeEnabled
              ? "Drafts are enabled. Accounts need a fresh Google sign-in to grant that access."
              : "Drafts are off. The connector can read mail. Set GMAIL_ENABLE_WRITE to true if you also want drafts."}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
