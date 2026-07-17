import { describe, it, expect, vi, beforeEach } from 'vitest'

// The comments proxy is a Nitro route: `defineEventHandler`, `useRuntimeConfig`,
// `getCookie` and `proxyRequest` are runtime auto-imports that don't exist under
// Vitest. Stub them as globals so we can import the handler and drive its auth
// decision directly. (`createError` is already stubbed in test/setup-globals.ts.)
const SESSION_COOKIE = '.AspNetCore.Identity.Application'

const proxyRequest = vi.fn(() => 'PROXIED')
let cookies: Record<string, string> = {}
const config = { memberLoginHost: 'https://backend.example', memberSessionCookie: SESSION_COOKIE }

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('useRuntimeConfig', () => config)
vi.stubGlobal('getCookie', (_event: unknown, name: string) => cookies[name])
vi.stubGlobal('proxyRequest', proxyRequest)

// Import after the globals exist (the module calls defineEventHandler at load).
const { default: handler } = await import('../../server/api/comments.post')
const invoke = () => (handler as (event: unknown) => unknown)({})

beforeEach(() => {
  proxyRequest.mockClear()
  cookies = {}
  config.memberLoginHost = 'https://backend.example'
  config.memberSessionCookie = SESSION_COOKIE
})

describe('comments proxy — server-side auth guard', () => {
  it('401s and never proxies when the session cookie is absent', () => {
    expect(() => invoke()).toThrow(expect.objectContaining({ statusCode: 401 }))
    expect(proxyRequest).not.toHaveBeenCalled()
  })

  it('ignores unrelated cookies (e.g. the i18n locale cookie)', () => {
    cookies['i18n_locale'] = 'en'
    expect(() => invoke()).toThrow(expect.objectContaining({ statusCode: 401 }))
    expect(proxyRequest).not.toHaveBeenCalled()
  })

  it('proxies to /api/showcomment once the session cookie is present', () => {
    cookies[SESSION_COOKIE] = 'opaque-session-value'
    expect(invoke()).toBe('PROXIED')
    expect(proxyRequest).toHaveBeenCalledWith({}, 'https://backend.example/api/showcomment', { cookieDomainRewrite: '' })
  })

  it('500s when the backend host is not configured (before any auth check)', () => {
    config.memberLoginHost = ''
    cookies[SESSION_COOKIE] = 'opaque-session-value'
    expect(() => invoke()).toThrow(expect.objectContaining({ statusCode: 500 }))
    expect(proxyRequest).not.toHaveBeenCalled()
  })
})
