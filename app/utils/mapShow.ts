import type { RawShow, RawEpisode, RawCast, RawComment, RawLocalizedText } from '~/types/compose'
import type { CastMember, Comment, Episode, Show, ShowSummary } from '~/types/show'

// Coerce a GraphQL Decimal (which may arrive as number or string) to a number,
// or null when absent.
function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

// Summary is the only per-language field in this schema; when the requested
// locale has no text yet, fall through this order. `lang` reports which language
// actually served the text, so the detail page can surface a "not translated"
// hint.
const SUMMARY_FALLBACK = ['en', 'da', 'vi'] as const

export function resolveLocalized(
  text: RawLocalizedText | null | undefined,
  locale: string
): { text: string | null, lang: string | null } {
  if (!text) {
    return { text: null, lang: null }
  }
  const order = [locale, ...SUMMARY_FALLBACK.filter(l => l !== locale)]
  for (const lang of order) {
    const value = text[lang as keyof RawLocalizedText]
    if (value) {
      return { text: value, lang }
    }
  }
  return { text: null, lang: null }
}

// The document key is namespaced `show-{tvMazeId}`; the numeric id is both the
// stable route key and the `tvShowId` that links episodes/cast back to the show.
export function showNumericId(nodeId: string): number | null {
  const match = nodeId.match(/^show-(\d+)$/)
  return match ? Number(match[1]) : null
}

function slugify(name?: string | null): string {
  return (name ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// URL slug for a show: readable name plus the numeric id so the detail page can
// resolve it back with an exact id lookup (the schema has no server-side slug
// field). e.g. show-1 "Under the Dome" -> "under-the-dome-1".
export function showSlug(nodeId: string, name?: string | null): string {
  const id = showNumericId(nodeId)
  const base = slugify(name) || 'show'
  return id != null ? `${base}-${id}` : base
}

// Inverse of showSlug: pull the trailing numeric id out of a URL slug.
export function showIdFromSlug(slug: string): number | null {
  const match = slug.match(/-(\d+)$/) ?? slug.match(/^(\d+)$/)
  return match ? Number(match[1]) : null
}

export function mapShowSummary(raw: RawShow, locale: string): ShowSummary {
  return {
    id: raw.id,
    slug: showSlug(raw.id, raw.name),
    title: raw.name ?? '',
    summary: resolveLocalized(raw.summary, locale).text,
    image: raw.image?.medium ?? raw.image?.original ?? null,
    rating: toNum(raw.rating?.average),
    genres: (raw.genres ?? []).filter((g): g is string => !!g)
  }
}

export function mapCast(raw: RawCast): CastMember {
  return {
    id: raw.id,
    name: raw.person?.name ?? '',
    character: raw.character?.name ?? null,
    image: raw.person?.image?.medium ?? null
  }
}

export function mapComment(raw: RawComment): Comment {
  return {
    id: raw.id,
    showId: toNum(raw.showId) ?? 0,
    author: raw.memberName ?? '',
    body: raw.text ?? '',
    createdAt: raw.createdAt ?? ''
  }
}

export function mapEpisode(raw: RawEpisode, locale: string): Episode {
  return {
    id: raw.id,
    season: toNum(raw.season) ?? 0,
    number: toNum(raw.number) ?? 0,
    name: raw.name ?? '',
    summary: resolveLocalized(raw.summary, locale).text
  }
}

export function mapShowDetail(
  raw: RawShow,
  episodes: RawEpisode[],
  cast: RawCast[],
  locale: string
): Show {
  return {
    ...mapShowSummary(raw, locale),
    status: raw.status ?? null,
    network: raw.network?.name ?? null,
    premiered: raw.premiered ?? null,
    cast: cast.map(mapCast),
    episodes: episodes.map(ep => mapEpisode(ep, locale))
  }
}
