import { eq } from 'drizzle-orm'
import { users } from '../../database/schema'

// Step 2 of the login-only OTP flow. Twilio Verify confirms the code, then we
// upsert the local user by phone (first successful verification auto-provisions
// the account — there is no separate signup step) and open a session.

interface Body {
  phone: number | string
  callingCode: number
  code: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (body?.phone == null || body?.callingCode == null || !body?.code) {
    throw createError({ statusCode: 400, statusMessage: 'Phone, calling code and code are required.' })
  }

  const phone = toE164(body.callingCode, body.phone)

  const verified = await checkOtp(phone, body.code)
  if (!verified) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or expired code.' })
  }

  const db = useDb(event)
  const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1)

  let id: string
  let umbracoMemberId: string | null
  if (existing) {
    id = existing.id
    umbracoMemberId = existing.umbracoMemberId
  } else {
    // First login: create the local user immediately (the user already proved
    // phone ownership via OTP), then best-effort mirror to Umbraco Members — a
    // failure there leaves umbracoMemberId null rather than blocking login.
    // There's no display name in this flow, so the phone doubles as the username.
    id = crypto.randomUUID()
    umbracoMemberId = null
    await db.insert(users).values({ id, phone, displayName: phone })
    try {
      const member = await createMember({ phone, displayName: phone })
      await db.update(users).set({ umbracoMemberId: member.id }).where(eq(users.id, id))
      umbracoMemberId = member.id
    } catch (err) {
      console.error('createMember failed during first login; continuing with umbracoMemberId=null', err)
    }
  }

  const user = { id, key: umbracoMemberId ?? id, username: phone }
  await setUserSession(event, { user })

  return user
})
