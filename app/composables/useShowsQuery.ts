import showsQuery from '~/graphql/shows.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapShowSummary, LOCALE_FALLBACK } from '~/utils/mapShow'
import type { ShowSummary } from '~/types/show'
import type { RawNodeConnection, RawShow } from '~/types/compose'

export const CATALOGUE_PAGE_SIZE = 24

export interface CatalogueFilters {
  // Selects which `name`/`summary` translation the mapper reads. NOT used by
  // buildWhere: search matches across every localized name field (see below),
  // independent of the displayed locale.
  locale: string
  search: string
  genre: string
}

interface CataloguePage {
  items: ShowSummary[]
  endCursor: string | null
  hasNextPage: boolean
}

// Translate filters into the Compose `where` input. Optional filters are only
// included when set, so we never send `name: { en_contains: null }` or
// `genres_some: [null]`.
//
// `name` is localized ({ en, da, vi }). Search matches against ALL localized
// name fields (an OR), not just the displayed locale's, so results mirror the
// mapper's display fallback (resolveLocalized falls back en->da->vi). Matching
// only `${locale}_contains` broke search in non-default languages: a show whose
// `name.da` is untranslated still displays its English title via fallback, but a
// `da_contains` filter never matched it — e.g. searching "dexter" in Danish
// returned nothing. `_contains` is case-insensitive. A sibling `genres_some` is
// ANDed with the name OR, so genre + search still narrows correctly.
export function buildWhere(filters: CatalogueFilters) {
  const show: Record<string, unknown> = {}
  if (filters.search) {
    show.OR = LOCALE_FALLBACK.map(lang => ({ name: { [`${lang}_contains`]: filters.search } }))
  }
  if (filters.genre) {
    show.genres_some = [filters.genre]
  }
  return { show }
}

async function fetchPage(filters: CatalogueFilters, after: string | null): Promise<CataloguePage> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(showsQuery, {
    where: buildWhere(filters),
    first: CATALOGUE_PAGE_SIZE,
    after
  })
  const conn = res.tvshow_collection
  return {
    items: (conn.items ?? [])
      .filter((s): s is RawShow => !!s)
      .map(s => mapShowSummary(s, filters.locale)),
    endCursor: conn.pageInfo?.endCursor ?? null,
    hasNextPage: conn.pageInfo?.hasNextPage ?? false
  }
}

// Paginated catalogue with a "load more" affordance. The first page is fetched
// via useAsyncData (so it renders during SSR and re-runs when the reactive
// search/genre/locale state changes); subsequent pages are appended on
// the client.
export function useShowsQuery(filters: () => CatalogueFilters) {
  const { data, status, error, refresh } = useAsyncData(
    'catalogue',
    () => fetchPage(filters(), null),
    { watch: [filters] }
  )

  // State for pages loaded after the first via "load more". `appended` is null
  // until the user loads more, and resets when the first page changes (filter or
  // locale change) so the grid never mixes filter sets. Everything else is
  // derived from `data` so it is correct during SSR (watchers run async and
  // would miss the server render).
  const appended = ref<{ items: ShowSummary[], cursor: string | null, hasNextPage: boolean } | null>(null)
  const loadingMore = ref(false)

  watch(data, () => {
    appended.value = null
  })

  const items = computed<ShowSummary[]>(() => [
    ...(data.value?.items ?? []),
    ...(appended.value?.items ?? [])
  ])
  const cursor = computed(() =>
    appended.value ? appended.value.cursor : (data.value?.endCursor ?? null)
  )
  const hasMore = computed(() =>
    appended.value ? appended.value.hasNextPage : (data.value?.hasNextPage ?? false)
  )

  async function loadMore() {
    if (!hasMore.value || loadingMore.value || !cursor.value) {
      return
    }
    loadingMore.value = true
    try {
      const page = await fetchPage(filters(), cursor.value)
      appended.value = {
        items: [...(appended.value?.items ?? []), ...page.items],
        cursor: page.endCursor,
        hasNextPage: page.hasNextPage
      }
    } finally {
      loadingMore.value = false
    }
  }

  return { items, hasMore, loadMore, loadingMore, status, error, refresh }
}
