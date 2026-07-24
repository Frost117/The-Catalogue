import { DEFAULT_CALLING_CODE } from '~/utils/callingCodes'

// Login-only OTP form: collect phone + calling code, request a code, then verify
// it. First successful verification auto-provisions the account server-side, so
// there is no separate signup mode.
export function useAuthForm(onSuccess: () => void) {
  const { t } = useI18n()
  const toast = useToast()
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

  async function submitCodeStep() {
    loading.value = true
    errorMessage.value = null
    try {
      await verifyOtp(Number(phone.value), callingCode.value, code.value)
      // The modal closes on success, so confirm the login with a toast — the
      // header button swap alone is too subtle to notice.
      toast.add({ title: t('auth.loggedIn'), color: 'success', icon: 'i-lucide-check' })
      onSuccess()
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      errorMessage.value = statusCode === 401 ? t('auth.invalidCode') : t('auth.requestFailed')
    } finally {
      loading.value = false
    }
  }

  return {
    step,
    phone,
    callingCode,
    code,
    loading,
    errorMessage,
    submitPhoneStep,
    submitCodeStep
  }
}
