import { redirect } from "next/navigation";

import { clearOwnerCookie } from "@/lib/session";

export async function POST() {
  await clearOwnerCookie();
  redirect("/");
}

export const dynamic = "force-dynamic";
