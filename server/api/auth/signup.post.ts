import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

interface Body {
  phone: string
  displayName: string
  code: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.phone || !body?.displayName?.trim() || !body?.code) {
    throw createError({ statusCode: 400, statusMessage: 'Phone, display name and code are required.' })
  }

  const phone = normalizePhoneOrThrow(body.phone)
  const displayName = body.displayName.trim()

  const verified = await checkOtp(phone, body.code)
  if (!verified) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired code.' })
  }

  const db = useDb(event)
  const existing = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
  if (existing.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Phone already registered — log in instead.' })
  }

  // Insert the local user first and establish the session immediately: the
  // user already proved phone ownership via OTP, so signup must not block on
  // an unrelated downstream system. createMember() is best-effort — a
  // failure here leaves umbracoMemberId null rather than failing signup.
  const id = crypto.randomUUID()
  await db.insert(users).values({ id, phone, displayName })

  try {
    const member = await createMember({ phone, displayName })
    await db.update(users).set({ umbracoMemberId: member.id }).where(eq(users.id, id))
  } catch (err) {
    console.error('createMember failed during signup; continuing with umbracoMemberId=null', err)
  }

  await setUserSession(event, { user: { id, phone, displayName } })

  return { id, phone, displayName }
})
