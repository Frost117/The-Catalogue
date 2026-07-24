// Preload the invisible reCAPTCHA widget on app start (client only — grecaptcha
// is a browser global). This keeps the mandatory badge visible site-wide and
// warms the script so the first OTP request resolves instantly. The token itself
// is minted per-request in useAuth via useRecaptcha().execute().
export default defineNuxtPlugin(() => {
  useRecaptcha().init()
})
