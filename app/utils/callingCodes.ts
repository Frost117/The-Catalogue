export interface CallingCode {
  code: number
  name: string
  flag: string
}

// Curated shortlist for the login form's country-code selector — covers the
// app's locales (en/da/vi) plus other common European codes. `name` is carried
// so the searchable select can match on the country name, not just the dial code.
export const CALLING_CODES: CallingCode[] = [
  { code: 45, name: 'Denmark', flag: '🇩🇰' },
  { code: 1, name: 'United States', flag: '🇺🇸' },
  { code: 44, name: 'United Kingdom', flag: '🇬🇧' },
  { code: 84, name: 'Vietnam', flag: '🇻🇳' },
  { code: 49, name: 'Germany', flag: '🇩🇪' },
  { code: 33, name: 'France', flag: '🇫🇷' },
  { code: 46, name: 'Sweden', flag: '🇸🇪' },
  { code: 47, name: 'Norway', flag: '🇳🇴' }
]

export const DEFAULT_CALLING_CODE = 45
