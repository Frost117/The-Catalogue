// Step 1 of the login-only OTP flow. Takes the phone + calling code as separate
// numeric fields, sends an SMS code via Twilio Verify, and never looks anything
// up in `users` — so phone-number enumeration ("does this number have an
// account?") isn't possible through this route by construction.

interface Body {
  phone: number | string
  callingCode: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  if (body?.phone == null || body?.callingCode == null) {
    throw createError({ statusCode: 400, statusMessage: 'Phone and calling code are required.' })
  }

  const phone = toE164(body.callingCode, body.phone)
  await sendOtp(phone)

  return { ok: true }
})
