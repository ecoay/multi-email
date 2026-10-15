import { randomBytes } from "node:crypto";

export type DraftInput = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
};

export function buildRfc822(input: DraftInput): string {
  assertHeader("To", input.to);
  if (input.cc) assertHeader("Cc", input.cc);
  if (input.bcc) assertHeader("Bcc", input.bcc);
  assertHeader("Subject", input.subject);

  const headers = [
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : undefined,
    input.bcc ? `Bcc: ${input.bcc}` : undefined,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
  ].filter((line): line is string => Boolean(line));

  if (!input.bodyHtml) {
    headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", input.bodyText);
    return headers.join("\r\n");
  }

  const boundary = `mg_${randomBytes(8).toString("hex")}`;
  headers.push(
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.bodyText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.bodyHtml,
    `--${boundary}--`,
    "",
  );
  return headers.join("\r\n");
}

export function buildDraftRaw(input: DraftInput): string {
  return Buffer.from(buildRfc822(input), "utf8").toString("base64url");
}

function encodeHeader(value: string): string {
  if (/^[\t\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function assertHeader(label: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} cannot contain line breaks.`);
  }
}
