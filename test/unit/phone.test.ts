import { describe, it, expect } from 'vitest'
import { normalizePhoneOrThrow, toE164 } from '../../server/utils/phone'

describe('normalizePhoneOrThrow', () => {
  it('normalizes valid international numbers to E.164', () => {
    expect(normalizePhoneOrThrow('+45 20 12 34 56')).toBe('+4520123456') // Danish mobile
    expect(normalizePhoneOrThrow('+1 (213) 373-4253')).toBe('+12133734253')
    expect(normalizePhoneOrThrow('+442071838750')).toBe('+442071838750')
  })

  it('throws a 400 for an invalid number', () => {
    expect(() => normalizePhoneOrThrow('12345')).toThrowError(
      expect.objectContaining({ statusCode: 400 })
    )
  })

  it('throws a 400 for empty / non-phone input', () => {
    expect(() => normalizePhoneOrThrow('')).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => normalizePhoneOrThrow('not a phone')).toThrowError(
      expect.objectContaining({ statusCode: 400 })
    )
  })
})

describe('toE164', () => {
  it('combines a numeric calling code + national number into E.164', () => {
    expect(toE164(45, 20123456)).toBe('+4520123456')
    expect(toE164(1, '2133734253')).toBe('+12133734253')
    expect(toE164(44, '20 7183 8750')).toBe('+442071838750') // strips spaces
  })

  it('drops a trunk-prefix leading zero the user typed', () => {
    expect(toE164(44, '020 7183 8750')).toBe('+442071838750')
  })

  it('throws a 400 when the combination is not a valid number', () => {
    expect(() => toE164(45, '')).toThrowError(expect.objectContaining({ statusCode: 400 }))
    expect(() => toE164(45, 123)).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})
