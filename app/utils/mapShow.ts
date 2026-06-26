import type { RawShow, RawEpisode } from '~/types/compose'
import type { CastMember, Episode, Show, ShowSummary } from '~/types/show'

// Compose exposes the slug only as part of the route path, e.g. "/bitten/".
// Strip the surrounding slashes to get the slug used in app URLs.
export function slugFromPath(path?: string | null): string {
  return (path ?? '').replace(/^\/+|\/+$/g, '')
}

export function mapShowSummary(raw: RawShow): ShowSummary {
  const p = raw.properties
  return {
    id: raw.id,
    slug: slugFromPath(raw.route?.path),
    title: raw.name ?? '',
    summary: p?.summary?.markup ?? null,
    image: p?.image ?? null,
    rating: p?.rating ?? null,
    genres: (p?.genres ?? []).filter((g): g is string => !!g)
  }
}

export function mapCast(raw: RawShow): CastMember[] {
  const items = raw.properties?.cast?.items ?? []
  return items
    .map(item => item?.content)
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map(c => ({
      id: c.id,
      name: c.properties?.personName ?? '',
      character: c.properties?.characterName ?? null,
      image: c.properties?.personImage ?? null
    }))
}

export function mapEpisode(raw: RawEpisode): Episode {
  const p = raw.properties
  return {
    id: raw.id,
    season: p?.season ?? 0,
    number: p?.episodeNumber ?? 0,
    name: raw.name ?? '',
    summary: p?.summary?.markup ?? null
  }
}

export function mapShowDetail(raw: RawShow, episodes: RawEpisode[]): Show {
  const p = raw.properties
  return {
    ...mapShowSummary(raw),
    status: p?.status ?? null,
    network: p?.network ?? null,
    premiered: p?.premiered ?? null,
    cast: mapCast(raw),
    episodes: episodes.map(mapEpisode)
  }
}
