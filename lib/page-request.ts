import { headers } from "next/headers";

export async function pageRequest(path: string, searchParams: Record<string, string | string[] | undefined>) {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host")?.split(",")[0]?.trim() || incoming.get("host") || "127.0.0.1:43123";
  const proto =
    incoming.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.size ? `?${query}` : "";
  return new Request(`${proto}://${host}${path}${suffix}`, {
    headers: {
      host,
      "x-forwarded-host": host,
      "x-forwarded-proto": proto,
    },
  });
}
