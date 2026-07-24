import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useShowSearch, firstQuery } from '~/composables/useShowSearch'

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

// --- Composable behaviour ---

describe('useShowSearch — initial state from URL', () => {
  it('defaults to no filters with no query', () => {
    const f = useShowSearch(() => [])
    expect(f.hasFilters.value).toBe(false)
  })

  it('restores search and genre from the URL', () => {
    mocks.routeQuery = { q: 'dome', genre: 'Drama' }
    const f = useShowSearch(() => [])
    expect(f.searchInput.value).toBe('dome')
    expect(f.genre.value).toBe('Drama')
    expect(f.hasFilters.value).toBe(true)
  })
})

describe('genre sentinel proxy', () => {
  it('maps the __all__ sentinel to/from the empty source value', () => {
    const f = useShowSearch(() => ['Drama'])
    expect(f.genreSelection.value).toBe('__all__') // '' -> sentinel

    f.genreSelection.value = 'Drama'
    expect(f.genre.value).toBe('Drama')
    expect(f.genreSelection.value).toBe('Drama')

    f.genreSelection.value = '__all__'
    expect(f.genre.value).toBe('') // sentinel -> ''
  })

  it('prepends an all-genres item to the provided genres', () => {
    const f = useShowSearch(() => ['Drama', 'Comedy'])
    expect(f.genreItems.value).toEqual([
      { label: 'catalogue.allGenres', value: '__all__' },
      { label: 'Drama', value: 'Drama' },
      { label: 'Comedy', value: 'Comedy' }
    ])
  })
})

describe('clearFilters / hasFilters', () => {
  it('reports filters from search or genre', () => {
    const f = useShowSearch(() => [])
    expect(f.hasFilters.value).toBe(false)
    f.genre.value = 'Drama'
    expect(f.hasFilters.value).toBe(true)
  })

  it('clears search and genre', () => {
    mocks.routeQuery = { q: 'dome', genre: 'Drama' }
    const f = useShowSearch(() => [])
    f.clearFilters()
    expect(f.searchInput.value).toBe('')
    expect(f.search.value).toBe('')
    expect(f.genre.value).toBe('')
    expect(f.hasFilters.value).toBe(false)
  })
})

describe('URL sync (default-omission rule)', () => {
  it('drops the query entirely back to defaults', async () => {
    const f = useShowSearch(() => [])
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
      const f = useShowSearch(() => [])
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
