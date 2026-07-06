import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

interface Body {
  phone: string
  code: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.phone || !body?.code) {
    throw createError({ statusCode: 400, statusMessage: 'Phone and code are required.' })
  }

  const phone = normalizePhoneOrThrow(body.phone)

  const verified = await checkOtp(phone, body.code)
  if (!verified) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired code.' })
  }

  const db = useDb(event)
  const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'No account for this phone number — please sign up.' })
  }

  await setUserSession(event, { user: { id: user.id, phone: user.phone, displayName: user.displayName } })

  return { id: user.id, phone: user.phone, displayName: user.displayName }
})
