import showQuery from '~/graphql/show.gql?raw'
import episodesQuery from '~/graphql/episodes.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapShowDetail, slugFromPath } from '~/utils/mapShow'
import { BASELINE_VARIANT } from '~/utils/contentVariant'
import type { Show } from '~/types/show'
import type { RawNodeConnection, RawShow, RawEpisode } from '~/types/compose'

// Guard against runaway paging; 10 × 100 = 1000 episodes is far beyond any
// real show.
const MAX_EPISODE_PAGES = 10

export interface ShowDetailResult {
  show: Show
  // The variant actually served — differs from the requested locale when the
  // fallback chain kicked in (used to show a "not translated" hint).
  servedVariant: string
}

async function fetchShow(variant: string, slug: string): Promise<RawShow | null> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(showQuery, {
    where: { show: { variant, route: { path: `/${slug}/` } } }
  })
  return (res.tvshow_collection.items ?? []).find((s): s is RawShow => !!s) ?? null
}

async function fetchEpisodes(variant: string, showPath: string): Promise<RawEpisode[]> {
  const all: RawEpisode[] = []
  let after: string | null = null
  for (let i = 0; i < MAX_EPISODE_PAGES; i++) {
    const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawEpisode> }>(
      episodesQuery,
      { where: { episode: { variant, route: { path_starts_with: showPath } } }, after }
    )
    const conn: RawNodeConnection<RawEpisode> = res.tvshow_collection
    for (const ep of conn.items ?? []) {
      if (ep) {
        all.push(ep)
      }
    }
    if (!conn.pageInfo?.hasNextPage) {
      break
    }
    after = conn.pageInfo.endCursor
  }
  return all
}

// Single show detail by slug + locale. Applies the fallback chain (requested
// locale → baseline → empty) and fetches the show's episodes by route-path
// prefix in the same variant. Returns null when the show genuinely doesn't
// exist so the page can 404.
export function useShowQuery(slug: () => string, locale: () => string) {
  return useAsyncData<ShowDetailResult | null>(
    () => `show:${slug()}:${locale()}`,
    async () => {
      const wanted = locale()
      let variant = wanted
      let raw = await fetchShow(variant, slug())
      if (!raw && wanted !== BASELINE_VARIANT) {
        variant = BASELINE_VARIANT
        raw = await fetchShow(variant, slug())
      }
      if (!raw) {
        return null
      }
      const showPath = raw.route?.path ?? `/${slugFromPath(slug())}/`
      const episodes = await fetchEpisodes(variant, showPath)
      return { show: mapShowDetail(raw, episodes), servedVariant: variant }
    },
    { watch: [slug, locale] }
  )
}
