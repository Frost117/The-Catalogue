import { describe, it, expect, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRecaptcha } from '~/composables/useRecaptcha'

mockNuxtImport('useRuntimeConfig', () => () => ({ app: { baseURL: '/' }, public: { recaptchaSiteKey: 'test-site-key' } }))

// One test covering both behaviors deliberately: the script-injection guard
// is module-level singleton state (by design — see useRecaptcha.ts), so
// splitting this into separate `it()` blocks would make the second test see
// the first test's already-resolved script promise and never re-invoke the
// freshly-mocked document.createElement, silently testing the wrong thing.
describe('useRecaptcha', () => {
  it('injects the script once (even across repeated calls) and execute() resolves the grecaptcha token', async () => {
    const scriptEl = { src: '', async: false, onload: null as (() => void) | null, onerror: null as (() => void) | null }
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(scriptEl as unknown as HTMLScriptElement)
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      // Simulate the real Google script loading and defining window.grecaptcha.
      window.grecaptcha = {
        ready: (cb: () => void) => cb(),
        execute: vi.fn().mockResolvedValue('token-abc')
      }
      scriptEl.onload?.()
      return node
    })

    useRecaptcha() // first call: injects the script
    const { execute } = useRecaptcha() // second call: must NOT inject again

    expect(createElementSpy).toHaveBeenCalledTimes(1)
    expect(scriptEl.src).toBe('https://www.google.com/recaptcha/api.js?render=test-site-key')

    const token = await execute('login')
    expect(token).toBe('token-abc')

    createElementSpy.mockRestore()
  })
})
