# Deploying Auralis

- **Render** runs the game server: the API and the live multiplayer connection.
- **Vercel** hosts the website.
- **Neon** keeps the data (Postgres) and room snapshots (Object Storage). It's already set up.

```
players ──▶ Vercel (website) ──API + WebSocket──▶ Render (game server) ──▶ Neon Postgres + Object Storage
```

Do the steps in this order: the website needs the server's address, and the server then needs the website's address.

## 0. Put the code on `main`

The code is on the `launch` branch.

1. Open https://github.com/Anirudh-Kambampati/Auralis/compare/main...launch
2. Click **Create pull request**, then **Merge pull request**.

(You can also skip this and choose the `launch` branch in Render and Vercel.)

## 1. Game server on Render

1. Go to https://render.com and sign up with GitHub.
2. Click **New +** → **Blueprint** and pick the **Auralis** repository. Render reads `render.yaml` and proposes a web service called `auralis-server` (free plan, Singapore, near your Neon database).
3. Render asks for the secret values. Open your local `.env.local` file and copy across:
   - `DATABASE_URL`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_ENDPOINT_URL_S3`
   - `AWS_REGION`
   - `ALLOWED_ORIGINS`: leave it **empty for now** (you'll fill it in at step 3).
   - `SITE_URL`: leave it empty for now too; it is your website's address, from step 2. Until it is set, reset links fall back to the first `ALLOWED_ORIGINS` entry.
   - `MAIL_PROVIDER` = `brevo`, `MAIL_FROM`, `MAIL_API_KEY`: see step 5. Leave them empty if you don't want password reset yet; nothing else breaks.
4. Click **Apply** and wait for the deploy to show **Live**.
5. Copy the service address shown at the top, e.g. `https://auralis-server.onrender.com`. Your exact name may differ.
6. Check it: open `https://<your-render-address>/api/health`. You should see `{"ok":true}`.

## 2. Website on Vercel

1. Go to https://vercel.com and sign up with GitHub.
2. Click **Add New…** → **Project**, then import **Auralis**. Vercel picks up `vercel.json` (Vite, build `npm run build`, output `dist`).
3. Open **Environment Variables** and add, using your Render address from step 1:
   - `VITE_API` = `https://<your-render-address>`
   - `VITE_SERVER` = `wss://<your-render-address>/ws`
4. Click **Deploy**. When it finishes, copy your site address, e.g. `https://auralis-abc.vercel.app`.

## 3. Let the website talk to the server

1. In Render, open **auralis-server** → **Environment**.
2. Set `ALLOWED_ORIGINS` to every address the website is served from, exactly, with no trailing slashes, separated by commas — for example `https://auralis-abc.vercel.app,https://auralis-one.netlify.app`. Each one is a front end people can log in from, and a reset link opens the one the request came from, so each keeps its own domain. An address missing here cannot talk to the server at all.
3. Click **Save changes**. Render redeploys by itself.

If sending a picture or document says **"Failed to fetch"**, the browser blocked the request: check that `ALLOWED_ORIGINS` matches the website's address exactly. If it says **"…file storage, which is not set up"**, the four `AWS_*` values are missing on Render.

## 4. Try it

1. Open your Vercel address, sign up, and start a focus session.
2. On a second device or browser, sign up with another account.
3. On the first device, open **House**, copy the code, and join it from the second device. Your rooms should open into each other, and chat should work both ways.

## 5. Password reset mail

Render's free plan cannot open an SMTP connection, so the server sends mail through an HTTP API. **Brevo** is the default because it needs no domain: one address you verify, and mail from it.

1. Sign up at https://www.brevo.com (free: 300 emails a day, no card).
2. Open your account menu at the bottom left → **Settings** → **Senders, Domains, IPs** → **Senders** → **Add a sender**, and enter the code they mail to that address. Your own inbox is fine: it is the address people will see in the From line. (In the current dashboard the old top-level "Senders, Domains & Dedicated IPs" tab is gone; senders, domains and IPs live together under Settings.)
3. Open **Settings** → **SMTP & API** → **API Keys & MCP** → **Generate a new API key**, and copy it once (the key is shown a single time; generating one asks for a code sent to your device).
4. The mail arrives with the From line rewritten to `<you>@<account-id>.brevosend.com`, not your own address: Brevo sends from its shared domain when the account has no authenticated domain. The display name (Auralis) stays, replies still reach your inbox, and the address is only cosmetic — but a domain, or a provider that sends the verified address unchanged, is the only way to change it.
5. A new account may show *"You'll need to verify your phone before sending your first campaign or messages"*: **Verify now** takes a mobile number and an SMS code, and transactional sending needs it too. If a send still comes back `450` / "transactional platform not activated", the sending platform needs activating for that account: open a support ticket from inside Brevo and ask for transactional email. `[mail] brevo refused ...` in the server log is where that shows up.
6. Locally, add to `.env.local`:

   ```bash
   MAIL_PROVIDER=brevo
   MAIL_FROM=you@example.com
   MAIL_API_KEY=the-key-brevo-gave-you
   SITE_URL=http://localhost:5173
   ```

7. On Render, set the same three `MAIL_*` values, plus `SITE_URL` = your Vercel address, exactly as in step 3 (no trailing slash).
8. Test it: sign out, **Forgot password?**, your own address. The link expires in an hour and works once. To try the flow without sending anything, set `MAIL_DRY_RUN=1` and read the message in the Render log instead.

If nothing arrives, the log says why: `[mail] not configured` means a value is missing, and `[mail] brevo refused 401/403` means the key or the verified sender is wrong.

## Good to know

- **Free Render servers sleep** after about 15 minutes with no visitors. The website still loads instantly from Vercel, but the first sign-in or connection can take up to a minute while the server wakes. A paid Render plan keeps it awake.
- **Changing `VITE_*` values** in Vercel needs a redeploy (**Deployments** → **⋯** → **Redeploy**), because they're built into the website.
- **Updates**: push to `main` and both Render and Vercel redeploy automatically.
- **Secrets** live only in the Render dashboard and your local `.env.local`. Never commit `.env.local`.
- **Leftover test data**: the database still holds the test accounts made during development (`devtester`, `devfriend`, `e2e_*`). To start clean, open the Neon console → your project → **SQL Editor** and run:

  ```sql
  delete from auth; delete from accounts; delete from players; delete from houses;
  ```

  Do this before real players sign up, because it removes every account. Test snapshots under `snapshots/` in the `assets` bucket can be removed from the Neon console's storage view.

## Search engines (sitemap)

`public/sitemap.xml` lists the pages worth indexing (the landing page and the privacy policy), and `public/robots.txt`
lets crawlers in, keeps them off the offline page, and points to the sitemap. Both are copied into `dist/` on build.

To submit the sitemap to Google:

1. Open [Google Search Console](https://search.google.com/search-console) and add a **URL prefix** property for
   `https://auralis-ebon.vercel.app/`.
2. Verify you own it. The easiest way on Vercel is the **HTML tag** method: copy the `<meta name="google-site-verification" …>`
   tag into the `<head>` of `index.html`, deploy, then press **Verify**.
3. Go to **Sitemaps**, enter `sitemap.xml` and press **Submit**. Google shows it as *Success* once it has read it; indexing
   itself can take a few days.

When a page is added or changes a lot, update its `<lastmod>` date in `sitemap.xml`.

**If the site moves to a custom domain**, update the address in `public/sitemap.xml` (every `<loc>`), the `Sitemap:` line in
`public/robots.txt`, and the link-preview tags (`og:url`, `og:image`, `twitter:image`) in `index.html`, then add the new
domain as its own property in Search Console and submit the sitemap there. The Play Store files listed in
`docs/play-store.md` need the new domain too.
