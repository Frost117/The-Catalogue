import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useAuthForm } from '~/composables/useAuthForm'
import { DEFAULT_CALLING_CODE } from '~/utils/callingCodes'

const auth = vi.hoisted(() => ({
  requestOtp: vi.fn(),
  verifyOtp: vi.fn()
}))
const toast = vi.hoisted(() => ({ add: vi.fn() }))

mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))
mockNuxtImport('useAuth', () => () => ({ ...auth, logout: vi.fn(), user: null, loggedIn: false }))
// useAuthForm() is called directly here, not via mountSuspended, so there's no
// active component instance for the real useToast()'s inject() call to find —
// it still works (a default keeps it functional) but warns every time. Same
// mock pattern as useAuthActions.test.ts avoids that.
mockNuxtImport('useToast', () => () => toast)

beforeEach(() => {
  auth.requestOtp.mockReset()
  auth.verifyOtp.mockReset()
  toast.add.mockReset()
})

describe('useAuthForm — phone step', () => {
  it('starts on the phone step with the default calling code', () => {
    const f = useAuthForm(() => {})
    expect(f.step.value).toBe('phone')
    expect(f.callingCode.value).toBe(DEFAULT_CALLING_CODE)
  })

  it('requests an OTP with numeric phone + calling code and advances', async () => {
    auth.requestOtp.mockResolvedValueOnce(undefined)
    const f = useAuthForm(() => {})
    f.phone.value = '20123456'
    f.callingCode.value = 45
    await f.submitPhoneStep()

    expect(auth.requestOtp).toHaveBeenCalledWith(20123456, 45)
    expect(f.step.value).toBe('code')
    expect(f.errorMessage.value).toBeNull()
    expect(f.loading.value).toBe(false)
  })

  it('shows invalidPhone on a 400 and stays on the phone step', async () => {
    auth.requestOtp.mockRejectedValueOnce({ statusCode: 400 })
    const f = useAuthForm(() => {})
    await f.submitPhoneStep()

    expect(f.step.value).toBe('phone')
    expect(f.errorMessage.value).toBe('auth.invalidPhone')
  })

  it('shows requestFailed on a non-400 error', async () => {
    auth.requestOtp.mockRejectedValueOnce(new Error('network'))
    const f = useAuthForm(() => {})
    await f.submitPhoneStep()

    expect(f.step.value).toBe('phone')
    expect(f.errorMessage.value).toBe('auth.requestFailed')
  })
})

describe('useAuthForm — code step', () => {
  it('verifies the code and calls onSuccess', async () => {
    auth.verifyOtp.mockResolvedValueOnce({ id: 'u1', key: 'u1', username: '+4520123456' })
    const onSuccess = vi.fn()
    const f = useAuthForm(onSuccess)
    f.phone.value = '20123456'
    f.callingCode.value = 45
    f.code.value = '123456'
    await f.submitCodeStep()

    expect(auth.verifyOtp).toHaveBeenCalledWith(20123456, 45, '123456')
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(f.errorMessage.value).toBeNull()
  })

  it('maps a 401 to invalidCode without calling onSuccess', async () => {
    auth.verifyOtp.mockRejectedValueOnce({ statusCode: 401 })
    const onSuccess = vi.fn()
    const f = useAuthForm(onSuccess)
    await f.submitCodeStep()

    expect(f.errorMessage.value).toBe('auth.invalidCode')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(f.loading.value).toBe(false)
  })

  it('maps a non-401 error to requestFailed', async () => {
    auth.verifyOtp.mockRejectedValueOnce(new Error('network'))
    const f = useAuthForm(() => {})
    await f.submitCodeStep()

    expect(f.errorMessage.value).toBe('auth.requestFailed')
  })
})
