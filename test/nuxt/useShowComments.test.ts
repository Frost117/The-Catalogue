import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchComments, COMMENTS_PAGE_SIZE } from '~/composables/useShowComments'
import type { RawComment } from '~/types/compose'

// gqlRequest is the single network seam, same pattern as useShowsQuery.test.ts.
const gql = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('~/utils/gqlRequest', () => ({ gqlRequest: gql.requestMock }))

const raw = (over: Partial<RawComment> = {}): RawComment => ({
  id: 'c1',
  createdAt: '2026-07-15T10:08:20.000Z',
  memberName: '+84971026949',
  showId: 1,
  text: 'Test comment ne',
  ...over
})

beforeEach(() => {
  gql.requestMock.mockReset()
})

describe('fetchComments', () => {
  it('requests comments for a show, newest first, and maps them to the domain shape', async () => {
    gql.requestMock.mockResolvedValueOnce({ tvshow_collection: { items: [raw()] } })

    const comments = await fetchComments(1)

    expect(gql.requestMock).toHaveBeenCalledTimes(1)
    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toEqual({ where: { comment: { showId: 1 } }, first: COMMENTS_PAGE_SIZE })
    expect(comments).toEqual([
      { id: 'c1', showId: 1, author: '+84971026949', body: 'Test comment ne', createdAt: '2026-07-15T10:08:20.000Z' }
    ])
  })

  it('filters out null items and coerces a decimal-string showId', async () => {
    gql.requestMock.mockResolvedValueOnce({ tvshow_collection: { items: [null, raw({ showId: '5' })] } })

    const comments = await fetchComments(5)

    expect(comments).toHaveLength(1)
    expect(comments[0]!.showId).toBe(5)
  })
})
