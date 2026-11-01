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
2. Set `ALLOWED_ORIGINS` to your Vercel address, exactly, with no trailing slash, e.g. `https://auralis-abc.vercel.app`. To allow more than one address (say a custom domain later), separate them with commas.
3. Click **Save changes**. Render redeploys by itself.

## 4. Try it

1. Open your Vercel address, sign up, and start a focus session.
2. On a second device or browser, sign up with another account.
3. On the first device, open **House**, copy the code, and join it from the second device. Your rooms should open into each other, and chat should work both ways.

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
