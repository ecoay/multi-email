import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PageTokenError,
  searchThreadsAcrossAccounts,
  UnknownAccountError,
  type AccountRef,
  type ThreadSearch,
} from "../lib/gmail/fanout";

const personal: AccountRef = { id: "p", email: "ada@gmail.com", nickname: "personal" };
const work: AccountRef = { id: "w", email: "ada@company.com", nickname: "work" };
const broken: AccountRef = { id: "b", email: "old@gmail.com", nickname: "old" };

function searcher(pages: Record<string, { threads: { id: string; internalDate?: string }[]; next?: string }>): ThreadSearch {
  return async (account, args) => {
    if (account.id === "b") throw new Error("invalid_grant: expired");
    const page = pages[account.id];
    assert.equal(args.maxResults, 10);
    return {
      threads: page.threads.map((thread) => ({ ...thread, snippet: args.query })),
      nextPageToken: args.pageToken ? undefined : page.next,
    };
  };
}

test("merges accounts in parallel and tags each thread", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const search: ThreadSearch = async (account) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight -= 1;
    return {
      threads: [{ id: account.id, internalDate: account.id === "w" ? "300" : "100", snippet: "invoice" }],
    };
  };

  const result = await searchThreadsAcrossAccounts({
    accounts: [personal, work],
    query: "subject:invoice",
    search,
  });

  assert.equal(maxInFlight, 2);
  assert.equal(result.account, "all");
  assert.deepEqual(
    result.threads.map((thread) => thread.account.nickname),
    ["work", "personal"],
  );
  assert.equal(result.threads[0].id, "w");
  assert.equal(result.account_errors.length, 0);
});

test("one broken account does not fail the others", async () => {
  const result = await searchThreadsAcrossAccounts({
    accounts: [personal, broken, work],
    query: "receipt",
    account: "all",
    search: searcher({
      p: { threads: [{ id: "t1", internalDate: "10" }] },
      w: { threads: [{ id: "t2", internalDate: "20" }] },
    }),
  });

  assert.equal(result.threads.length, 2);
  assert.equal(result.account_errors.length, 1);
  assert.equal(result.account_errors[0].account.email, "old@gmail.com");
  assert.match(result.account_errors[0].error, /invalid_grant/);
});

test("matches nickname or email without case sensitivity and rejects unknown names", async () => {
  const search: ThreadSearch = async () => ({ threads: [{ id: "only" }] });
  const byNick = await searchThreadsAcrossAccounts({
    accounts: [personal, work],
    query: "",
    account: "Work",
    search,
  });
  assert.equal(byNick.threads.length, 1);
  assert.equal(byNick.threads[0].account.email, "ada@company.com");

  const byEmail = await searchThreadsAcrossAccounts({
    accounts: [personal, work],
    query: "",
    account: "ADA@gmail.com",
    search,
  });
  assert.equal(byEmail.threads[0].account.nickname, "personal");

  await assert.rejects(
    () => searchThreadsAcrossAccounts({ accounts: [personal], query: "x", account: "missing", search }),
    (error: unknown) => {
      assert.ok(error instanceof UnknownAccountError);
      assert.equal(error.available[0].nickname, "personal");
      return true;
    },
  );
});

test("paginates one account with the provider token and all accounts with a combined cursor", async () => {
  const seen: string[] = [];
  const search: ThreadSearch = async (account, args) => {
    seen.push(`${account.id}:${args.pageToken ?? ""}`);
    return {
      threads: [{ id: `${account.id}-1`, internalDate: "5" }],
      nextPageToken: args.pageToken ? undefined : `${account.id}-next`,
    };
  };

  const first = await searchThreadsAcrossAccounts({
    accounts: [personal, work],
    query: "has:attachment",
    maxResults: 10,
    search,
  });
  assert.ok(first.next_page_token?.startsWith("mg1."));

  seen.length = 0;
  const second = await searchThreadsAcrossAccounts({
    accounts: [personal, work],
    query: "has:attachment",
    pageToken: first.next_page_token,
    search,
  });
  assert.deepEqual(seen.sort(), ["p:p-next", "w:w-next"]);
  assert.equal(second.next_page_token, undefined);

  const single = await searchThreadsAcrossAccounts({
    accounts: [personal, work],
    query: "q",
    account: "personal",
    pageToken: "gmail-page-2",
    search,
  });
  assert.equal(single.next_page_token, undefined);
  assert.equal(seen.at(-1), "p:gmail-page-2");

  await assert.rejects(
    () =>
      searchThreadsAcrossAccounts({
        accounts: [personal],
        query: "q",
        account: "personal",
        pageToken: first.next_page_token,
        search,
      }),
    PageTokenError,
  );
});

test("reports an empty mailbox list without calling search", async () => {
  let called = false;
  const result = await searchThreadsAcrossAccounts({
    accounts: [],
    query: "invoice",
    search: async () => {
      called = true;
      return { threads: [] };
    },
  });
  assert.equal(called, false);
  assert.match(result.message ?? "", /No Gmail accounts/);
});
