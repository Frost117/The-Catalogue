export interface CallingCode {
  code: number
  label: string
}

// Curated shortlist for the login form's country-code selector — covers the
// app's locales (en/da/vi) plus other common European codes. The value stored is
// the numeric calling code, matching the auth contract.
export const CALLING_CODES: CallingCode[] = [
  { code: 45, label: '🇩🇰 +45' },
  { code: 1, label: '🇺🇸 +1' },
  { code: 44, label: '🇬🇧 +44' },
  { code: 84, label: '🇻🇳 +84' },
  { code: 49, label: '🇩🇪 +49' },
  { code: 33, label: '🇫🇷 +33' },
  { code: 46, label: '🇸🇪 +46' },
  { code: 47, label: '🇳🇴 +47' }
]

export const DEFAULT_CALLING_CODE = 45
