# Deployment

The Catalogue deploys to **Cloudflare Pages** via **Git integration**: pushing to
`main` triggers a Cloudflare build + production deploy, and every PR/branch gets an
automatic preview deployment. No Cloudflare API token is stored in GitHub.

```
git push origin main
      │  (GitHub webhook)
      ▼
Cloudflare Pages build  ── pnpm install → pnpm build → dist/
      ▼
Production deploy (custom domain)     PRs/branches → automatic preview URLs
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint/typecheck/test on every push
as a quality signal. It runs **independently** of the Cloudflare build — a red CI
run does not block a Pages deploy. If we ever need tests to gate deploys, switch to
a GitHub Actions + `wrangler pages deploy` model instead.

## Build configuration

| Setting | Value |
|---|---|
| Nitro preset (`nuxt.config.ts`) | `cloudflare_pages` |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | `22` (pinned via `.node-version`) |
| Package manager | pnpm (auto-detected from `packageManager` field via corepack) |

`wrangler.toml` supplies the Pages project name and runtime settings:

```toml
name = "the-catalogue"
compatibility_date = "2025-01-15"
compatibility_flags = ["nodejs_compat"]   # required: server routes use h3 proxyRequest + Node APIs
pages_build_output_dir = "dist"           # the cloudflare_pages Nitro preset outputs here (not .output/public)
```

## One-time Cloudflare setup (dashboard)

1. **Create the project:** Workers & Pages → Create → Pages → **Connect to Git** →
   select `Frost117/The-Catalogue` → production branch `main`.
2. **Build settings:** use the table above (build command `pnpm build`, output
   `dist`).
3. **Environment variables:** set the matrix below for both **Production** and
   **Preview**. Mark secrets as **encrypted**.
4. **Custom domain:** add it under the project's Custom Domains, then set
   `NUXT_PUBLIC_SITE_URL` to that origin.
5. Trigger the first deploy by pushing to `main` (or "Retry deployment").

## Environment variables

All names are read via `process.env.*` in `nuxt.config.ts` **at build time**, so
they must exist in the Cloudflare Pages build environment. Server-only values are
baked into `.output/server` (the Worker) and never shipped to the browser; the one
public value is inlined into the client bundle.

| Variable | Scope | Secret? | Notes |
|---|---|---|---|
| `COMPOSE_CLIENT_ID` | server | yes | Compose OAuth client id |
| `COMPOSE_CLIENT_SECRET` | server | yes | Compose OAuth client secret |
| `COMPOSE_AUTH_TOKEN_URL` | server | no | has a default; set only if it differs |
| `COMPOSE_COLLECTION_ALIAS` | server | no | must be set (currently absent from local `.env`) |
| `GQL_HOST` | server | no | full Compose GraphQL URL |
| `MEMBER_LOGIN_HOST` | server | no | Umbraco member-login backend (production value) |
| `MEMBER_SESSION_COOKIE` | server | no | has a default (`.AspNetCore.Identity.Application`) |
| `RECAPTCHA_SITE_KEY` | **public** | no | must be present at build (inlined into client bundle) |
| `NUXT_PUBLIC_SITE_URL` | public | no | production origin for i18n hreflang/canonical |

Notes:

- **Preview vs Production:** consider pointing Preview's `MEMBER_LOGIN_HOST` /
  `GQL_HOST` at test backends so preview deploys don't touch production data.
- **Rotating server secrets without a rebuild:** alternatively set them as
  `NUXT_`-prefixed runtime vars (e.g. `NUXT_COMPOSE_CLIENT_SECRET`) so Nitro's
  runtime override supplies them instead of baking them into the artifact. The
  public `RECAPTCHA_SITE_KEY` must stay a build-time var regardless, since the
  client bundle inlines it at build.
- `NUXT_SESSION_PASSWORD` in the local `.env` is unused (read nowhere) and does not
  need to be set in Cloudflare.

## Local verification (before pushing)

Reproduce the Cloudflare build and runtime locally:

```bash
rm -rf dist                    # clear any stale build
pnpm build                     # emits dist/_worker.js + dist/_routes.json
npx wrangler pages dev dist    # or: pnpm preview
```

`pnpm build` auto-loads `.env`, so secrets are baked into the local build. Then
smoke-test the served URL:

- `/` redirects to `/en`; a show page renders (SSR + Compose GraphQL).
- Login flow: request an OTP — exercises the reCAPTCHA token and the `/api/auth/*`
  proxy. Confirm no reCAPTCHA badge shows and the attribution notice renders.

Keep `pnpm lint && pnpm typecheck && pnpm test` green.

## Post-deploy verification

1. Open a PR → confirm a **preview URL** is generated and loads.
2. Merge to `main` → confirm the **production** deploy publishes on the custom domain.
3. On the deployed site, run the login flow end-to-end against the production
   `MEMBER_LOGIN_HOST`: the session cookie is set on our origin (same-origin proxy)
   and the OTP request returns 200, not 403. This confirms the secrets and the
   reCAPTCHA key are configured correctly in Cloudflare.

## Rollback

Cloudflare dashboard → the Pages project → Deployments → **Rollback to this
deployment** on a previous known-good build.
