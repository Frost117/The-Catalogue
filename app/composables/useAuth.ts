import type { AuthUser } from '~/types/user'

// Thin wrapper around nuxt-auth-utils' useUserSession(), adding the app's
// own auth verbs so components never call $fetch directly for auth — same
// convention as the show-data composables owning all data access.
//
// `user`/`loggedIn` come from the SSR-populated session (no localStorage), which
// is the idiomatic form of the spec's "restore session from the profile endpoint
// on load" — the session is already resolved by the time the app mounts.
export function useAuth() {
  const { user, loggedIn, fetch: refreshSession, clear } = useUserSession()

  async function requestOtp(phone: number, callingCode: number) {
    await $fetch('/api/auth/request-otp', { method: 'POST', body: { phone, callingCode } })
  }

  async function verifyOtp(phone: number, callingCode: number, code: string) {
    const result = await $fetch<AuthUser>('/api/auth/verify-otp', {
      method: 'POST',
      body: { phone, callingCode, code }
    })
    await refreshSession()
    return result
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await clear()
  }

  return { user, loggedIn, requestOtp, verifyOtp, logout }
}
