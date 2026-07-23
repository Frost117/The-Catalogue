import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { buildWhere, useShowsQuery, CATALOGUE_PAGE_SIZE, type CatalogueFilters } from '~/composables/useShowsQuery'
import type { ShowSummary } from '~/types/show'

const baseFilters = (over: Partial<CatalogueFilters> = {}): CatalogueFilters => ({
  locale: 'en',
  search: '',
  genre: '',
  ...over
})

// --- Pure builders ---

describe('buildWhere', () => {
  it('is empty when no search or genre is set', () => {
    expect(buildWhere(baseFilters())).toEqual({ show: {} })
  })

  // Search matches every localized name field (OR), mirroring the display
  // fallback, so a show whose active-locale title is untranslated is still
  // findable by the title actually shown (see buildWhere for the full rationale).
  const searchOr = (term: string) => [
    { name: { en_contains: term } },
    { name: { da_contains: term } },
    { name: { vi_contains: term } }
  ]

  it('adds an all-locale name OR and genres_some only when present', () => {
    expect(buildWhere(baseFilters({ search: 'dome' }))).toEqual({ show: { OR: searchOr('dome') } })
    expect(buildWhere(baseFilters({ genre: 'Drama' }))).toEqual({ show: { genres_some: ['Drama'] } })
    expect(buildWhere(baseFilters({ search: 'dome', genre: 'Drama' }))).toEqual({
      show: { OR: searchOr('dome'), genres_some: ['Drama'] }
    })
  })

  it('searches all locales regardless of the displayed locale', () => {
    // The Danish-search bug: filtering only da_contains missed shows shown via
    // English fallback. The where clause must not depend on filters.locale.
    const expected = { show: { OR: searchOr('dome') } }
    expect(buildWhere(baseFilters({ search: 'dome', locale: 'da' }))).toEqual(expected)
    expect(buildWhere(baseFilters({ search: 'dome', locale: 'vi' }))).toEqual(expected)
  })
})

// --- Pagination behaviour ---

// gqlRequest is the single network seam. Each call returns the next scripted page.
const gql = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('~/utils/gqlRequest', () => ({ gqlRequest: gql.requestMock }))

// Drive useAsyncData with a controllable first-page ref so we can exercise the
// derived items/hasMore/loadMore logic without Nuxt's real data layer.
const asyncState = vi.hoisted(() => ({
  data: null as unknown
}))
mockNuxtImport('useAsyncData', () => {
  return (_key: string, _handler: unknown) => ({
    data: asyncState.data,
    status: ref('success'),
    error: ref(null),
    refresh: vi.fn()
  })
})

const summary = (id: string): ShowSummary => ({ id, slug: id, title: id, genres: [] })

const page = (ids: string[], endCursor: string | null, hasNextPage: boolean) => ({
  tvshow_collection: {
    items: ids.map(id => ({ id, name: { en: id, da: null, vi: null }, genres: [], status: null, premiered: null, network: null, image: null, rating: null, summary: null })),
    pageInfo: { endCursor, hasNextPage }
  }
})

beforeEach(() => {
  gql.requestMock.mockReset()
})

describe('useShowsQuery pagination', () => {
  it('exposes the first page and appends load-more results with page size + cursor', async () => {
    asyncState.data = ref({ items: [summary('show-1')], endCursor: 'cur1', hasNextPage: true })
    gql.requestMock.mockResolvedValueOnce(page(['show-2'], 'cur2', false))

    const q = useShowsQuery(() => baseFilters())
    expect(q.items.value.map(s => s.id)).toEqual(['show-1'])
    expect(q.hasMore.value).toBe(true)

    await q.loadMore()

    expect(q.items.value.map(s => s.id)).toEqual(['show-1', 'show-2'])
    expect(q.hasMore.value).toBe(false)
    // Second page requested with the first page's cursor and the fixed page size.
    expect(gql.requestMock).toHaveBeenCalledTimes(1)
    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toMatchObject({ after: 'cur1', first: CATALOGUE_PAGE_SIZE })
  })

  it('does not fetch when there is no next page', async () => {
    asyncState.data = ref({ items: [summary('show-1')], endCursor: null, hasNextPage: false })
    const q = useShowsQuery(() => baseFilters())

    await q.loadMore()

    expect(gql.requestMock).not.toHaveBeenCalled()
    expect(q.loadingMore.value).toBe(false)
  })
})
