# Multi Gmail

A private connector you deploy yourself. It links several Gmail accounts to one AI agent, such as a receipt or invoice ledger.

This is a single-owner kit. You put it on your own free Vercel account, with your own Google Cloud project. Only you sign in. You do not submit the app to Google for review, and you do not need a CASA security assessment. Those steps are only for an app the general public can install.

Plan on about 15 minutes.

## Deploy with Vercel

The source repository is [github.com/ecoay/multi-email](https://github.com/ecoay/multi-email). This button clones it into your Vercel account, asks for the four secrets, and adds a Neon database.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fecoay%2Fmulti-email&project-name=multi-email&repository-name=multi-email&env=OWNER_PASSWORD,TOKEN_ENC_KEY,GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET&envDescription=OWNER_PASSWORD%20is%20the%20password%20you%20type%20to%20sign%20in.%20TOKEN_ENC_KEY%20is%20a%20different%20long%20random%20string%20that%20locks%20saved%20Gmail%20keys%3B%20save%20it%20in%20a%20password%20manager.%20GOOGLE_CLIENT_ID%20and%20GOOGLE_CLIENT_SECRET%20come%20from%20Google%20Cloud.%20If%20you%20do%20not%20have%20them%20yet%2C%20type%20replace-me%20for%20those%20two.&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button asks for four values and adds a Neon Postgres database. Neon fills in `DATABASE_URL` for you. You do not create a database by hand and you do not copy a connection string.

## Keys you will be asked for

Write these down before you start.

| Name | What to type |
| --- | --- |
| `OWNER_PASSWORD` | A password you will remember. You type it to open the site and to approve the AI connector. |
| `TOKEN_ENC_KEY` | A different long random string, at least 20 characters. You will not type it day to day. It locks the saved Gmail keys. Save it. If you lose it or change it, link Gmail again. |
| `GOOGLE_CLIENT_ID` | From Google Cloud, step 3. Until then, type `replace-me`. |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud, step 3. Until then, type `replace-me`. |

You do not set `DATABASE_URL` or `BASE_URL` for a normal Vercel deploy.

## Setup

### 1. Start from the public repository

The code is at [github.com/ecoay/multi-email](https://github.com/ecoay/multi-email). The deploy button copies it into your own GitHub and Vercel accounts. The passwords stay in Vercel. They are not in the code.

### 2. Deploy

Click the button above, or go to [vercel.com/new](https://vercel.com/new) and import the repository.

1. Sign in to Vercel. A free account is enough.
2. When asked for environment variables, fill in the four keys from the table.
3. Add the database when Vercel offers it. Choose **Neon**. Pick the free plan and accept. If you do not see it, open the project later, go to **Storage** (or the Marketplace), install **Neon**, and connect it to this project.
4. Click Deploy. Wait until it says Ready.
5. Copy the site address. It looks like `https://multi-email-xxxx.vercel.app`.

Open that address. The home page lists what is still missing. It never shows the secret values.

### 3. Create the Google Cloud project

Use the Google account you check most often.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project menu at the top. Click **New project**. Name it `Multi Gmail`. Click **Create**. Select that project when it is ready.
3. Open [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and click **Enable**.
4. Open [Google Auth platform](https://console.cloud.google.com/auth/overview). If you see **Get started**, click it.
   - App name: `Multi Gmail`
   - User support email: your email
   - Audience: **External**
   - Contact email: your email
   - Agree and create
5. Open **Audience**. Leave the publishing status on **Testing**. Under **Test users**, click **Add users**. Add every Gmail address you will link, including your own. Save.
6. Open **Clients**. Click **Create client**.
   - Type: **Web application**
   - Name: `Multi Gmail`
   - Authorized redirect URI: `https://YOUR-SITE.vercel.app/api/google/callback`  
     Use the site address from step 2. No slash at the end.
   - Create. Copy the **Client ID** and **Client secret**.
7. Open **Data Access**. Click **Add or remove scopes**. Search for `gmail`. Check `https://www.googleapis.com/auth/gmail.readonly` (view your email). Click **Update**, then **Save**.

If your console still says **OAuth consent screen** instead of Audience, use that page: choose External, add the same scope, add yourself as a test user, and leave the app in Testing.

### 4. Paste the Google keys

1. In Vercel, open the project, then **Settings**, then **Environment Variables**.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the values you copied. Replace `replace-me`.
3. Open **Deployments**. On the latest deployment, open the menu and click **Redeploy**. New values do not apply until you redeploy.

### 5. Link your Gmail accounts

1. Open the site and sign in with `OWNER_PASSWORD`.
2. Click **Add Gmail**. A nickname such as `receipts` or `work` is optional.
3. Google will say the app is not verified. Click **Advanced**, then **Go to Multi Gmail (unsafe)**. That warning is normal. This is your own test app.
4. Choose the Google account and click **Allow**.
5. Repeat for each inbox. Each address must be in the test users list from step 3.

### 6. Add the connector to your AI

The connector URL is:

```text
https://YOUR-SITE.vercel.app/api/mcp
```

The home page shows the same address.

**Cursor**

1. Open Cursor Settings, then MCP.
2. Add a custom MCP server.
3. Paste the connector URL. Choose Streamable HTTP if it asks for a transport.
4. A browser tab opens. Enter the owner password and click **Allow**.
5. Ask the agent: `Search all of my accounts for receipts from this month.`

**Claude**

1. Open Settings, then Connectors.
2. Add a custom connector and paste the same URL.
3. Approve it with the owner password when the browser opens.

## What you can skip

- Do not click **Publish app** in Google Cloud.
- Do not submit the app for verification.
- Do not buy or start a CASA security assessment.

Stay in **Testing**. Only the addresses you added as test users can connect (up to 100). Because nobody else uses this copy, Google's public review does not apply.

There is one tradeoff. In Testing, Google expires the saved sign-in after about **7 days**. When that happens, open the site and click **Re-auth** on that account. The other accounts keep working. A broken account does not make a search of all accounts fail.

If this is a **Google Workspace** account and you see **Internal** as an audience choice, you can pick Internal instead of External. You then skip test users, and the 7-day limit does not apply. Only people in your organization can approve the app. You still do not need Google's public review.

## Optional: let the agent create drafts

Reading mail is the default. To also create drafts (they are not sent):

1. In Vercel, set `GMAIL_ENABLE_WRITE` to `true`. Redeploy.
2. In Google Cloud, on Data Access, also add `https://www.googleapis.com/auth/gmail.modify` and `https://www.googleapis.com/auth/gmail.send`. Save.
3. On the site, click **Re-auth** for each account so Google grants the new access.

The `create_draft` tool appears only after this.

## If you use a custom domain

Add the domain in Vercel. Then set `BASE_URL` to `https://your-domain` with no slash at the end, and add `https://your-domain/api/google/callback` as a second redirect URI in the Google client. Redeploy.

## Run it on your computer

You need Node.js 20 or newer and a Postgres database. Neon can give you a local `DATABASE_URL` from its dashboard, or use any Postgres you already have.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Set `BASE_URL` to `http://127.0.0.1:43123` and use that same redirect URI in Google Cloud.

```bash
npm run db:migrate
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

On Vercel you do not run the migrate command. The site creates its tables the first time it talks to the database. The SQL is in `db/migrations/001_init.sql` if you want to read it.

```bash
npm test
npm run build
```

## Tools

The agent calls these after it signs in with MCP OAuth. `account` is a nickname, an email address, or `all`.

| Tool | What it does |
| --- | --- |
| `list_accounts` | Nicknames, emails, and whether an account needs re-auth. |
| `search_threads` | Search one mailbox or all of them. `query` uses Gmail search syntax. `max_results` is per account (1 to 25, default 10). Results are merged, newest first, and each hit is tagged with its account. Pass `page_token` from the previous result to get the next page. |
| `get_message` | One message: headers, text, and attachment names. Name the account. |
| `get_thread` | Every message in one thread. |
| `list_attachments` | File names, types, sizes, and attachment ids. Does not download the file. |
| `get_attachment` | One file as base64. Files over about 3 MB are refused. |
| `create_draft` | Only when `GMAIL_ENABLE_WRITE=true`. Saves a draft. Does not send it. |

If you search `all` and one account fails, the others still come back. The failure is in `account_errors`.

Message and thread ids belong to one mailbox. Pass the same account the search result named.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OWNER_PASSWORD` | Yes | The only sign-in for this copy. |
| `TOKEN_ENC_KEY` | Yes | AES-256-GCM key for Google refresh tokens. A long password is hashed to 32 bytes. A 64-character hex key or a 32-byte base64 key is used as-is. |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client from your Google Cloud project. |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret. |
| `DATABASE_URL` | Yes | Provided by the Neon integration on Vercel. |
| `BASE_URL` | No | Public site URL. Detected on Vercel. Set it locally or for a custom domain. |
| `GMAIL_ENABLE_WRITE` | No | `true` adds modify and send scopes and the `create_draft` tool. Default is read-only. |

## Limitations

- One owner per deployment. Someone else should deploy their own copy. Do not share the owner password.
- Gmail scope is read-only unless you turn on drafts. The connector does not send mail.
- Testing mode refresh tokens last about 7 days. Re-auth from the site when a row says **Needs re-auth**.
- Google shows an unverified-app warning. That is expected while the app stays in Testing.
- Attachment downloads stop around 3 MB because Vercel responses are limited to 4.5 MB.
- Changing `TOKEN_ENC_KEY` makes old saved tokens unreadable. Link the accounts again.
- MCP access tokens last one hour. Clients refresh them. Refresh tokens rotate and last 30 days.
- The owner password locks out for 15 minutes after 8 wrong tries.
- Anyone who can open your Vercel project or the Neon database can reach the encrypted tokens. The encryption key is only useful together with those tokens, and the owner password is what lets an agent call the tools. Keep both private.
