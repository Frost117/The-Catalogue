import { describe, it, expect, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useRecaptcha } from '~/composables/useRecaptcha'

mockNuxtImport('useRuntimeConfig', () => () => ({ app: { baseURL: '/' }, public: { recaptchaSiteKey: 'test-site-key' } }))

// Mocks are installed at module scope, not inside it(), because
// app/plugins/recaptcha.client.ts calls useRecaptcha().init() automatically
// when the Nuxt test environment boots the app — before an it() block would
// get to run. With a mocked (truthy) site key that plugin call is real, so if
// our fakes weren't already in place, it would create an actual <script> tag
// and cache module-level scriptPromise (see useRecaptcha.ts) as a real,
// rejecting promise — poisoning every later call in this file. Setting the
// fakes up here means the plugin's own init() is what performs the (fake)
// script load and widget render; the test then just exercises the
// already-warm singleton, which matches how it behaves in production.
//
// Only the script's own network load is faked, and only by its exact URL —
// letting document.createElement and the container div's real appendChild
// run untouched. An earlier version faked document.createElement('div') to
// return a bare {} for every div request, not just this composable's own
// widget container; when Vue's own Suspense-boundary mount (part of the same
// bootstrap) also created a div, it got handed that same bare object instead
// of a real element, and later failed with "parent.insertBefore is not a
// function" trying to update its children. A real, empty, harmlessly
// appended div has no such downside, so there's no need to intercept it.
const RECAPTCHA_SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit'
let capturedScript: HTMLScriptElement | null = null
const realHeadAppendChild = document.head.appendChild.bind(document.head)
vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
  const el = node as HTMLScriptElement
  if (el.tagName === 'SCRIPT' && el.src === RECAPTCHA_SCRIPT_SRC) {
    // Never actually connect it — happy-dom would attempt a real (and here,
    // blocked) network fetch for it. Simulate a successful load instead.
    capturedScript = el
    el.onload?.(new Event('load'))
    return node
  }
  return realHeadAppendChild(node)
})

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
    expect(capturedScript?.src).toBe(RECAPTCHA_SCRIPT_SRC)
    expect(grecaptchaMock.render).toHaveBeenCalledWith(expect.any(HTMLDivElement), expect.objectContaining({ sitekey: 'test-site-key', size: 'invisible' }))

    const { execute } = useRecaptcha()
    const token = await execute()

    expect(grecaptchaMock.render).toHaveBeenCalledTimes(1) // still just the plugin's one-time render
    expect(grecaptchaMock.reset).toHaveBeenCalledWith(1)
    expect(grecaptchaMock.execute).toHaveBeenCalledWith(1)
    expect(token).toBe('token-abc')
  })
})
