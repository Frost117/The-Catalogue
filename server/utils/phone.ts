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
