// Proxy for posting a comment. The write target — /api/showcomment on the
// Umbraco backend (MEMBER_LOGIN_HOST) — is the same host that owns the member
// session cookie, so routing through our origin lets the browser's same-origin
// request cookie be forwarded upstream to authenticate the member (mirrors
// server/api/auth/[...].ts). The client POSTs { showId, comment }; the body
// passes through untouched. Reads (the comment list) go elsewhere via Compose
// GraphQL once that schema lands — this route is write-only.
export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const base = config.memberLoginHost
  if (!base) {
    throw createError({ statusCode: 500, statusMessage: 'MEMBER_LOGIN_HOST is not configured.' })
  }
  // Front-line auth gate: only a logged-in member carries the session cookie, so
  // reject its absence with a 401 here instead of round-tripping a guaranteed
  // rejection to the backend. This is defense in depth, not the source of truth
  // — the backend still validates the cookie and derives the member from it; a
  // forged/expired cookie passes this check and is rejected upstream.
  if (!getCookie(event, config.memberSessionCookie)) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required to post a comment.' })
  }
  const target = base.replace(/\/$/, '') + '/api/showcomment'
  return proxyRequest(event, target, { cookieDomainRewrite: '' })
})
