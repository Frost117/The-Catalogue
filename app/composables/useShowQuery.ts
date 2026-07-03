import showQuery from '~/graphql/show.gql?raw'
import episodesQuery from '~/graphql/episodes.gql?raw'
import castQuery from '~/graphql/cast.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapShowDetail, resolveLocalized, showIdFromSlug } from '~/utils/mapShow'
import type { Show } from '~/types/show'
import type { RawNodeConnection, RawShow, RawEpisode, RawCast } from '~/types/compose'

// Guard against runaway paging; 10 × 100 = 1000 is far beyond any real show's
// episode or cast count.
const MAX_PAGES = 10

export interface ShowDetailResult {
  show: Show
  // The language the summary was actually served in — differs from the requested
  // locale when the fallback kicked in (used to show a "not translated" hint).
  summaryLang: string | null
}

async function fetchShow(tvShowId: number): Promise<RawShow | null> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(showQuery, {
    where: { show: { id: `show-${tvShowId}` } }
  })
  return (res.tvshow_collection.items ?? []).find((s): s is RawShow => !!s) ?? null
}

// Episodes and cast are sibling nodes linked to the show by the numeric
// `tvShowId`. Both are cursor-paginated, so page through until exhausted.
async function fetchLinked<T>(query: string, key: 'episode' | 'cast', tvShowId: number): Promise<T[]> {
  const all: T[] = []
  let after: string | null = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const res: { tvshow_collection: RawNodeConnection<T> } = await gqlRequest(query, {
      where: { [key]: { tvShowId } },
      after
    })
    const conn = res.tvshow_collection
    for (const node of conn.items ?? []) {
      if (node) {
        all.push(node)
      }
    }
    if (!conn.pageInfo?.hasNextPage) {
      break
    }
    after = conn.pageInfo.endCursor
  }
  return all
}

// Single show detail by slug + locale. The numeric id is parsed from the URL
// slug and matched with an exact id lookup; episodes and cast are fetched by
// `tvShowId`. Returns null when the show genuinely doesn't exist (or the slug
// carries no id) so the page can 404.
export function useShowQuery(slug: () => string, locale: () => string) {
  return useAsyncData<ShowDetailResult | null>(
    () => `show:${slug()}:${locale()}`,
    async () => {
      const tvShowId = showIdFromSlug(slug())
      if (tvShowId == null) {
        return null
      }
      const raw = await fetchShow(tvShowId)
      if (!raw) {
        return null
      }
      const [episodes, cast] = await Promise.all([
        fetchLinked<RawEpisode>(episodesQuery, 'episode', tvShowId),
        fetchLinked<RawCast>(castQuery, 'cast', tvShowId)
      ])
      return {
        show: mapShowDetail(raw, episodes, cast, locale()),
        summaryLang: resolveLocalized(raw.summary, locale()).lang
      }
    },
    { watch: [slug, locale] }
  )
}
