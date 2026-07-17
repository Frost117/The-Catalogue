// Header auth actions with user-visible feedback. Wraps useAuth().logout() with
// a `loggingOut` flag (so the header button can show a spinner while the
// request is in flight) and a success/error toast — otherwise a click has no
// visible effect until the button silently swaps back. Login-success feedback
// lives in useAuthForm, where the OTP verify actually resolves.
export function useAuthActions() {
  const { t } = useI18n()
  const toast = useToast()
  const { logout: signOut } = useAuth()

  const loggingOut = ref(false)

  async function logout() {
    if (loggingOut.value) {
      return
    }
    loggingOut.value = true
    try {
      await signOut()
      toast.add({ title: t('auth.loggedOut'), color: 'success', icon: 'i-lucide-check' })
    } catch {
      // useAuth().logout() leaves the session intact if the request fails, so the
      // button stays on "Log out" and the toast invites a retry.
      toast.add({ title: t('auth.logoutFailed'), color: 'error', icon: 'i-lucide-triangle-alert' })
    } finally {
      loggingOut.value = false
    }
  }

  return { loggingOut, logout }
}
