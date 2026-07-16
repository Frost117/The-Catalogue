// Proxy for posting a comment. The write target — /api/showcomment on the
// Umbraco backend (MEMBER_LOGIN_HOST) — is the same host that owns the member
// session cookie, so routing through our origin lets the browser's same-origin
// request cookie be forwarded upstream to authenticate the member (mirrors
// server/api/auth/[...].ts). The client POSTs { showId, text }; the body passes
// through untouched. Reads (the comment list) go elsewhere via Compose GraphQL
// once that schema lands — this route is write-only.
export default defineEventHandler((event) => {
  const base = useRuntimeConfig().memberLoginHost
  if (!base) {
    throw createError({ statusCode: 500, statusMessage: 'MEMBER_LOGIN_HOST is not configured.' })
  }
  const target = base.replace(/\/$/, '') + '/api/showcomment'
  return proxyRequest(event, target, { cookieDomainRewrite: '' })
})
