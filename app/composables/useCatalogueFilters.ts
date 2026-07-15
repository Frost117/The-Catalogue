// Exported for direct unit testing; pure and side-effect-free.
export function firstQuery(value: unknown): string {
  if (Array.isArray(value)) {
    return (value[0] as string) ?? ''
  }
  return (value as string) ?? ''
}

const ALL_GENRES = '__all__'

export type SortField = 'title' | 'rating' | 'release'
export type SortDirection = 'asc' | 'desc'

const SORT_FIELDS: SortField[] = ['title', 'rating', 'release']
export const DEFAULT_SORT_FIELD: SortField = 'title'
export const DEFAULT_SORT_DIR: Record<SortField, SortDirection> = {
  title: 'asc',
  rating: 'desc',
  release: 'desc'
}

export function parseSortBy(value: unknown): SortField {
  const raw = firstQuery(value)
  return (SORT_FIELDS as string[]).includes(raw) ? (raw as SortField) : DEFAULT_SORT_FIELD
}

export function parseSortDir(value: unknown, sortBy: SortField): SortDirection {
  const raw = firstQuery(value)
  return raw === 'asc' || raw === 'desc' ? raw : DEFAULT_SORT_DIR[sortBy]
}

// Owns the catalogue page's search/genre/sort filter state, debounces typed
// search input into a committed term, and keeps all of it in sync with the
// URL so results are shareable + SSR-able.
export function useCatalogueFilters(genres: () => string[] | null | undefined) {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()

  const searchInput = ref(firstQuery(route.query.q))
  const search = ref(searchInput.value)
  const genre = ref(firstQuery(route.query.genre))
  const sortBy = ref<SortField>(parseSortBy(route.query.sortBy))
  const sortDir = ref<SortDirection>(parseSortDir(route.query.sortDir, sortBy.value))

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  watch(searchInput, (value) => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      search.value = value
    }, 350)
  })

  watch([search, genre, sortBy, sortDir], () => {
    router.replace({
      query: {
        ...(search.value ? { q: search.value } : {}),
        ...(genre.value ? { genre: genre.value } : {}),
        ...(sortBy.value !== DEFAULT_SORT_FIELD ? { sortBy: sortBy.value } : {}),
        ...(sortDir.value !== DEFAULT_SORT_DIR[sortBy.value] ? { sortDir: sortDir.value } : {})
      }
    })
  })

  // Reka UI's Select reserves the empty string for the cleared/placeholder
  // state, so the "all genres" item needs a non-empty sentinel value. `genre`
  // stays the source of truth ('' = no filter) for the query/URL logic above;
  // this proxy maps the sentinel <-> '' only at the Select boundary.
  const genreSelection = computed({
    get: () => genre.value || ALL_GENRES,
    set: (value: string) => {
      genre.value = value === ALL_GENRES ? '' : value
    }
  })

  const genreItems = computed(() => [
    { label: t('catalogue.allGenres'), value: ALL_GENRES },
    ...(genres() ?? []).map(g => ({ label: g, value: g }))
  ])

  // Changing the sort field resets direction to that field's natural default
  // (title -> A-Z, rating/release -> highest/newest first). This lives in the
  // setter rather than a `watch(sortBy, ...)` so it only fires on a genuine
  // user field change, not when `sortDir` is restored verbatim from the URL
  // on page load.
  const sortBySelection = computed({
    get: () => sortBy.value,
    set: (value: SortField) => {
      sortBy.value = value
      sortDir.value = DEFAULT_SORT_DIR[value]
    }
  })

  const sortFieldItems = computed((): { label: string, value: SortField }[] => [
    { label: t('catalogue.sortBy.title'), value: 'title' },
    { label: t('catalogue.sortBy.rating'), value: 'rating' },
    { label: t('catalogue.sortBy.release'), value: 'release' }
  ])

  function toggleSortDir() {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }

  const hasFilters = computed(() => !!search.value || !!genre.value)

  function clearFilters() {
    searchInput.value = ''
    search.value = ''
    genre.value = ''
  }

  return {
    searchInput,
    search,
    genre,
    genreSelection,
    genreItems,
    sortBy,
    sortDir,
    sortBySelection,
    sortFieldItems,
    toggleSortDir,
    hasFilters,
    clearFilters
  }
}
