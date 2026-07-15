// Session-restore endpoint. The client relies on nuxt-auth-utils' own SSR-driven
// session for reactive state, but this endpoint exposes the documented contract:
// 200 { id, key, username } when authenticated, 401 otherwise.
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
  }
  return session.user
})
