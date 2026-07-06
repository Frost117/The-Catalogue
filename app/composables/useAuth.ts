import type { AuthUser } from '~/types/user'

// Thin wrapper around nuxt-auth-utils' useUserSession(), adding the app's
// own auth verbs so components never call $fetch directly for auth — same
// convention as the show-data composables owning all data access.
export function useAuth() {
  const { user, loggedIn, fetch: refreshSession, clear } = useUserSession()

  async function sendOtp(phone: string) {
    await $fetch('/api/auth/send-otp', { method: 'POST', body: { phone } })
  }

  async function signup(phone: string, displayName: string, code: string) {
    const result = await $fetch<AuthUser>('/api/auth/signup', {
      method: 'POST',
      body: { phone, displayName, code }
    })
    await refreshSession()
    return result
  }

  async function login(phone: string, code: string) {
    const result = await $fetch<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: { phone, code }
    })
    await refreshSession()
    return result
  }

  return { user, loggedIn, sendOtp, signup, login, logout: clear }
}
