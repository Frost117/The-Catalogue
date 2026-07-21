import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { fetchComments, useShowComments, COMMENTS_PAGE_SIZE } from '~/composables/useShowComments'
import type { RawComment } from '~/types/compose'
import type { Comment } from '~/types/show'

// gqlRequest is the single network seam, same pattern as useShowsQuery.test.ts.
const gql = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('~/utils/gqlRequest', () => ({ gqlRequest: gql.requestMock }))

// $fetch is the write-path network seam (post() posts directly to it).
const fetchMock = vi.hoisted(() => vi.fn())
mockNuxtImport('$fetch', () => fetchMock)
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key, locale: ref('en') }))

const raw = (over: Partial<RawComment> = {}): RawComment => ({
  id: 'c1',
  createdAt: '2026-07-15T10:08:20.000Z',
  memberName: '+84971026949',
  showId: 1,
  text: 'Test comment ne',
  ...over
})

const comment = (id: string): Comment => ({
  id,
  showId: 1,
  author: '+84971026949',
  body: `body-${id}`,
  createdAt: '2026-07-15T10:08:20.000Z'
})

beforeEach(() => {
  gql.requestMock.mockReset()
  fetchMock.mockReset()
})

describe('fetchComments', () => {
  it('requests the first page, newest first, and maps items to the domain shape', async () => {
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [raw()], pageInfo: { hasNextPage: false, endCursor: null } }
    })

    const page = await fetchComments(1)

    expect(gql.requestMock).toHaveBeenCalledTimes(1)
    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toEqual({ where: { comment: { showId: 1 } }, first: COMMENTS_PAGE_SIZE, after: null })
    expect(page).toEqual({
      items: [{ id: 'c1', showId: 1, author: '+84971026949', body: 'Test comment ne', createdAt: '2026-07-15T10:08:20.000Z' }],
      endCursor: null,
      hasNextPage: false
    })
  })

  it('passes an explicit cursor through as `after`', async () => {
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })

    await fetchComments(1, 'cur1')

    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toMatchObject({ after: 'cur1' })
  })

  it('filters out null items and coerces a decimal-string showId', async () => {
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [null, raw({ showId: '5' })], pageInfo: { hasNextPage: true, endCursor: 'cur2' } }
    })

    const page = await fetchComments(5)

    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.showId).toBe(5)
    expect(page.hasNextPage).toBe(true)
    expect(page.endCursor).toBe('cur2')
  })
})

// --- useShowComments pagination + optimistic post interaction ---

const asyncState = vi.hoisted(() => ({ data: null as unknown }))
mockNuxtImport('useAsyncData', () => {
  return (_key: string, _handler: unknown) => ({
    data: asyncState.data,
    status: ref('success'),
    error: ref(null),
    refresh: vi.fn()
  })
})

describe('useShowComments pagination', () => {
  it('loadMore appends results and advances the cursor with the fixed page size', async () => {
    asyncState.data = ref({ items: [comment('c1')], endCursor: 'cur1', hasNextPage: true })
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [raw({ id: 'c2' })], pageInfo: { hasNextPage: false, endCursor: 'cur2' } }
    })

    const c = useShowComments(() => 1)
    expect(c.comments.value.map(x => x.id)).toEqual(['c1'])
    expect(c.count.value).toBe(1)
    expect(c.hasMore.value).toBe(true)

    await c.loadMore()

    expect(c.comments.value.map(x => x.id)).toEqual(['c1', 'c2'])
    expect(c.count.value).toBe(2)
    expect(c.hasMore.value).toBe(false)
    expect(gql.requestMock).toHaveBeenCalledTimes(1)
    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toMatchObject({ after: 'cur1', first: COMMENTS_PAGE_SIZE })
  })

  it('does not fetch when there is no next page', async () => {
    asyncState.data = ref({ items: [comment('c1')], endCursor: null, hasNextPage: false })
    const c = useShowComments(() => 1)

    await c.loadMore()

    expect(gql.requestMock).not.toHaveBeenCalled()
    expect(c.loadingMore.value).toBe(false)
  })

  it('posting a comment while a second page is loaded keeps the appended page', async () => {
    asyncState.data = ref({ items: [comment('c1')], endCursor: 'cur1', hasNextPage: true })
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [raw({ id: 'c2' })], pageInfo: { hasNextPage: false, endCursor: 'cur2' } }
    })
    fetchMock.mockResolvedValueOnce({})

    const c = useShowComments(() => 1)
    await c.loadMore()
    expect(c.comments.value.map(x => x.id)).toEqual(['c1', 'c2'])

    c.commentBody.value = 'new comment'
    await c.submitComment()

    // The optimistic comment is prepended to the first page; the
    // already-loaded second page (c2) must still be present afterward.
    expect(c.comments.value.map(x => x.id).slice(1)).toEqual(['c1', 'c2'])
    expect(fetchMock).toHaveBeenCalledWith('/api/comments', { method: 'POST', body: { showId: 1, comment: 'new comment' } })
  })

  it('discards a stale loadMore response if the show changes before it resolves', async () => {
    let currentShowId = 1
    asyncState.data = ref({ items: [comment('c1')], endCursor: 'cur1', hasNextPage: true })
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [raw({ id: 'c2' })], pageInfo: { hasNextPage: false, endCursor: 'cur2' } }
    })

    const c = useShowComments(() => currentShowId)
    const loadPromise = c.loadMore()
    currentShowId = 2 // show changes while the fetch above is still in flight
    await loadPromise

    // The stale page for show 1 must not have been appended.
    expect(c.comments.value.map(x => x.id)).toEqual(['c1'])
    expect(c.loadingMore.value).toBe(false)
  })
})
