import { describe, it, expect, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRecaptcha } from '~/composables/useRecaptcha'

mockNuxtImport('useRuntimeConfig', () => () => ({ app: { baseURL: '/' }, public: { recaptchaSiteKey: 'test-site-key' } }))

// Mocks are installed at module scope, not inside it(), because
// app/plugins/recaptcha.client.ts calls useRecaptcha().init() automatically
// when the Nuxt test environment boots the app — before an it() block would
// get to run. With a mocked (truthy) site key that plugin call is real, so if
// our DOM/grecaptcha fakes weren't already in place, it would create an actual
// <script> tag and cache module-level scriptPromise (see useRecaptcha.ts) as a
// real, rejecting promise — poisoning every later call in this file. Setting
// the fakes up here means the plugin's own init() is what performs the
// (fake) script load and widget render; the test then just exercises the
// already-warm singleton, which matches how it behaves in production.
const scriptEl = { src: '', async: false, defer: false, onload: null as (() => void) | null, onerror: null as (() => void) | null }
const container = {} as HTMLElement
const realCreateElement = document.createElement.bind(document)
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'script') {
    return scriptEl as unknown as HTMLScriptElement
  }
  if (tagName === 'div') {
    return container
  }
  return realCreateElement(tagName)
})
vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
  // Simulate the real Google script loading and defining window.grecaptcha.
  scriptEl.onload?.()
  return node
})
vi.spyOn(document.body, 'appendChild').mockImplementation(node => node)

let renderParams: Record<string, unknown> = {}
const grecaptchaMock = {
  ready: (cb: () => void) => cb(),
  render: vi.fn((_container: HTMLElement, params: Record<string, unknown>) => {
    renderParams = params
    return 1
  }),
  reset: vi.fn(),
  // The real widget calls the render()-configured callback asynchronously
  // once solved; firing it synchronously here is equivalent for this test.
  execute: vi.fn(() => (renderParams.callback as (token: string) => void)('token-abc'))
}
window.grecaptcha = grecaptchaMock

describe('useRecaptcha', () => {
  it('renders the invisible widget once (via the plugin) and execute() resolves via the widget callback', async () => {
    expect(scriptEl.src).toBe('https://www.google.com/recaptcha/api.js?render=explicit')
    expect(grecaptchaMock.render).toHaveBeenCalledWith(container, expect.objectContaining({ sitekey: 'test-site-key', size: 'invisible' }))

    const { execute } = useRecaptcha()
    const token = await execute()

    expect(grecaptchaMock.render).toHaveBeenCalledTimes(1) // still just the plugin's one-time render
    expect(grecaptchaMock.reset).toHaveBeenCalledWith(1)
    expect(grecaptchaMock.execute).toHaveBeenCalledWith(1)
    expect(token).toBe('token-abc')
  })
})
