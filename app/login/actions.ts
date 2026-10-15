"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import { safeNextPath } from "@/lib/config";
import { checkOwnerPassword } from "@/lib/owner";
import { setOwnerCookie } from "@/lib/session";
import { publicError } from "@/lib/setup-status";

export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  const next = safeNextPath(String(formData.get("next") || "/accounts"));
  try {
    const result = await checkOwnerPassword(password);
    if (!result.ok) {
      redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(result.error)}`);
    }
    await setOwnerCookie();
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(publicError(error))}`);
  }
  redirect(next);
}
