import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { dbTokenStore, listRuntimeAccounts } from "@/lib/accounts";
import { writeEnabled } from "@/lib/config";
import { createGmailClient, type GmailRuntimeAccount } from "@/lib/gmail/api";
import {
  PageTokenError,
  searchThreadsAcrossAccounts,
  selectAccounts,
  UnknownAccountError,
} from "@/lib/gmail/fanout";
import { canCreateDraft } from "@/lib/gmail/scopes";

const accountField = z
  .string()
  .describe("Nickname or email of one linked Gmail account. For search_threads only, use 'all'.");

function toolJson(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function pub(account: { nickname: string; email: string }) {
  return { nickname: account.nickname, email: account.email };
}

async function loadAccounts(): Promise<GmailRuntimeAccount[]> {
  return listRuntimeAccounts();
}

function client() {
  return createGmailClient({
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
    store: dbTokenStore(),
  });
}

function oneAccount(accounts: GmailRuntimeAccount[], selector: string): GmailRuntimeAccount {
  const matches = selectAccounts(accounts, selector);
  if (matches.length !== 1) {
    throw new Error("Name one account by nickname or email. 'all' is only valid for search_threads.");
  }
  return matches[0] as GmailRuntimeAccount;
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "list_accounts",
    {
      title: "List linked Gmail accounts",
      description:
        "List every Gmail account linked to this deployment, with nickname, email, and whether it needs re-auth. Call this before searching if you are not sure which nicknames exist.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const accounts = await loadAccounts();
        return toolJson({
          accounts: accounts.map((account) => ({
            ...pub(account),
            status: account.status,
            status_error: account.statusError,
            scopes: account.scopes,
          })),
        });
      } catch (error) {
        return toolJson(errorBody(error), true);
      }
    },
  );

  server.registerTool(
    "search_threads",
    {
      title: "Search Gmail threads",
      description:
        "Search one mailbox or every linked mailbox. account is a nickname, an email, or 'all' (the default). Results are merged and each thread is tagged with its account. A failure on one account is reported in account_errors and does not drop the others. Pass next_page_token back to get the next page. max_results is per account (1-25, default 10). The query uses Gmail search syntax, for example: newer_than:30d subject:invoice.",
      inputSchema: z.object({
        query: z.string().describe("Gmail search query. An empty string returns recent threads."),
        account: z.string().optional().describe("Nickname, email, or 'all'. Defaults to all."),
        max_results: z.number().int().min(1).max(25).optional(),
        page_token: z.string().optional(),
      }),
    },
    async ({ query, account, max_results, page_token }) => {
      try {
        const accounts = await loadAccounts();
        const gmail = client();
        const result = await searchThreadsAcrossAccounts({
          accounts,
          query,
          account,
          maxResults: max_results,
          pageToken: page_token,
          search: (item, args) => gmail.searchThreads(item as GmailRuntimeAccount, args),
        });
        const selector = (account ?? "all").trim().toLowerCase() || "all";
        const totalFailure =
          result.threads.length === 0 &&
          result.account_errors.length > 0 &&
          (selector !== "all" || result.account_errors.length === accounts.length);
        return toolJson(result, totalFailure);
      } catch (error) {
        return toolJson(errorBody(error), true);
      }
    },
  );

  server.registerTool(
    "get_message",
    {
      title: "Get a Gmail message",
      description:
        "Read one message from one account. Use the account nickname or email that search_threads returned with the message. Includes headers, text, and attachment metadata.",
      inputSchema: z.object({
        account: accountField,
        id: z.string().describe("Gmail message id"),
      }),
    },
    async ({ account, id }) => {
      try {
        const match = oneAccount(await loadAccounts(), account);
        const message = await client().getMessage(match, id);
        return toolJson({ account: pub(match), message });
      } catch (error) {
        return toolJson(errorBody(error), true);
      }
    },
  );

  server.registerTool(
    "get_thread",
    {
      title: "Get a Gmail thread",
      description: "Read every message in one thread from one account. Bodies are truncated when they are very long.",
      inputSchema: z.object({
        account: accountField,
        id: z.string().describe("Gmail thread id"),
      }),
    },
    async ({ account, id }) => {
      try {
        const match = oneAccount(await loadAccounts(), account);
        const thread = await client().getThread(match, id);
        return toolJson({ account: pub(match), thread });
      } catch (error) {
        return toolJson(errorBody(error), true);
      }
    },
  );

  server.registerTool(
    "list_attachments",
    {
      title: "List attachments on a message",
      description: "List filenames, types, sizes, and attachment ids for one message. Does not download the file bytes.",
      inputSchema: z.object({
        account: accountField,
        message_id: z.string(),
      }),
    },
    async ({ account, message_id }) => {
      try {
        const match = oneAccount(await loadAccounts(), account);
        const listed = await client().listAttachments(match, message_id);
        return toolJson({ account: pub(match), ...listed });
      } catch (error) {
        return toolJson(errorBody(error), true);
      }
    },
  );

  server.registerTool(
    "get_attachment",
    {
      title: "Download an attachment",
      description:
        "Download one attachment as standard base64. Files larger than about 3 MB are refused because the hosting response limit is 4.5 MB.",
      inputSchema: z.object({
        account: accountField,
        message_id: z.string(),
        attachment_id: z.string(),
      }),
    },
    async ({ account, message_id, attachment_id }) => {
      try {
        const match = oneAccount(await loadAccounts(), account);
        const file = await client().getAttachment(match, message_id, attachment_id);
        return toolJson({ account: pub(match), ...file });
      } catch (error) {
        return toolJson(errorBody(error), true);
      }
    },
  );

  if (writeEnabled()) {
    server.registerTool(
      "create_draft",
      {
        title: "Create a Gmail draft",
        description:
          "Create a draft in one linked mailbox. The draft is not sent. The account must have been linked while GMAIL_ENABLE_WRITE was on. If this fails with a scope error, re-auth that account on the site.",
        inputSchema: z.object({
          account: accountField,
          to: z.string().describe("Recipient addresses, comma-separated"),
          cc: z.string().optional(),
          bcc: z.string().optional(),
          subject: z.string(),
          body_text: z.string(),
          body_html: z.string().optional(),
        }),
      },
      async ({ account, to, cc, bcc, subject, body_text, body_html }) => {
        try {
          const match = oneAccount(await loadAccounts(), account);
          if (!canCreateDraft(match.scopes)) {
            return toolJson(
              {
                error:
                  "This account was linked with read-only access. Set GMAIL_ENABLE_WRITE, add the modify scope in Google Cloud, redeploy, then click Re-auth for this account.",
              },
              true,
            );
          }
          const draft = await client().createDraft(match, {
            to,
            cc,
            bcc,
            subject,
            bodyText: body_text,
            bodyHtml: body_html,
          });
          return toolJson({ account: pub(match), draft });
        } catch (error) {
          return toolJson(errorBody(error), true);
        }
      },
    );
  }
}

function errorBody(error: unknown) {
  if (error instanceof UnknownAccountError) {
    return { error: error.message, available: error.available };
  }
  if (error instanceof PageTokenError) return { error: error.message };
  return { error: error instanceof Error ? error.message : "The request failed." };
}
