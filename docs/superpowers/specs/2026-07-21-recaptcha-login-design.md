# reCAPTCHA v3 for phone-OTP login — design

## Goal

The backend has configured reCAPTCHA as an anti-abuse measure on the phone-OTP login flow specifically (not comment posting). `RECAPTCHA_SITE_KEY` has already been added to `.env` — only a site key, no secret, confirming verification happens server-side (on `MEMBER_LOGIN_HOST`), not in this frontend. The frontend's job is to obtain a v3 token client-side and forward it with the existing `request-otp` call.

## Scope

- **In scope:** the "send me a code" step only (`useAuthForm.submitPhoneStep` → `useAuth.requestOtp` → `POST /api/auth/request-otp`).
- **Out of scope:** comment posting (confirmed not required), the code-verification step (`verifyOtp` — not required), any UI/widget (v3 is invisible, no checkbox or challenge shown under normal conditions).

## Architecture

Both `/api/auth/*` and `/api/comments` are already thin, transparent, body-passthrough proxies to `MEMBER_LOGIN_HOST` (see `server/api/auth/[...].ts`, `server/api/comments.post.ts`) — neither touches the request body. So the only change on the request path is: get a token, add it to the body `useAuth.requestOtp` already sends. No proxy changes needed.

## Config

`RECAPTCHA_SITE_KEY` is a site key — meant to be public, loaded client-side to render/execute the widget — unlike every other credential in `.env` (Compose client id/secret, member-login host), which are server-only and never reach the browser. Expose it via `runtimeConfig.public.recaptchaSiteKey` in `nuxt.config.ts` (the one empty `public: {}` block already there), and document `RECAPTCHA_SITE_KEY` in `.env.example` (currently missing — it's only in the real `.env`).

## New composable: `app/composables/useRecaptcha.ts`

Hand-rolled (no new dependency), matching this codebase's existing style of small custom composables over integration modules.

```ts
declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, options: { action: string }) => Promise<string>
    }
  }
}

// Module-level singleton: the script must only ever be injected once, even
// though the login modal (the only thing that calls this composable) may
// mount/unmount every time it opens/closes.
let scriptPromise: Promise<void> | null = null

function loadScript(siteKey: string): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load reCAPTCHA script.'))
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

// v3 is invisible — no widget, no user interaction. Google's small corner
// badge stays visible (their ToS requires either the badge or an explicit
// attribution notice near the form if it's hidden via CSS; keeping the
// default badge avoids that extra text/legal surface).
export function useRecaptcha() {
  const siteKey = useRuntimeConfig().public.recaptchaSiteKey as string

  if (import.meta.client && siteKey) {
    loadScript(siteKey) // start loading as soon as the login form mounts
  }

  async function execute(action: string): Promise<string> {
    if (!siteKey) {
      throw new Error('reCAPTCHA site key is not configured.')
    }
    await loadScript(siteKey)
    return new Promise((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window.grecaptcha!.execute(siteKey, { action }).then(resolve).catch(reject)
      })
    })
  }

  return { execute }
}
```

Calling `useRecaptcha()` from inside `useAuthForm`'s setup (not `LoginForm.vue` directly) means the script starts loading the moment the login modal first opens — the same moment `LoginForm.vue` mounts and calls `useAuthForm()` — giving it time to be ready before the user finishes typing their phone number and hits submit. No separate wiring in `app.vue` needed.

## Wiring into the existing flow

**`app/composables/useAuth.ts`** — `requestOtp` gains a third parameter, included in the POST body:

```ts
async function requestOtp(phone: number, callingCode: number, recaptchaToken: string) {
  await $fetch('/api/auth/request-otp', { method: 'POST', body: { phone, callingCode, recaptchaToken } })
}
```

`recaptchaToken` is a placeholder field name — the exact name the backend's request model expects isn't confirmed yet. Same situation as this session's Compose schema-drift fixes: verify live against the actual backend once reachable, adjust if it's named differently (e.g. `captchaToken`, `g-recaptcha-response`).

**`app/composables/useAuthForm.ts`** — `submitPhoneStep` gets a token before calling `requestOtp`:

```ts
const { execute } = useRecaptcha()

async function submitPhoneStep() {
  loading.value = true
  errorMessage.value = null
  try {
    const token = await execute('login')
    await requestOtp(Number(phone.value), callingCode.value, token)
    step.value = 'code'
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    errorMessage.value = statusCode === 400 ? t('auth.invalidPhone') : t('auth.requestFailed')
  } finally {
    loading.value = false
  }
}
```

If `execute()` itself throws (script failed to load, site key missing), it's caught by the same existing `catch` and shown as `t('auth.requestFailed')` — the same generic failure message already used for other request-otp failures. No new error copy, no new i18n keys — deliberately reusing the existing path rather than special-casing a reCAPTCHA-specific error message.

**`LoginForm.vue`** — unchanged. No new UI; v3 has no visible widget to bind.

## Testing

`useAuthForm.test.ts` already mocks `useAuth` wholesale (`mockNuxtImport('useAuth', () => () => ({ ...auth, logout: vi.fn(), user: null, loggedIn: false }))`) and asserts `requestOtp` is called with specific arguments — those assertions need a third argument added. `useRecaptcha` itself needs mocking in that test file (`vi.mock('~/composables/useRecaptcha', () => ({ useRecaptcha: () => ({ execute: vi.fn().mockResolvedValue('test-token') }) }))`) so `submitPhoneStep` doesn't try to load a real script in the test environment.

A new small test file for `useRecaptcha.ts` itself covers: the script is injected with the right `src` (once, even across repeated `useRecaptcha()` calls), and `execute()` resolves whatever `grecaptcha.execute()` resolves once `grecaptcha.ready()`'s callback fires.

## Out of scope / accepted risk

- **Token field name is unverified** — flagged above, needs a live check.
- **Comment posting and code verification** — confirmed not required by the backend; not touched.
- **No fallback UX for reCAPTCHA outages** — a load/execute failure surfaces as the existing generic "request failed" message; no dedicated retry/bypass flow.
