export type AttachmentPart = {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
};

export type ParsedMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  headers: {
    from?: string;
    to?: string;
    cc?: string;
    subject?: string;
    date?: string;
    messageId?: string;
  };
  text?: string;
  html?: string;
  textTruncated?: boolean;
  htmlTruncated?: boolean;
  attachments: AttachmentPart[];
};

const TEXT_LIMIT = 80_000;

type Header = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

export type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
};

export function parseMessage(message: GmailMessage): ParsedMessage {
  const headers = indexHeaders(message.payload?.headers ?? []);
  const attachments: AttachmentPart[] = [];
  let text: string | undefined;
  let html: string | undefined;

  const walk = (part: GmailPart | undefined) => {
    if (!part) return;
    const filename = part.filename?.trim() ?? "";
    const attachmentId = part.body?.attachmentId;
    if (attachmentId && (filename || part.mimeType)) {
      attachments.push({
        filename: filename || "attachment",
        mimeType: part.mimeType || "application/octet-stream",
        attachmentId,
        size: part.body?.size ?? 0,
      });
    }
    const data = part.body?.data;
    if (data && !attachmentId) {
      const decoded = decodeBase64Url(data);
      if (part.mimeType === "text/plain" && text === undefined) text = decoded;
      if (part.mimeType === "text/html" && html === undefined) html = decoded;
    }
    for (const child of part.parts ?? []) walk(child);
  };

  walk(message.payload);

  const textCut = clip(text);
  const htmlCut = clip(html);

  return {
    id: message.id ?? "",
    threadId: message.threadId,
    labelIds: message.labelIds,
    snippet: message.snippet,
    historyId: message.historyId,
    internalDate: message.internalDate,
    headers: {
      from: headers.from,
      to: headers.to,
      cc: headers.cc,
      subject: headers.subject,
      date: headers.date,
      messageId: headers["message-id"],
    },
    text: textCut.value,
    html: htmlCut.value,
    textTruncated: textCut.truncated,
    htmlTruncated: htmlCut.truncated,
    attachments,
  };
}

export function headerValue(headers: Header[] | undefined, name: string): string | undefined {
  const found = headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase());
  return found?.value;
}

function indexHeaders(headers: Header[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers) {
    if (!header.name || header.value === undefined) continue;
    out[header.name.toLowerCase()] = header.value;
  }
  return out;
}

function clip(value: string | undefined): { value?: string; truncated?: boolean } {
  if (value === undefined) return {};
  if (value.length <= TEXT_LIMIT) return { value };
  return { value: value.slice(0, TEXT_LIMIT), truncated: true };
}

export function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function assertGmailId(id: string, label: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`${label} is not a valid Gmail id.`);
  }
}
