import showsQuery from '~/graphql/shows.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapShowSummary } from '~/utils/mapShow'
import type { SortField, SortDirection } from '~/composables/useCatalogueFilters'
import type { ShowSummary } from '~/types/show'
import type { RawNodeConnection, RawShow } from '~/types/compose'

export const CATALOGUE_PAGE_SIZE = 24

export interface CatalogueFilters {
  // The locale doesn't filter the query (name/genres are shared across
  // languages); it only selects which `summary` translation the mapper reads.
  locale: string
  search: string
  genre: string
  sortBy: SortField
  sortDir: SortDirection
}

interface CataloguePage {
  items: ShowSummary[]
  endCursor: string | null
  hasNextPage: boolean
}

// Translate filters into the Compose `where` input. Optional filters are only
// included when set, so we never send `name_contains: null` or `genres_some:
// [null]`.
export function buildWhere(filters: CatalogueFilters) {
  const show: Record<string, unknown> = {}
  if (filters.search) {
    show.name_contains = filters.search
  }
  if (filters.genre) {
    show.genres_some = [filters.genre]
  }
  return { show }
}

// Translate sortBy/sortDir into the inline `orderBy` literal substituted into
// shows.gql (see the placeholder note there). title/release sort on plain
// scalar fields, matching the one other confirmed orderBy example in this
// schema (`season` in seasonCount.gql). The nested `rating: { average }`
// shape is the one part of this unconfirmed against the live schema.
export function buildOrderByLiteral(filters: CatalogueFilters): string {
  const dir: 'ASC' | 'DESC' = filters.sortDir === 'asc' ? 'ASC' : 'DESC'
  switch (filters.sortBy) {
    case 'rating':
      return `[{ show: { rating: { average: ${dir} } } }]`
    case 'release':
      return `[{ show: { premiered: ${dir} } }]`
    case 'title':
    default:
      return `[{ show: { name: ${dir} } }]`
  }
}

async function fetchPage(filters: CatalogueFilters, after: string | null): Promise<CataloguePage> {
  // Substitute only the real `orderBy: __ORDER_BY__` clause in the query body
  // — matching the bare `__ORDER_BY__` token would instead hit its first
  // mention in the file's leading doc comment (which documents the
  // placeholder using that same literal text) and leave the actual clause
  // untouched, since String.replace() with a plain string only replaces the
  // first occurrence.
  const query = showsQuery.replace('orderBy: __ORDER_BY__', `orderBy: ${buildOrderByLiteral(filters)}`)
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(query, {
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
// search/genre/sort/locale state changes); subsequent pages are appended on
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
