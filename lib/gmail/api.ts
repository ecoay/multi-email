import { assertGmailId, headerValue, parseMessage, type GmailMessage, type ParsedMessage } from "@/lib/gmail/parse";
import { buildDraftRaw, type DraftInput } from "@/lib/gmail/mime";
import type { AccountRef, ThreadHit } from "@/lib/gmail/fanout";

export const MAX_ATTACHMENT_BYTES = 3_000_000;

export class GmailAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAccountError";
  }
}

export type GmailRuntimeAccount = AccountRef & {
  refreshToken: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string;
  status: string;
  statusError: string | null;
};

export type TokenStore = {
  saveTokens(
    accountId: string,
    update: { accessToken: string; accessTokenExpiresAt: Date; refreshToken?: string },
  ): Promise<void>;
  markError(accountId: string, error: string): Promise<void>;
  markActive(accountId: string): Promise<void>;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createGmailClient(options: {
  clientId: string;
  clientSecret: string;
  store: TokenStore;
  fetchImpl?: FetchLike;
  tokenUrl?: string;
  apiBase?: string;
}) {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const tokenUrl = options.tokenUrl ?? "https://oauth2.googleapis.com/token";
  const apiBase = options.apiBase ?? "https://gmail.googleapis.com/gmail/v1";

  async function refresh(account: GmailRuntimeAccount): Promise<string> {
    if (!account.refreshToken) {
      const message = account.statusError || "This account has no saved Google refresh token. Re-auth it.";
      throw new GmailAccountError(message);
    }
    const body = new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      const message =
        payload.error_description ||
        payload.error ||
        "Google refused to refresh this account. Use Re-auth on the site.";
      await options.store.markError(account.id, message);
      account.status = "error";
      account.statusError = message;
      throw new GmailAccountError(message);
    }
    account.accessToken = payload.access_token;
    account.accessTokenExpiresAt = new Date(Date.now() + (payload.expires_in ?? 3600) * 1000);
    const update: { accessToken: string; accessTokenExpiresAt: Date; refreshToken?: string } = {
      accessToken: payload.access_token,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
    };
    if (payload.refresh_token) {
      account.refreshToken = payload.refresh_token;
      update.refreshToken = payload.refresh_token;
    }
    await options.store.saveTokens(account.id, update);
    await options.store.markActive(account.id);
    account.status = "active";
    account.statusError = null;
    return payload.access_token;
  }

  async function accessToken(account: GmailRuntimeAccount): Promise<string> {
    const expires = account.accessTokenExpiresAt?.getTime() ?? 0;
    if (account.accessToken && expires > Date.now() + 60_000) return account.accessToken;
    return refresh(account);
  }

  async function gmailFetch(
    account: GmailRuntimeAccount,
    path: string,
    init?: RequestInit,
    allowRetry = true,
  ): Promise<Response> {
    const token = await accessToken(account);
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await fetchImpl(`${apiBase}${path}`, { ...init, headers });
    if (response.status === 401 && allowRetry) {
      await refresh(account);
      return gmailFetch(account, path, init, false);
    }
    return response;
  }

  async function readJson<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string } | string;
    };
    if (!response.ok) {
      const message =
        (typeof payload.error === "object" && payload.error?.message) ||
        (typeof payload.error === "string" ? payload.error : undefined) ||
        `Gmail request failed (${response.status}).`;
      throw new GmailAccountError(message);
    }
    return payload;
  }

  return {
    async searchThreads(
      account: GmailRuntimeAccount,
      args: { query: string; maxResults: number; pageToken?: string },
    ): Promise<{ threads: ThreadHit[]; nextPageToken?: string }> {
      const params = new URLSearchParams({ maxResults: String(args.maxResults) });
      if (args.query) params.set("q", args.query);
      if (args.pageToken) params.set("pageToken", args.pageToken);
      const listed = await readJson<{
        threads?: { id: string; snippet?: string; historyId?: string }[];
        nextPageToken?: string;
      }>(await gmailFetch(account, `/users/me/threads?${params.toString()}`));

      const threads = listed.threads ?? [];
      const enriched = await mapPool(threads, 4, async (thread) => {
        try {
          const detail = await readJson<{
            id?: string;
            historyId?: string;
            messages?: GmailMessage[];
          }>(
            await gmailFetch(
              account,
              `/users/me/threads/${encodeURIComponent(thread.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            ),
          );
          const latest = latestMessage(detail.messages ?? []);
          return {
            id: thread.id,
            snippet: thread.snippet,
            historyId: detail.historyId ?? thread.historyId,
            subject: headerValue(latest?.payload?.headers, "Subject"),
            from: headerValue(latest?.payload?.headers, "From"),
            date: headerValue(latest?.payload?.headers, "Date"),
            internalDate: latest?.internalDate,
          } satisfies ThreadHit;
        } catch {
          return {
            id: thread.id,
            snippet: thread.snippet,
            historyId: thread.historyId,
          } satisfies ThreadHit;
        }
      });

      return { threads: enriched, nextPageToken: listed.nextPageToken };
    },

    async getMessage(account: GmailRuntimeAccount, id: string): Promise<ParsedMessage> {
      assertGmailId(id, "Message id");
      const message = await readJson<GmailMessage>(
        await gmailFetch(account, `/users/me/messages/${encodeURIComponent(id)}?format=full`),
      );
      return parseMessage(message);
    },

    async getThread(account: GmailRuntimeAccount, id: string) {
      assertGmailId(id, "Thread id");
      const thread = await readJson<{ id?: string; snippet?: string; historyId?: string; messages?: GmailMessage[] }>(
        await gmailFetch(account, `/users/me/threads/${encodeURIComponent(id)}?format=full`),
      );
      const messages = (thread.messages ?? []).map(parseMessage);
      return {
        id: thread.id ?? id,
        snippet: thread.snippet,
        historyId: thread.historyId,
        messages,
      };
    },

    async listAttachments(account: GmailRuntimeAccount, messageId: string) {
      const message = await this.getMessage(account, messageId);
      return {
        message_id: message.id,
        attachments: message.attachments,
      };
    },

    async getAttachment(account: GmailRuntimeAccount, messageId: string, attachmentId: string) {
      assertGmailId(messageId, "Message id");
      assertGmailId(attachmentId, "Attachment id");
      const message = await this.getMessage(account, messageId);
      const meta = message.attachments.find((item) => item.attachmentId === attachmentId);
      if (meta && meta.size > MAX_ATTACHMENT_BYTES) {
        throw new GmailAccountError(
          `This attachment is ${meta.size} bytes. The connector only returns files up to ${MAX_ATTACHMENT_BYTES} bytes.`,
        );
      }
      const payload = await readJson<{ size?: number; data?: string }>(
        await gmailFetch(
          account,
          `/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
        ),
      );
      const size = payload.size ?? meta?.size ?? 0;
      if (size > MAX_ATTACHMENT_BYTES) {
        throw new GmailAccountError(
          `This attachment is ${size} bytes. The connector only returns files up to ${MAX_ATTACHMENT_BYTES} bytes.`,
        );
      }
      if (!payload.data) throw new GmailAccountError("Gmail returned an empty attachment.");
      const bytes = Buffer.from(payload.data, "base64url");
      if (bytes.length > MAX_ATTACHMENT_BYTES) {
        throw new GmailAccountError(
          `This attachment is ${bytes.length} bytes. The connector only returns files up to ${MAX_ATTACHMENT_BYTES} bytes.`,
        );
      }
      return {
        message_id: messageId,
        attachment_id: attachmentId,
        filename: meta?.filename,
        mime_type: meta?.mimeType,
        size: bytes.length,
        data_base64: bytes.toString("base64"),
      };
    },

    async createDraft(account: GmailRuntimeAccount, draft: DraftInput) {
      const raw = buildDraftRaw(draft);
      const created = await readJson<{ id?: string; message?: { id?: string; threadId?: string } }>(
        await gmailFetch(account, "/users/me/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: { raw } }),
        }),
      );
      return {
        id: created.id,
        message_id: created.message?.id,
        thread_id: created.message?.threadId,
      };
    },
  };
}

function latestMessage(messages: GmailMessage[]): GmailMessage | undefined {
  return [...messages].sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0))[0];
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
