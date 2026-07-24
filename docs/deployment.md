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
3. **Environment variables:** non-secret config ships in `wrangler.toml`'s `[vars]`
   block (committed). Add only the two credentials —
   `NUXT_COMPOSE_CLIENT_ID` and `NUXT_COMPOSE_CLIENT_SECRET` — as **encrypted
   secrets** under Settings → Variables and Secrets. See the mapping table below.
4. **Custom domain:** add it under the project's Custom Domains.
5. Trigger the first deploy by pushing to `main` (or "Retry deployment").

## Environment variables

Local dev and Cloudflare use **different mechanisms** for the same config:

- **Local dev:** `nuxt.config.ts` reads `process.env.*` (from `.env`) at build time —
  e.g. `GQL_HOST`, `COMPOSE_CLIENT_SECRET`, `RECAPTCHA_SITE_KEY`.
- **Cloudflare:** the build has no plaintext env (the dashboard only accepts encrypted
  secrets, and plain vars are managed in `wrangler.toml`), so those build-time reads
  resolve to empty. Instead, Nuxt's **runtime config override** supplies the values:
  any env var named **`NUXT_<KEY>`** — where `<KEY>` is the *runtimeConfig key*, not
  the old `process.env` name — overrides that config at request time. Server routes
  read `useRuntimeConfig()` per request, so this is all that's needed.

Name mapping (old build-time name → runtimeConfig key → Cloudflare env var):

| Local `.env` | runtimeConfig key | Cloudflare env var | Where set | Secret? |
|---|---|---|---|---|
| `GQL_HOST` | `composeGraphqlUrl` | `NUXT_COMPOSE_GRAPHQL_URL` | `wrangler.toml [vars]` | no |
| `COMPOSE_COLLECTION_ALIAS` | `composeCollectionAlias` | `NUXT_COMPOSE_COLLECTION_ALIAS` | `wrangler.toml [vars]` | no |
| `MEMBER_LOGIN_HOST` | `memberLoginHost` | `NUXT_MEMBER_LOGIN_HOST` | `wrangler.toml [vars]` | no |
| `RECAPTCHA_SITE_KEY` | `public.recaptchaSiteKey` | `NUXT_PUBLIC_RECAPTCHA_SITE_KEY` | `wrangler.toml [vars]` | no (public key) |
| `COMPOSE_CLIENT_ID` | `composeClientId` | `NUXT_COMPOSE_CLIENT_ID` | **dashboard secret** | yes |
| `COMPOSE_CLIENT_SECRET` | `composeClientSecret` | `NUXT_COMPOSE_CLIENT_SECRET` | **dashboard secret** | yes |
| `COMPOSE_AUTH_TOKEN_URL` | `composeAuthTokenUrl` | `NUXT_COMPOSE_AUTH_TOKEN_URL` | (default; set only if differs) | no |
| `MEMBER_SESSION_COOKIE` | `memberSessionCookie` | `NUXT_MEMBER_SESSION_COOKIE` | (default; set only if differs) | no |

The non-secret vars are committed in `wrangler.toml`'s `[vars]` block. The two
`COMPOSE_CLIENT_*` credentials are **not** in git — add them as encrypted secrets in
the Pages dashboard (Settings → Variables and Secrets), using the exact `NUXT_`
names above. Secrets set this way also override runtimeConfig at runtime.

`NUXT_PUBLIC_RECAPTCHA_SITE_KEY` is a public key, but the override still applies at
runtime and reaches the browser via the SSR payload.

Notes:

- **`NUXT_PUBLIC_SITE_URL` is the exception:** it feeds i18n's `baseUrl`, which is
  resolved at **build** time (a module option, not runtimeConfig), so a runtime var
  does not affect it. It only impacts hreflang/canonical SEO tags — currently falls
  back to `http://localhost:3000` on CF. Fix separately if SEO tags matter (e.g. hard-
  code the production origin in `nuxt.config.ts` or move it into runtimeConfig).
- **Preview vs Production:** `[vars]` at the top level of `wrangler.toml` apply to
  production; add an `[env.preview.vars]` block to point preview deploys at test
  backends.
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
