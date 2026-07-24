import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useAuthActions } from '~/composables/useAuthActions'

// A promise whose resolve is exposed, so a test can hold logout() mid-flight.
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const auth = vi.hoisted(() => ({ logout: vi.fn() }))
const toast = vi.hoisted(() => ({ add: vi.fn() }))

mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))
mockNuxtImport('useAuth', () => () => auth)
mockNuxtImport('useToast', () => () => toast)

beforeEach(() => {
  auth.logout.mockReset()
  toast.add.mockReset()
})

describe('useAuthActions — logout feedback', () => {
  it('toggles loggingOut around the request and confirms with a success toast', async () => {
    const pending = deferred()
    auth.logout.mockReturnValueOnce(pending.promise)

    const { loggingOut, logout } = useAuthActions()
    expect(loggingOut.value).toBe(false)

    const done = logout()
    expect(loggingOut.value).toBe(true) // spinner shows while the request is in flight

    pending.resolve()
    await done

    expect(loggingOut.value).toBe(false)
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: 'auth.loggedOut', color: 'success' }))
  })

  it('shows an error toast and clears loggingOut when logout fails', async () => {
    auth.logout.mockRejectedValueOnce(new Error('network'))

    const { loggingOut, logout } = useAuthActions()
    await logout()

    expect(loggingOut.value).toBe(false)
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ title: 'auth.logoutFailed', color: 'error' }))
  })

  it('ignores re-entrant clicks while a logout is already in flight', async () => {
    const pending = deferred()
    auth.logout.mockReturnValueOnce(pending.promise)

    const { logout } = useAuthActions()
    const first = logout()
    await logout() // second click while the first is pending — no-op

    pending.resolve()
    await first

    expect(auth.logout).toHaveBeenCalledOnce()
  })
})
