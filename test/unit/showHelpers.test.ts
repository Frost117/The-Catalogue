import { describe, it, expect } from 'vitest'
import { stripHtml, formatRating, formatYear, groupEpisodesBySeason } from '../../app/utils/showHelpers'
import type { Episode } from '../../app/types/show'

describe('stripHtml', () => {
  it('returns empty string for nullish input', () => {
    expect(stripHtml()).toBe('')
    expect(stripHtml(null)).toBe('')
    expect(stripHtml('')).toBe('')
  })

  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello')
    expect(stripHtml('<p>Under\n the   <b>Dome</b></p>')).toBe('Under the Dome')
  })

  it('trims surrounding whitespace left by removed tags', () => {
    expect(stripHtml('  <p> spaced </p> ')).toBe('spaced')
  })
})

describe('formatRating', () => {
  it('returns null when absent', () => {
    expect(formatRating()).toBeNull()
    expect(formatRating(null)).toBeNull()
  })

  it('formats to one decimal place, including zero', () => {
    expect(formatRating(8)).toBe('8.0')
    expect(formatRating(7.25)).toBe('7.3') // toFixed rounds
    expect(formatRating(0)).toBe('0.0')
  })
})

describe('formatYear', () => {
  it('extracts the leading 4-digit year from an ISO date', () => {
    expect(formatYear('2014-01-11T00:00:00')).toBe('2014')
    expect(formatYear('1999-12-31')).toBe('1999')
  })

  it('returns null for absent or malformed input', () => {
    expect(formatYear()).toBeNull()
    expect(formatYear(null)).toBeNull()
    expect(formatYear('not-a-date')).toBeNull()
    expect(formatYear('14-01-2020')).toBeNull() // year not at the start
  })
})

describe('groupEpisodesBySeason', () => {
  const ep = (season: number, number: number): Episode => ({
    id: `s${season}e${number}`,
    season,
    number,
    name: `S${season}E${number}`
  })

  it('groups into seasons sorted ascending, episodes sorted ascending within each', () => {
    const input = [ep(2, 2), ep(1, 3), ep(2, 1), ep(1, 1)]
    const result = groupEpisodesBySeason(input)

    expect(result.map(g => g.season)).toEqual([1, 2])
    expect(result[0]!.episodes.map(e => e.number)).toEqual([1, 3])
    expect(result[1]!.episodes.map(e => e.number)).toEqual([1, 2])
  })

  it('returns an empty array for no episodes', () => {
    expect(groupEpisodesBySeason([])).toEqual([])
  })
})
