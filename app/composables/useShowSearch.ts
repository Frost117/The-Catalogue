// Exported for direct unit testing; pure and side-effect-free.
export function firstQuery(value: unknown): string {
  if (Array.isArray(value)) {
    return (value[0] as string) ?? ''
  }
  return (value as string) ?? ''
}

const ALL_GENRES = '__all__'

// Owns the catalogue page's search/genre filter state, debounces typed
// search input into a committed term, and keeps all of it in sync with the
// URL so results are shareable + SSR-able.
export function useShowSearch(genres: () => string[] | null | undefined) {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()

  const searchInput = ref(firstQuery(route.query.q))
  const search = ref(searchInput.value)
  const genre = ref(firstQuery(route.query.genre))

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  watch(searchInput, (value) => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      search.value = value
    }, 350)
  })

  watch([search, genre], () => {
    router.replace({
      query: {
        ...(search.value ? { q: search.value } : {}),
        ...(genre.value ? { genre: genre.value } : {})
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
    hasFilters,
    clearFilters
  }
}
