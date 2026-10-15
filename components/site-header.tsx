import Link from "next/link";

import { Button } from "@/components/ui/button";
import { isOwnerSignedIn } from "@/lib/session";

export async function SiteHeader() {
  const signedIn = await isOwnerSignedIn();
  return (
    <header className="border-b border-white/10">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
        <Link href="/" className="text-sm font-medium tracking-tight text-zinc-100">
          Multi Gmail
        </Link>
        <nav className="flex items-center gap-2">
          {signedIn ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/accounts">Accounts</Link>
              </Button>
              <form action="/logout" method="post">
                <Button type="submit" variant="outline" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
