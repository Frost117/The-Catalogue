// Shared by both signup and login — Twilio Verify doesn't care about
// new-vs-existing, and this route never looks anything up in `users`, so
// phone-number enumeration ("does this number have an account?") isn't
// possible through it by construction.

interface Body {
  phone: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (!body?.phone) {
    throw createError({ statusCode: 400, statusMessage: 'Phone number is required.' })
  }

  const phone = normalizePhoneOrThrow(body.phone)
  await sendOtp(phone)

  return { ok: true }
})
