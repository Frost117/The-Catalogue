import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import {
  useCatalogueFilters,
  parseSortBy,
  parseSortDir,
  firstQuery,
  DEFAULT_SORT_DIR
} from '~/composables/useCatalogueFilters'

// Mutable mock state shared with the hoisted mockNuxtImport factories below.
const mocks = vi.hoisted(() => ({
  routeQuery: {} as Record<string, unknown>,
  routerReplace: vi.fn()
}))

mockNuxtImport('useRoute', () => () => ({
  query: mocks.routeQuery,
  path: '/',
  fullPath: '/',
  params: {},
  hash: '',
  name: 'index',
  matched: [],
  meta: {}
}))
// The @nuxt/test-utils runtime setup itself calls useRouter().afterEach(), so the
// stub must carry the guard hooks as no-ops; we only assert on `replace`.
mockNuxtImport('useRouter', () => () => ({
  replace: mocks.routerReplace,
  push: vi.fn(),
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn()
}))
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))

beforeEach(() => {
  mocks.routeQuery = {}
  mocks.routerReplace.mockClear()
})

// --- Pure helpers (exported for direct testing) ---

describe('firstQuery', () => {
  it('normalizes route query values to a single string', () => {
    expect(firstQuery('abc')).toBe('abc')
    expect(firstQuery(['a', 'b'])).toBe('a')
    expect(firstQuery(undefined)).toBe('')
    expect(firstQuery([])).toBe('')
  })
})

describe('parseSortBy', () => {
  it('accepts valid sort fields and defaults to title otherwise', () => {
    expect(parseSortBy('rating')).toBe('rating')
    expect(parseSortBy('release')).toBe('release')
    expect(parseSortBy('title')).toBe('title')
    expect(parseSortBy('bogus')).toBe('title')
    expect(parseSortBy(undefined)).toBe('title')
  })
})

describe('parseSortDir', () => {
  it('accepts asc/desc and otherwise falls back to the field default', () => {
    expect(parseSortDir('asc', 'rating')).toBe('asc')
    expect(parseSortDir('desc', 'title')).toBe('desc')
    expect(parseSortDir('bogus', 'rating')).toBe(DEFAULT_SORT_DIR.rating) // 'desc'
    expect(parseSortDir(undefined, 'title')).toBe(DEFAULT_SORT_DIR.title) // 'asc'
  })
})

// --- Composable behaviour ---

describe('useCatalogueFilters — initial state from URL', () => {
  it('defaults to title/asc with no query', () => {
    const f = useCatalogueFilters(() => [])
    expect(f.sortBy.value).toBe('title')
    expect(f.sortDir.value).toBe('asc')
    expect(f.hasFilters.value).toBe(false)
  })

  it('restores sortBy and sortDir verbatim from the URL (no default reset)', () => {
    // rating's natural default is desc; asc from the URL must survive restore.
    mocks.routeQuery = { sortBy: 'rating', sortDir: 'asc', q: 'dome', genre: 'Drama' }
    const f = useCatalogueFilters(() => [])
    expect(f.sortBy.value).toBe('rating')
    expect(f.sortDir.value).toBe('asc')
    expect(f.searchInput.value).toBe('dome')
    expect(f.genre.value).toBe('Drama')
    expect(f.hasFilters.value).toBe(true)
  })
})

describe('genre sentinel proxy', () => {
  it('maps the __all__ sentinel to/from the empty source value', () => {
    const f = useCatalogueFilters(() => ['Drama'])
    expect(f.genreSelection.value).toBe('__all__') // '' -> sentinel

    f.genreSelection.value = 'Drama'
    expect(f.genre.value).toBe('Drama')
    expect(f.genreSelection.value).toBe('Drama')

    f.genreSelection.value = '__all__'
    expect(f.genre.value).toBe('') // sentinel -> ''
  })

  it('prepends an all-genres item to the provided genres', () => {
    const f = useCatalogueFilters(() => ['Drama', 'Comedy'])
    expect(f.genreItems.value).toEqual([
      { label: 'catalogue.allGenres', value: '__all__' },
      { label: 'Drama', value: 'Drama' },
      { label: 'Comedy', value: 'Comedy' }
    ])
  })
})

describe('sort direction defaults + toggle', () => {
  it('resets direction to the field default when the sort field changes', () => {
    const f = useCatalogueFilters(() => [])
    f.sortBySelection.value = 'rating'
    expect(f.sortBy.value).toBe('rating')
    expect(f.sortDir.value).toBe('desc') // rating default

    f.sortBySelection.value = 'title'
    expect(f.sortDir.value).toBe('asc') // title default
  })

  it('toggleSortDir flips direction', () => {
    const f = useCatalogueFilters(() => [])
    expect(f.sortDir.value).toBe('asc')
    f.toggleSortDir()
    expect(f.sortDir.value).toBe('desc')
    f.toggleSortDir()
    expect(f.sortDir.value).toBe('asc')
  })
})

describe('clearFilters / hasFilters', () => {
  it('reports filters from search or genre only (not sort)', () => {
    const f = useCatalogueFilters(() => [])
    expect(f.hasFilters.value).toBe(false)
    f.sortBySelection.value = 'rating' // sort change does not count as a filter
    expect(f.hasFilters.value).toBe(false)
    f.genre.value = 'Drama'
    expect(f.hasFilters.value).toBe(true)
  })

  it('clears search and genre but leaves sort untouched', () => {
    mocks.routeQuery = { q: 'dome', genre: 'Drama', sortBy: 'rating', sortDir: 'asc' }
    const f = useCatalogueFilters(() => [])
    f.clearFilters()
    expect(f.searchInput.value).toBe('')
    expect(f.search.value).toBe('')
    expect(f.genre.value).toBe('')
    expect(f.hasFilters.value).toBe(false)
    expect(f.sortBy.value).toBe('rating') // sort preserved
    expect(f.sortDir.value).toBe('asc')
  })
})

describe('URL sync (default-omission rule)', () => {
  it('omits sortBy/sortDir from the URL when they equal the defaults', async () => {
    const f = useCatalogueFilters(() => [])
    // rating -> desc is rating's default, so only sortBy is written.
    f.sortBySelection.value = 'rating'
    await nextTick()
    expect(mocks.routerReplace).toHaveBeenLastCalledWith({ query: { sortBy: 'rating' } })

    // Flip to asc (non-default for rating) -> both keys present.
    f.toggleSortDir()
    await nextTick()
    expect(mocks.routerReplace).toHaveBeenLastCalledWith({ query: { sortBy: 'rating', sortDir: 'asc' } })
  })

  it('drops the query entirely back to defaults', async () => {
    const f = useCatalogueFilters(() => [])
    f.genre.value = 'Drama'
    await nextTick()
    expect(mocks.routerReplace).toHaveBeenLastCalledWith({ query: { genre: 'Drama' } })

    f.clearFilters()
    await nextTick()
    expect(mocks.routerReplace).toHaveBeenLastCalledWith({ query: {} })
  })
})

describe('search debounce', () => {
  it('commits searchInput to search after 350ms and syncs the URL', async () => {
    vi.useFakeTimers()
    try {
      const f = useCatalogueFilters(() => [])
      f.searchInput.value = 'breaking'
      await nextTick()
      expect(f.search.value).toBe('') // not yet committed

      vi.advanceTimersByTime(349)
      expect(f.search.value).toBe('')

      vi.advanceTimersByTime(1)
      expect(f.search.value).toBe('breaking')

      await nextTick()
      expect(mocks.routerReplace).toHaveBeenLastCalledWith({ query: { q: 'breaking' } })
    } finally {
      vi.useRealTimers()
    }
  })
})
