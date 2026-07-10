export function useAuthForm(onSuccess: () => void) {
  const { t } = useI18n()
  const { sendOtp, signup, login } = useAuth()

  const mode = ref<'login' | 'signup'>('login')
  const step = ref<'phone' | 'code'>('phone')
  const phone = ref('')
  const displayName = ref('')
  const code = ref('')
  const loading = ref(false)
  const errorMessage = ref<string | null>(null)

  function toggleMode() {
    mode.value = mode.value === 'login' ? 'signup' : 'login'
    errorMessage.value = null
  }

  async function submitPhoneStep() {
    loading.value = true
    errorMessage.value = null
    try {
      await sendOtp(phone.value)
      step.value = 'code'
    } catch {
      errorMessage.value = t('auth.invalidPhone')
    } finally {
      loading.value = false
    }
  }

  async function submitCodeStep() {
    loading.value = true
    errorMessage.value = null
    try {
      if (mode.value === 'signup') {
        await signup(phone.value, displayName.value, code.value)
      } else {
        await login(phone.value, code.value)
      }
      onSuccess()
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      if (statusCode === 409) {
        errorMessage.value = t('auth.phoneAlreadyRegistered')
      } else if (statusCode === 404) {
        errorMessage.value = t('auth.noAccount')
      } else {
        errorMessage.value = t('auth.invalidCode')
      }
    } finally {
      loading.value = false
    }
  }

  return {
    mode,
    step,
    phone,
    displayName,
    code,
    loading,
    errorMessage,
    toggleMode,
    submitPhoneStep,
    submitCodeStep
  }
}
