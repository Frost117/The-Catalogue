// Restore login state before the app renders. This runs during SSR, where
// fetchProfile() forwards the request's session cookie to the backend, so the
// server renders the correct auth state and the client hydrates to match (no
// mismatch, no logged-in flash). The result is carried to the client via the
// useState payload, so no second fetch is needed on load.
export default defineNuxtPlugin(async () => {
  if (import.meta.server) {
    await useAuth().fetchProfile()
  }
})
