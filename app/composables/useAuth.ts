import type { AuthUser } from '~/types/user'

// The Umbraco member-login backend (reached via the /api/auth/* proxy — see
// server/api/auth/[...].ts) owns the OTP flow and the HttpOnly session cookie.
// This composable drives that flow and mirrors the backend's login state into a
// shared useState, restored on load by plugins/auth.client.ts via the profile
// endpoint. There is no token and no localStorage — login state is whatever
// GET /api/auth/profile says (200 = the returned member, 401 = logged out).
export function useAuth() {
  const user = useState<AuthUser | null>('auth:user', () => null)
  const loggedIn = computed(() => !!user.value)

  async function fetchProfile() {
    // On the server, forward the incoming request's cookies to the internal
    // proxy (so SSR knows the login state and matches the client — no hydration
    // mismatch); on the client, a plain credentialed $fetch.
    const request = import.meta.server ? useRequestFetch() : $fetch
    try {
      user.value = await request<AuthUser>('/api/auth/profile')
    } catch {
      user.value = null // 401 (or unreachable) = not logged in
    }
    return user.value
  }

  async function requestOtp(phone: number, callingCode: number) {
    await $fetch('/api/auth/request-otp', { method: 'POST', body: { phone, callingCode } })
  }

  async function verifyOtp(phone: number, callingCode: number, code: string) {
    await $fetch('/api/auth/verify-otp', { method: 'POST', body: { phone, callingCode, code } })
    // The backend has set the session cookie; hydrate our state from profile.
    return fetchProfile()
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, loggedIn, fetchProfile, requestOtp, verifyOtp, logout }
}
