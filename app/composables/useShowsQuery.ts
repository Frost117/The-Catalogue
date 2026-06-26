import showsQuery from '~/graphql/shows.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapShowSummary } from '~/utils/mapShow'
import { BASELINE_VARIANT } from '~/utils/contentVariant'
import type { ShowSummary } from '~/types/show'
import type { RawNodeConnection, RawShow } from '~/types/compose'

export const CATALOGUE_PAGE_SIZE = 24

export interface CatalogueFilters {
  locale: string
  search: string
  genre: string
}

interface CataloguePage {
  items: ShowSummary[]
  endCursor: string | null
  hasNextPage: boolean
  variant: string
}

// Translate filters into the Compose `where` input. Optional filters are only
// included when set, so we never send `name_contains: null` or `[null]`.
function buildWhere(variant: string, filters: CatalogueFilters) {
  const show: Record<string, unknown> = { variant }
  if (filters.search) {
    show.name_contains = filters.search
  }
  if (filters.genre) {
    show.properties = { genres_some: [filters.genre] }
  }
  return { show }
}

async function fetchPage(
  variant: string,
  filters: CatalogueFilters,
  after: string | null
): Promise<CataloguePage> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(showsQuery, {
    where: buildWhere(variant, filters),
    first: CATALOGUE_PAGE_SIZE,
    after
  })
  const conn = res.tvshow_collection
  return {
    items: (conn.items ?? [])
      .filter((s): s is RawShow => !!s)
      .map(mapShowSummary),
    endCursor: conn.pageInfo?.endCursor ?? null,
    hasNextPage: conn.pageInfo?.hasNextPage ?? false,
    variant
  }
}

// Paginated catalogue with a "load more" affordance. The first page is fetched
// via useAsyncData (so it renders during SSR and re-runs when the reactive
// search/genre/locale state changes); subsequent pages are appended on the
// client. The fallback chain (requested locale → baseline → empty) is applied
// to the first page; later pages reuse whichever variant actually served data.
export function useShowsQuery(filters: () => CatalogueFilters) {
  const { data, status, error, refresh } = useAsyncData(
    'catalogue',
    async () => {
      const f = filters()
      let page = await fetchPage(f.locale, f, null)
      if (page.items.length === 0 && f.locale !== BASELINE_VARIANT) {
        page = await fetchPage(BASELINE_VARIANT, f, null)
      }
      return page
    },
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
  const servedVariant = computed(() => data.value?.variant ?? '')
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
      const page = await fetchPage(servedVariant.value, filters(), cursor.value)
      appended.value = {
        items: [...(appended.value?.items ?? []), ...page.items],
        cursor: page.endCursor,
        hasNextPage: page.hasNextPage
      }
    } finally {
      loadingMore.value = false
    }
  }

  return { items, hasMore, loadMore, loadingMore, servedVariant, status, error, refresh }
}
