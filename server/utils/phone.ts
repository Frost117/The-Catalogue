import { parsePhoneNumberFromString } from 'libphonenumber-js'

// Every route that accepts a phone number calls this first, so the value
// used as the DB unique key and the sole login identifier is always
// canonical E.164 — never raw user input with inconsistent formatting.
export function normalizePhoneOrThrow(raw: string): string {
  const parsed = parsePhoneNumberFromString(raw)
  if (!parsed || !parsed.isValid()) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid phone number.' })
  }
  return parsed.number
}

// The client sends the calling code and the national number as separate numeric
// fields (per the auth contract). Combine them into an international string and
// run it through the same validate-or-throw path, so the rest of the app still
// only ever sees canonical E.164. Any trunk-prefix leading zero the user typed on
// the national part is dropped (E.164 national significant numbers omit it).
export function toE164(callingCode: number, national: number | string): string {
  const digits = String(national).replace(/\D/g, '').replace(/^0+/, '')
  return normalizePhoneOrThrow(`+${callingCode}${digits}`)
}
