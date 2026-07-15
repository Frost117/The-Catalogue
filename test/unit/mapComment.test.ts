import { describe, it, expect } from 'vitest'
import { mapComment } from '../../server/utils/mapComment'

describe('mapComment', () => {
  const row = {
    id: 'c1',
    showId: 'show-1',
    authorDisplayName: 'Alice',
    rating: 4,
    body: 'Great show',
    createdAt: 1_700_000_000 // unix seconds
  }

  it('passes through fields and converts unix seconds to an ISO string', () => {
    expect(mapComment(row)).toEqual({
      id: 'c1',
      showId: 'show-1',
      authorDisplayName: 'Alice',
      rating: 4,
      body: 'Great show',
      createdAt: new Date(1_700_000_000 * 1000).toISOString()
    })
  })

  it('produces a UTC ISO timestamp (seconds -> ms)', () => {
    expect(mapComment({ ...row, createdAt: 0 }).createdAt).toBe('1970-01-01T00:00:00.000Z')
  })
})
