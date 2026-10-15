import assert from "node:assert/strict";
import { test } from "node:test";

import { createGmailClient, type GmailRuntimeAccount, type TokenStore } from "../lib/gmail/api";
import { buildRfc822 } from "../lib/gmail/mime";

const account = (): GmailRuntimeAccount => ({
  id: "acc-1",
  email: "ada@gmail.com",
  nickname: "personal",
  refreshToken: "refresh-1",
  accessToken: "access-1",
  accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
  scopes: "https://www.googleapis.com/auth/gmail.readonly",
  status: "active",
  statusError: null,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("refreshes an expired access token, then lists and enriches threads", async () => {
  const current = account();
  current.accessTokenExpiresAt = new Date(Date.now() - 1000);
  const calls: string[] = [];
  const store: TokenStore = {
    async saveTokens(_id, update) {
      calls.push(`save:${update.accessToken}`);
    },
    async markError() {
      calls.push("error");
    },
    async markActive() {
      calls.push("active");
    },
  };

  const client = createGmailClient({
    clientId: "client",
    clientSecret: "secret",
    store,
    fetchImpl: async (url, init) => {
      calls.push(url);
      if (url.includes("oauth2.googleapis.com/token")) {
        assert.match(String(init?.body), /refresh-1/);
        return jsonResponse({ access_token: "access-2", expires_in: 3600 });
      }
      if (url.includes("/users/me/threads?")) {
        assert.match(String(init?.headers && new Headers(init.headers).get("authorization")), /access-2/);
        return jsonResponse({
          threads: [{ id: "thread-1", snippet: "Invoice 42", historyId: "9" }],
          nextPageToken: "page-2",
        });
      }
      return jsonResponse({
        id: "thread-1",
        historyId: "9",
        messages: [
          {
            id: "msg-1",
            internalDate: "1700000000000",
            payload: {
              headers: [
                { name: "Subject", value: "Invoice 42" },
                { name: "From", value: "billing@vendor.com" },
                { name: "Date", value: "Tue, 14 Nov 2023 22:13:20 GMT" },
              ],
            },
          },
        ],
      });
    },
  });

  const result = await client.searchThreads(current, { query: "invoice", maxResults: 5 });
  assert.equal(result.nextPageToken, "page-2");
  assert.equal(result.threads[0].subject, "Invoice 42");
  assert.equal(result.threads[0].from, "billing@vendor.com");
  assert.ok(calls.includes("save:access-2"));
  assert.ok(calls.includes("active"));
});

test("retries once after a 401 and records invalid_grant", async () => {
  const current = account();
  let threads = 0;
  const errors: string[] = [];
  const client = createGmailClient({
    clientId: "client",
    clientSecret: "secret",
    store: {
      async saveTokens() {},
      async markError(_id, error) {
        errors.push(error);
      },
      async markActive() {},
    },
    fetchImpl: async (url) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return jsonResponse({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
      }
      threads += 1;
      return jsonResponse({ error: { message: "Invalid Credentials" } }, 401);
    },
  });

  await assert.rejects(() => client.searchThreads(current, { query: "", maxResults: 1 }), /expired or revoked/);
  assert.equal(threads, 1);
  assert.match(errors[0], /expired or revoked/);
});

test("lists nested attachments and refuses oversized downloads", async () => {
  const current = account();
  const message = {
    id: "msg-9",
    threadId: "thread-9",
    snippet: "see attached",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "Subject", value: "Receipt" },
        { name: "From", value: "store@example.com" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: Buffer.from("thanks").toString("base64url") } },
        {
          mimeType: "multipart/mixed",
          parts: [
            {
              filename: "receipt.pdf",
              mimeType: "application/pdf",
              body: { size: 12, attachmentId: "att-1" },
            },
          ],
        },
      ],
    },
  };

  const client = createGmailClient({
    clientId: "client",
    clientSecret: "secret",
    store: { async saveTokens() {}, async markError() {}, async markActive() {} },
    fetchImpl: async (url) => {
      if (url.endsWith("/attachments/att-1")) {
        return jsonResponse({ size: 5, data: Buffer.from("hello").toString("base64url") });
      }
      if (url.includes("/attachments/att-big")) {
        return jsonResponse({ size: 4_000_000, data: "" });
      }
      return jsonResponse(message);
    },
  });

  const listed = await client.listAttachments(current, "msg-9");
  assert.deepEqual(listed.attachments, [
    { filename: "receipt.pdf", mimeType: "application/pdf", attachmentId: "att-1", size: 12 },
  ]);
  const file = await client.getAttachment(current, "msg-9", "att-1");
  assert.equal(file.data_base64, Buffer.from("hello").toString("base64"));
  assert.equal(file.filename, "receipt.pdf");

  const parsed = await client.getMessage(current, "msg-9");
  assert.equal(parsed.text, "thanks");
  assert.equal(parsed.headers.subject, "Receipt");

  await assert.rejects(
    () => client.getAttachment(current, "msg-9", "att-big"),
    /only returns files/,
  );
});

test("posts a draft as base64url RFC822 and rejects header injection", async () => {
  const current = account();
  current.scopes = "https://www.googleapis.com/auth/gmail.modify";
  let raw = "";
  const client = createGmailClient({
    clientId: "client",
    clientSecret: "secret",
    store: { async saveTokens() {}, async markError() {}, async markActive() {} },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(String(init?.body)) as { message: { raw: string } };
      raw = Buffer.from(body.message.raw, "base64url").toString("utf8");
      assert.match(url, /\/users\/me\/drafts$/);
      return jsonResponse({ id: "draft-1", message: { id: "msg-2", threadId: "thread-2" } });
    },
  });

  const created = await client.createDraft(current, {
    to: "boss@company.com",
    subject: "Invoice café",
    bodyText: "Please see attached.",
  });
  assert.equal(created.id, "draft-1");
  assert.match(raw, /To: boss@company.com/);
  assert.match(raw, /Please see attached\./);
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.throws(() => buildRfc822({ to: "a@b.com\r\nBcc: evil@x.com", subject: "Hi", bodyText: "x" }), /line breaks/);
});
