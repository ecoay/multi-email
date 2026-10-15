"use server";

import { redirect } from "next/navigation";

import { deleteAccount, renameAccount } from "@/lib/accounts";
import { isOwnerSignedIn } from "@/lib/session";

async function gate() {
  if (!(await isOwnerSignedIn())) redirect("/login?next=/accounts");
}

export async function removeAccount(formData: FormData) {
  await gate();
  await deleteAccount(String(formData.get("id") || ""));
  redirect("/accounts?notice=Removed%20that%20account.");
}

export async function updateNickname(formData: FormData) {
  await gate();
  try {
    await renameAccount(String(formData.get("id") || ""), String(formData.get("nickname") || ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not rename that account.";
    redirect(`/accounts?error=${encodeURIComponent(message)}`);
  }
  redirect("/accounts?notice=Nickname%20saved.");
}
