// reCAPTCHA v2 Invisible integration. The Umbraco member-login backend protects
// POST /api/auth/request-otp and /api/auth/verify-otp and returns 403 unless the
// request carries a fresh token in the X-Recaptcha-Token header. This composable
// loads Google's api.js once, renders a single invisible widget (which also
// surfaces the mandatory badge), and mints single-use tokens via execute().
//
// State is module-level, not useState: grecaptcha is a browser-only global and
// there is exactly one widget for the whole app, so it never crosses the
// SSR/client boundary or needs per-request isolation.

interface Grecaptcha {
  render: (container: HTMLElement, params: Record<string, unknown>) => number
  execute: (widgetId: number) => void
  reset: (widgetId: number) => void
  ready: (cb: () => void) => void
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha
  }
}

let scriptPromise: Promise<void> | null = null
let widgetId: number | null = null
// Resolver for the in-flight execute(); the widget's callbacks fulfill it.
let pending: { resolve: (token: string) => void, reject: (err: Error) => void } | null = null

export function useRecaptcha() {
  const siteKey = useRuntimeConfig().public.recaptchaSiteKey

  // Inject api.js once and resolve when grecaptcha is ready. render=explicit
  // stops Google from auto-rendering elements — we render our widget by hand.
  function loadScript(): Promise<void> {
    if (scriptPromise) {
      return scriptPromise
    }
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.onload = () => window.grecaptcha!.ready(() => resolve())
      script.onerror = () => reject(new Error('Failed to load reCAPTCHA'))
      document.head.appendChild(script)
    })
    return scriptPromise
  }

  // Render the single invisible widget on first use. Rendering it also shows the
  // reCAPTCHA badge, which Google requires whenever the widget is active.
  async function ensureWidget(): Promise<number> {
    if (widgetId !== null) {
      return widgetId
    }
    await loadScript()
    const container = document.createElement('div')
    document.body.appendChild(container)
    widgetId = window.grecaptcha!.render(container, {
      'sitekey': siteKey,
      'size': 'invisible',
      'callback': (token: string) => {
        pending?.resolve(token)
        pending = null
      },
      'error-callback': () => {
        pending?.reject(new Error('reCAPTCHA error'))
        pending = null
      },
      'expired-callback': () => {
        pending?.reject(new Error('reCAPTCHA token expired'))
        pending = null
      }
    })
    return widgetId
  }

  // Preload the widget on page load so the badge is visible site-wide and the
  // first login doesn't pay the script-load latency. No-op without a key.
  async function init(): Promise<void> {
    if (!siteKey) {
      return
    }
    await ensureWidget()
  }

  // Mint a fresh single-use token. Tokens expire in ~2 min, so we reset and
  // execute right before each request; the widget callback resolves with it.
  async function execute(): Promise<string> {
    if (!siteKey) {
      throw new Error('RECAPTCHA_SITE_KEY is not configured.')
    }
    const id = await ensureWidget()
    if (pending) {
      throw new Error('A reCAPTCHA challenge is already in progress.')
    }
    return new Promise<string>((resolve, reject) => {
      pending = { resolve, reject }
      window.grecaptcha!.reset(id)
      window.grecaptcha!.execute(id)
    })
  }

  return { init, execute }
}
