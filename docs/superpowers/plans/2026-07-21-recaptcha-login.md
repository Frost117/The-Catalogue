# reCAPTCHA v3 for Phone-OTP Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obtain a reCAPTCHA v3 token client-side and forward it with the existing phone-OTP `request-otp` call, per the backend's new anti-abuse requirement — no other flow changes.

**Architecture:** A new hand-rolled `useRecaptcha` composable lazily injects Google's v3 script once (module-level singleton) and exposes `execute(action): Promise<string>`. `useAuthForm.submitPhoneStep` calls it and passes the token through `useAuth.requestOtp`'s new third parameter to `POST /api/auth/request-otp`, which is already a transparent body-passthrough proxy to the backend — no proxy changes needed.

**Tech Stack:** Nuxt 4, TypeScript, Vitest + `@nuxt/test-utils`.

## Global Constraints

- Scope is the phone-OTP "send code" step only — `verifyOtp`, comment posting, and any other flow are explicitly out of scope; do not touch them.
- No new dependency — the reCAPTCHA integration is hand-rolled, matching this codebase's existing composable style.
- v3 is invisible — no widget, no checkbox, no new UI in `LoginForm.vue`. Google's default corner badge stays visible (not hidden).
- The POST body field name for the token (`recaptchaToken`) is an unverified placeholder — flag it as such in code, don't present it as confirmed.
- A reCAPTCHA failure (script load or `execute()` rejection) must surface through the existing generic `t('auth.requestFailed')` error path — no new error copy or i18n keys.

---

### Task 1: `useRecaptcha` composable + config

**Files:**
- Modify: `nuxt.config.ts:23-44` (add to `runtimeConfig.public`)
- Modify: `.env.example` (document `RECAPTCHA_SITE_KEY`)
- Create: `app/composables/useRecaptcha.ts`
- Test: `test/nuxt/useRecaptcha.test.ts` (new)

**Interfaces:**
- Consumes: `useRuntimeConfig().public.recaptchaSiteKey` (new config)
- Produces: `useRecaptcha(): { execute(action: string): Promise<string> }` — consumed by Task 2.

- [ ] **Step 1: Write the failing test**

Create `test/nuxt/useRecaptcha.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRecaptcha } from '~/composables/useRecaptcha'

mockNuxtImport('useRuntimeConfig', () => () => ({ app: { baseURL: '/' }, public: { recaptchaSiteKey: 'test-site-key' } }))

// One test covering both behaviors deliberately: the script-injection guard
// is module-level singleton state (by design — see useRecaptcha.ts), so
// splitting this into separate `it()` blocks would make the second test see
// the first test's already-resolved script promise and never re-invoke the
// freshly-mocked document.createElement, silently testing the wrong thing.
describe('useRecaptcha', () => {
  it('injects the script once (even across repeated calls) and execute() resolves the grecaptcha token', async () => {
    const scriptEl = { src: '', async: false, onload: null as (() => void) | null, onerror: null as (() => void) | null }
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(scriptEl as unknown as HTMLScriptElement)
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      // Simulate the real Google script loading and defining window.grecaptcha.
      window.grecaptcha = {
        ready: (cb: () => void) => cb(),
        execute: vi.fn().mockResolvedValue('token-abc')
      }
      scriptEl.onload?.()
      return node
    })

    useRecaptcha() // first call: injects the script
    const { execute } = useRecaptcha() // second call: must NOT inject again

    expect(createElementSpy).toHaveBeenCalledTimes(1)
    expect(scriptEl.src).toBe('https://www.google.com/recaptcha/api.js?render=test-site-key')

    const token = await execute('login')
    expect(token).toBe('token-abc')

    createElementSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/nuxt/useRecaptcha.test.ts`
Expected: FAIL — `app/composables/useRecaptcha.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Add `recaptchaSiteKey` to `nuxt.config.ts`**

In the `runtimeConfig` block, change:

```ts
    // Umbraco member-login backend. All /api/auth/* requests are proxied here
    // (server/api/auth/[...].ts); it owns the OTP flow and the session cookie.
    memberLoginHost: process.env.MEMBER_LOGIN_HOST || '',
    public: {}
  },
```

to:

```ts
    // Umbraco member-login backend. All /api/auth/* requests are proxied here
    // (server/api/auth/[...].ts); it owns the OTP flow and the session cookie.
    memberLoginHost: process.env.MEMBER_LOGIN_HOST || '',
    public: {
      // reCAPTCHA v3 site key — unlike every other credential above, this one
      // is meant to be public: it's loaded client-side by useRecaptcha.ts to
      // execute the widget. The backend holds the matching secret key and
      // verifies the token server-side; this app never sees that secret.
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || ''
    }
  },
```

- [ ] **Step 4: Document the env var in `.env.example`**

Add to the end of `.env.example`:

```bash

# reCAPTCHA v3 site key (public — loaded client-side). Required by the
# phone-OTP login flow's request-otp step. The matching secret key lives on
# the backend (MEMBER_LOGIN_HOST), which verifies the token server-side.
RECAPTCHA_SITE_KEY=your-recaptcha-v3-site-key
```

- [ ] **Step 5: Create `app/composables/useRecaptcha.ts`**

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
// though the login modal (the only thing that calls this composable, via
// useAuthForm) may mount/unmount every time it opens/closes.
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

// Fetches a reCAPTCHA v3 token for the phone-OTP request. Lazily injects
// Google's script the first time this is called (client-only). v3 is
// invisible — no widget, no user interaction; Google's badge stays visible in
// the corner per their ToS (hiding it would require adding the required
// attribution text near the form instead, which this app doesn't do).
export function useRecaptcha() {
  const siteKey = useRuntimeConfig().public.recaptchaSiteKey

  if (import.meta.client && siteKey) {
    loadScript(siteKey)
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

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run test/nuxt/useRecaptcha.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite, lint, and typecheck**

Run: `pnpm run test`
Expected: PASS — all existing suites unaffected. Note: this project has a known-flaky cold-start Nuxt setup hook timeout that can hit any nuxt-project test file on the first run in a fresh worktree — if you see ONLY that failure, re-run once to confirm it passes warm.

Run: `pnpm run lint`
Expected: PASS.

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add nuxt.config.ts .env.example app/composables/useRecaptcha.ts test/nuxt/useRecaptcha.test.ts
git commit -m "feat: add useRecaptcha composable for v3 token execution"
```

---

### Task 2: Wire the token into the phone-OTP request

**Files:**
- Modify: `app/composables/useAuth.ts` (the `requestOtp` function)
- Modify: `app/composables/useAuthForm.ts` (the `submitPhoneStep` function)
- Modify: `test/nuxt/useAuthForm.test.ts`

**Interfaces:**
- Consumes: `useRecaptcha().execute(action: string): Promise<string>` (Task 1)
- Produces: `useAuth().requestOtp(phone: number, callingCode: number, recaptchaToken: string): Promise<void>` — new third parameter; nothing later depends on this beyond the request body it sends.

- [ ] **Step 1: Write the failing test change**

In `test/nuxt/useAuthForm.test.ts`, add a `useRecaptcha` mock next to the existing ones:

```ts
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))
mockNuxtImport('useAuth', () => () => ({ ...auth, logout: vi.fn(), user: null, loggedIn: false }))
vi.mock('~/composables/useRecaptcha', () => ({
  useRecaptcha: () => ({ execute: vi.fn().mockResolvedValue('test-token') })
}))
```

And update the one assertion that checks `requestOtp`'s call arguments:

```ts
    expect(auth.requestOtp).toHaveBeenCalledWith(20123456, 45)
```

to:

```ts
    expect(auth.requestOtp).toHaveBeenCalledWith(20123456, 45, 'test-token')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/nuxt/useAuthForm.test.ts`
Expected: FAIL — `requestOtp` is still called with only 2 arguments, so the updated assertion doesn't match; and/or the `useRecaptcha` mock module doesn't resolve to anything real yet since nothing imports it in `useAuthForm.ts`.

- [ ] **Step 3: Update `useAuth.ts`'s `requestOtp`**

Change:

```ts
  async function requestOtp(phone: number, callingCode: number) {
    await $fetch('/api/auth/request-otp', { method: 'POST', body: { phone, callingCode } })
  }
```

to:

```ts
  // `recaptchaToken` is the field name the backend's request-otp endpoint is
  // expected to read the v3 token from — unverified against the live backend;
  // confirm and adjust if it's rejected or named differently.
  async function requestOtp(phone: number, callingCode: number, recaptchaToken: string) {
    await $fetch('/api/auth/request-otp', { method: 'POST', body: { phone, callingCode, recaptchaToken } })
  }
```

- [ ] **Step 4: Update `useAuthForm.ts`'s `submitPhoneStep`**

Change:

```ts
export function useAuthForm(onSuccess: () => void) {
  const { t } = useI18n()
  const { requestOtp, verifyOtp } = useAuth()

  const step = ref<'phone' | 'code'>('phone')
  const phone = ref('')
  const callingCode = ref(DEFAULT_CALLING_CODE)
  const code = ref('')
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  async function submitPhoneStep() {
    loading.value = true
    errorMessage.value = null
    try {
      await requestOtp(Number(phone.value), callingCode.value)
      step.value = 'code'
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      errorMessage.value = statusCode === 400 ? t('auth.invalidPhone') : t('auth.requestFailed')
    } finally {
      loading.value = false
    }
  }
```

to:

```ts
export function useAuthForm(onSuccess: () => void) {
  const { t } = useI18n()
  const { requestOtp, verifyOtp } = useAuth()
  const { execute } = useRecaptcha()

  const step = ref<'phone' | 'code'>('phone')
  const phone = ref('')
  const callingCode = ref(DEFAULT_CALLING_CODE)
  const code = ref('')
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  async function submitPhoneStep() {
    loading.value = true
    errorMessage.value = null
    try {
      const recaptchaToken = await execute('login')
      await requestOtp(Number(phone.value), callingCode.value, recaptchaToken)
      step.value = 'code'
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      errorMessage.value = statusCode === 400 ? t('auth.invalidPhone') : t('auth.requestFailed')
    } finally {
      loading.value = false
    }
  }
```

(`useRecaptcha` is auto-imported the same way `useAuth`/`useI18n` already are — no explicit import line needed.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/nuxt/useAuthForm.test.ts`
Expected: PASS (all 7 tests, including the updated assertion).

- [ ] **Step 6: Run the full suite, lint, and typecheck**

Run: `pnpm run test`
Expected: PASS — no regressions.

Run: `pnpm run lint`
Expected: PASS.

Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/composables/useAuth.ts app/composables/useAuthForm.ts test/nuxt/useAuthForm.test.ts
git commit -m "feat: send a reCAPTCHA v3 token with the phone-OTP request"
```

---

## Manual verification (not automated — do after Task 2)

The exact POST body field name (`recaptchaToken`) is unverified against the live backend. Start the dev server (`pnpm run dev`), open the login modal, submit a phone number, and check the network request to `/api/auth/request-otp` succeeds (not rejected for a missing/misnamed captcha field). If the backend rejects it, check with whoever configured reCAPTCHA on the backend for the exact expected field name and adjust `useAuth.ts`'s `requestOtp` body key accordingly — the rest of the implementation (script loading, token fetching) needs no change either way.
