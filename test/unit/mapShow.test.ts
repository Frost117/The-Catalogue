import { describe, it, expect } from 'vitest'
import {
  resolveLocalized,
  showNumericId,
  showSlug,
  showIdFromSlug,
  mapShowSummary,
  mapCast,
  mapEpisode,
  mapShowDetail,
  mapComment
} from '../../app/utils/mapShow'
import type { RawShow, RawEpisode, RawCast, RawComment, RawLocalizedText } from '../../app/types/compose'

describe('resolveLocalized', () => {
  const text: RawLocalizedText = { en: 'English', da: 'Dansk', vi: 'Tiếng Việt' }

  it('returns null text/lang when the field is absent', () => {
    expect(resolveLocalized(null, 'en')).toEqual({ text: null, lang: null })
    expect(resolveLocalized(undefined, 'da')).toEqual({ text: null, lang: null })
  })

  it('serves the requested locale when present', () => {
    expect(resolveLocalized(text, 'da')).toEqual({ text: 'Dansk', lang: 'da' })
    expect(resolveLocalized(text, 'vi')).toEqual({ text: 'Tiếng Việt', lang: 'vi' })
  })

  it('falls back through en -> da -> vi order, reporting the serving language', () => {
    expect(resolveLocalized({ en: null, da: 'Dansk', vi: 'V' }, 'en')).toEqual({ text: 'Dansk', lang: 'da' })
    // requested vi missing -> fallback list is [en, da] (vi filtered out) -> en wins
    expect(resolveLocalized({ en: 'E', da: 'D', vi: null }, 'vi')).toEqual({ text: 'E', lang: 'en' })
    // requested en missing, da missing -> vi
    expect(resolveLocalized({ en: null, da: null, vi: 'V' }, 'en')).toEqual({ text: 'V', lang: 'vi' })
  })

  it('returns null when no language has text', () => {
    expect(resolveLocalized({ en: null, da: null, vi: null }, 'en')).toEqual({ text: null, lang: null })
  })
})

describe('showNumericId', () => {
  it('extracts the numeric id from a namespaced show key', () => {
    expect(showNumericId('show-1')).toBe(1)
    expect(showNumericId('show-4021')).toBe(4021)
  })

  it('returns null for non-show or malformed keys', () => {
    expect(showNumericId('episode-1')).toBeNull()
    expect(showNumericId('show-')).toBeNull()
    expect(showNumericId('show-1a')).toBeNull()
  })
})

describe('showSlug <-> showIdFromSlug round-trip', () => {
  it('builds a readable slug with a trailing numeric id', () => {
    expect(showSlug('show-1', 'Under the Dome')).toBe('under-the-dome-1')
    expect(showSlug('show-42', 'C.S.I.: Miami!')).toBe('c-s-i-miami-42')
  })

  it('falls back to "show" when the name is empty', () => {
    expect(showSlug('show-7', '')).toBe('show-7')
    expect(showSlug('show-7', null)).toBe('show-7')
  })

  it('omits the id when the node key is not a show key', () => {
    expect(showSlug('bogus', 'Some Name')).toBe('some-name')
  })

  it('recovers the id from a slug (inverse of showSlug)', () => {
    expect(showIdFromSlug('under-the-dome-1')).toBe(1)
    expect(showIdFromSlug('c-s-i-miami-42')).toBe(42)
    expect(showIdFromSlug('123')).toBe(123)
  })

  it('returns null when a slug has no trailing id', () => {
    expect(showIdFromSlug('under-the-dome')).toBeNull()
  })

  it('round-trips id -> slug -> id', () => {
    const id = showIdFromSlug(showSlug('show-99', 'The Wire'))
    expect(id).toBe(99)
  })
})

describe('mapShowSummary', () => {
  const raw: RawShow = {
    id: 'show-1',
    name: { en: 'Under the Dome', da: null, vi: null },
    genres: ['Drama', null, 'Sci-Fi'],
    status: 'Ended',
    premiered: '2013-06-24',
    network: { name: 'CBS' },
    image: { medium: 'med.jpg', original: 'orig.jpg' },
    rating: { average: 6.5 },
    summary: { en: '<p>Summary</p>', da: null, vi: null }
  }

  it('maps a raw show to the domain summary shape', () => {
    expect(mapShowSummary(raw, 'en')).toEqual({
      id: 'show-1',
      slug: 'under-the-dome-1',
      title: 'Under the Dome',
      summary: '<p>Summary</p>',
      image: 'med.jpg',
      rating: 6.5,
      genres: ['Drama', 'Sci-Fi'] // nulls filtered out
    })
  })

  it('falls back through locales for a localized title, same as summary', () => {
    const r = { ...raw, name: { en: null, da: 'Under Kuplen', vi: null } }
    const mapped = mapShowSummary(r, 'en')
    expect(mapped.title).toBe('Under Kuplen')
    expect(mapped.slug).toBe('under-kuplen-1')
  })

  it('falls back to original image and coerces string ratings', () => {
    const r = { ...raw, image: { medium: null, original: 'orig.jpg' }, rating: { average: '7.2' as unknown as number } }
    const mapped = mapShowSummary(r, 'en')
    expect(mapped.image).toBe('orig.jpg')
    expect(mapped.rating).toBe(7.2)
  })

  it('defaults missing title/genres and yields null rating', () => {
    const r: RawShow = { ...raw, name: null, genres: null, image: null, rating: null }
    const mapped = mapShowSummary(r, 'en')
    expect(mapped.title).toBe('')
    expect(mapped.genres).toEqual([])
    expect(mapped.image).toBeNull()
    expect(mapped.rating).toBeNull()
  })
})

describe('mapCast / mapEpisode / mapShowDetail', () => {
  it('maps cast with nested fallbacks', () => {
    const raw: RawCast = {
      id: 'cast-1-2',
      person: { name: 'Actor', image: { medium: 'a.jpg', original: null } },
      character: { name: 'Hero', image: null }
    }
    expect(mapCast(raw)).toEqual({ id: 'cast-1-2', name: 'Actor', character: 'Hero', image: 'a.jpg' })
  })

  it('defaults missing cast fields', () => {
    expect(mapCast({ id: 'cast-x', person: null, character: null })).toEqual({
      id: 'cast-x',
      name: '',
      character: null,
      image: null
    })
  })

  it('coerces episode season/number decimals and defaults them to 0', () => {
    const raw: RawEpisode = { id: 'episode-1', name: { en: 'Pilot', da: null, vi: null }, season: '1' as unknown as number, number: null, summary: null }
    expect(mapEpisode(raw, 'en')).toEqual({ id: 'episode-1', season: 1, number: 0, name: 'Pilot', summary: null })
  })

  it('falls back through locales for a localized episode name, same as show title', () => {
    const raw: RawEpisode = { id: 'episode-1', name: { en: null, da: 'Piloten', vi: null }, season: 1, number: 1, summary: null }
    expect(mapEpisode(raw, 'en').name).toBe('Piloten')
  })

  it('composes summary + cast + episodes into a detail', () => {
    const show: RawShow = {
      id: 'show-5', name: { en: 'X', da: null, vi: null }, genres: [], status: 'Running', premiered: '2020-01-01',
      network: { name: 'HBO' }, image: null, rating: null, summary: null
    }
    const detail = mapShowDetail(
      show,
      [{ id: 'episode-1', name: { en: 'E1', da: null, vi: null }, season: 1, number: 1, summary: null }],
      [{ id: 'cast-1-1', person: { name: 'A', image: null }, character: { name: 'C', image: null } }],
      'en'
    )
    expect(detail.status).toBe('Running')
    expect(detail.network).toBe('HBO')
    expect(detail.premiered).toBe('2020-01-01')
    expect(detail.episodes).toHaveLength(1)
    expect(detail.cast).toHaveLength(1)
    expect(detail.slug).toBe('x-5')
  })
})

describe('mapComment', () => {
  const raw: RawComment = {
    id: 'c1',
    createdAt: '2026-07-15T10:08:20.000Z',
    memberName: '+84971026949',
    showId: 1,
    text: 'Test comment ne'
  }

  it('maps a raw comment to the domain shape', () => {
    expect(mapComment(raw)).toEqual({
      id: 'c1',
      showId: 1,
      author: '+84971026949',
      body: 'Test comment ne',
      createdAt: '2026-07-15T10:08:20.000Z'
    })
  })

  it('coerces a decimal-string showId', () => {
    expect(mapComment({ ...raw, showId: '5' as unknown as number }).showId).toBe(5)
  })

  it('defaults missing author/body/createdAt', () => {
    const mapped = mapComment({ ...raw, memberName: null, text: null, createdAt: null })
    expect(mapped.author).toBe('')
    expect(mapped.body).toBe('')
    expect(mapped.createdAt).toBe('')
  })
})
