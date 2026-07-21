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

  if (import.meta.dev && import.meta.client && !siteKey) {
    console.warn('RECAPTCHA_SITE_KEY is not set — the phone-OTP request will fail. See .env.example.')
  }

  if (import.meta.client && siteKey) {
    // Fire-and-forget: a failure here is not swallowed silently — execute()
    // below awaits this same singleton promise and surfaces the rejection
    // through its own caller's error handling. This call just starts the
    // load early (as soon as the login modal mounts) without leaving an
    // unhandled-rejection warning if it fails before execute() is called.
    loadScript(siteKey).catch(() => {})
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
