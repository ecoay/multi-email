export type AccountRef = {
  id: string;
  email: string;
  nickname: string;
};

export type ThreadHit = {
  id: string;
  snippet?: string;
  historyId?: string;
  subject?: string;
  from?: string;
  date?: string;
  internalDate?: string;
};

export type TaggedThread = ThreadHit & {
  account: { nickname: string; email: string };
};

export type AccountError = {
  account: { nickname: string; email: string };
  error: string;
};

export type SearchThreadsResult = {
  query: string;
  account: string;
  threads: TaggedThread[];
  next_page_token?: string;
  account_errors: AccountError[];
  message?: string;
};

export class UnknownAccountError extends Error {
  readonly available: { nickname: string; email: string }[];

  constructor(selector: string, accounts: AccountRef[]) {
    super(`No linked account matches "${selector}".`);
    this.name = "UnknownAccountError";
    this.available = accounts.map((account) => ({
      nickname: account.nickname,
      email: account.email,
    }));
  }
}

export class PageTokenError extends Error {
  constructor() {
    super("That page token does not match this search. Start a new search.");
    this.name = "PageTokenError";
  }
}

export type ThreadSearch = (
  account: AccountRef,
  args: { query: string; maxResults: number; pageToken?: string },
) => Promise<{ threads: ThreadHit[]; nextPageToken?: string }>;

const CURSOR_PREFIX = "mg1.";

export function clampMaxResults(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 10;
  return Math.min(25, Math.max(1, Math.floor(value)));
}

export function selectAccounts(accounts: AccountRef[], selector: string | undefined): AccountRef[] {
  const needle = (selector ?? "all").trim().toLowerCase();
  if (!needle || needle === "all") return accounts;

  const byEmail = accounts.filter((account) => account.email.toLowerCase() === needle);
  if (byEmail.length === 1) return byEmail;

  const byNickname = accounts.filter((account) => account.nickname.toLowerCase() === needle);
  if (byEmail.length + byNickname.length > 1) {
    throw new UnknownAccountError(
      `${selector} matches more than one account. Use the email address.`,
      accounts,
    );
  }
  if (byNickname.length === 1) return byNickname;
  throw new UnknownAccountError(selector?.trim() || needle, accounts);
}

export async function searchThreadsAcrossAccounts(input: {
  accounts: AccountRef[];
  query: string;
  account?: string;
  maxResults?: number;
  pageToken?: string;
  search: ThreadSearch;
}): Promise<SearchThreadsResult> {
  const selector = (input.account ?? "all").trim() || "all";
  const allMode = selector.toLowerCase() === "all";
  const maxResults = clampMaxResults(input.maxResults);
  const targets = selectAccounts(input.accounts, selector);

  if (targets.length === 0) {
    return {
      query: input.query,
      account: allMode ? "all" : selector,
      threads: [],
      account_errors: [],
      message: "No Gmail accounts are linked yet. Open this site and use Add Gmail.",
    };
  }

  let pageByAccount: Record<string, string> | undefined;
  let singleToken: string | undefined;
  if (input.pageToken) {
    if (allMode) {
      pageByAccount = decodeCursor(input.pageToken);
    } else if (input.pageToken.startsWith(CURSOR_PREFIX)) {
      throw new PageTokenError();
    } else {
      singleToken = input.pageToken;
    }
  }

  const searchable = allMode && pageByAccount
    ? targets.filter((account) => pageByAccount?.[account.id])
    : targets;

  if (searchable.length === 0) {
    return {
      query: input.query,
      account: "all",
      threads: [],
      account_errors: [],
      message: "No further pages.",
    };
  }

  const settled = await Promise.all(
    searchable.map(async (account) => {
      try {
        const result = await input.search(account, {
          query: input.query,
          maxResults,
          pageToken: allMode ? pageByAccount?.[account.id] : singleToken,
        });
        return { ok: true as const, account, result };
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "This account failed.";
        return { ok: false as const, account, error: message };
      }
    }),
  );

  const threads: TaggedThread[] = [];
  const accountErrors: AccountError[] = [];
  const nextTokens: Record<string, string> = {};

  for (const item of settled) {
    if (!item.ok) {
      accountErrors.push({
        account: { nickname: item.account.nickname, email: item.account.email },
        error: item.error,
      });
      continue;
    }
    if (item.result.nextPageToken) nextTokens[item.account.id] = item.result.nextPageToken;
    for (const thread of item.result.threads) {
      threads.push({
        ...thread,
        account: { nickname: item.account.nickname, email: item.account.email },
      });
    }
  }

  threads.sort(compareThreads);

  const success = settled.find((item) => item.ok);
  const nextPageToken = allMode ? encodeCursor(nextTokens) : success?.ok ? success.result.nextPageToken : undefined;

  return {
    query: input.query,
    account: allMode ? "all" : selector,
    threads,
    next_page_token: nextPageToken,
    account_errors: accountErrors,
  };
}

function compareThreads(a: TaggedThread, b: TaggedThread): number {
  const aTime = Number(a.internalDate ?? 0);
  const bTime = Number(b.internalDate ?? 0);
  if (aTime !== bTime) return bTime - aTime;
  const email = a.account.email.localeCompare(b.account.email);
  if (email !== 0) return email;
  return a.id.localeCompare(b.id);
}

function encodeCursor(tokens: Record<string, string>): string | undefined {
  const entries = Object.entries(tokens).filter(([, value]) => value);
  if (entries.length === 0) return undefined;
  return CURSOR_PREFIX + Buffer.from(JSON.stringify(Object.fromEntries(entries))).toString("base64url");
}

function decodeCursor(token: string): Record<string, string> {
  if (!token.startsWith(CURSOR_PREFIX)) throw new PageTokenError();
  try {
    const parsed = JSON.parse(Buffer.from(token.slice(CURSOR_PREFIX.length), "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new PageTokenError();
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) out[key] = value;
    }
    return out;
  } catch (error) {
    if (error instanceof PageTokenError) throw error;
    throw new PageTokenError();
  }
}
