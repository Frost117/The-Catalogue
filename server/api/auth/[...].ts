// Proxy every /api/auth/* request to the Umbraco member-login backend
// (MEMBER_LOGIN_HOST), which owns the OTP flow and issues the HttpOnly session
// cookie. Running it through our own origin keeps the browser same-origin (no
// CORS, no cross-site cookie drops): the request cookie is forwarded upstream,
// and the backend's Set-Cookie has its Domain stripped so the browser stores it
// on our origin. Only /api/auth/* is proxied — /api/graphql stays local (it
// talks to Compose with a server-side token, not the member cookie).
export default defineEventHandler((event) => {
  const base = useRuntimeConfig().memberLoginHost
  if (!base) {
    throw createError({ statusCode: 500, statusMessage: 'MEMBER_LOGIN_HOST is not configured.' })
  }
  const target = base.replace(/\/$/, '') + event.path
  return proxyRequest(event, target, { cookieDomainRewrite: '' })
})
