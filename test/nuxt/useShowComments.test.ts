import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport, registerEndpoint } from '@nuxt/test-utils/runtime'
import { ref, type Ref } from 'vue'
import { useShowComments } from '~/composables/useShowComments'

// Login state is controllable per test; the composable reads `loggedIn` from
// useAuth to gate the submit path. Refs are built in beforeEach (ref isn't
// available inside vi.hoisted, which runs before the vue import) and stashed in
// this hoisted container the mock factory reads from.
const auth = vi.hoisted(() => ({
  loggedIn: null as unknown as Ref<boolean>,
  user: null as unknown as Ref<{ username: string } | null>
}))
mockNuxtImport('useAuth', () => () => auth)
mockNuxtImport('useI18n', () => () => ({ locale: ref('en') }))

// The read path is stubbed (returns []); back useAsyncData with a writable ref
// so the optimistic prepend has somewhere to land, mirroring useShowsQuery.test.
mockNuxtImport('useAsyncData', () => {
  return (_key: unknown, _handler: unknown) => ({
    data: ref<unknown[]>([]),
    status: ref('success'),
    error: ref(null),
    refresh: vi.fn()
  })
})

// The single network seam: record every POST that reaches the write proxy.
const posted = vi.hoisted(() => ({ calls: [] as unknown[] }))
registerEndpoint('/api/comments', {
  method: 'POST',
  handler: async (event) => {
    const { readBody } = await import('h3')
    posted.calls.push(await readBody(event))
    return { ok: true }
  }
})

beforeEach(() => {
  posted.calls.length = 0
  auth.loggedIn = ref(false)
  auth.user = ref<{ username: string } | null>(null)
})

describe('useShowComments — unauthenticated post guard', () => {
  it('does NOT hit /api/comments when the user is logged out', async () => {
    const c = useShowComments(() => 1)
    c.commentBody.value = 'sneaky comment'

    await c.submitComment()

    expect(posted.calls).toHaveLength(0)
    // A blocked submit is a no-op, not an error, and leaves the draft intact.
    expect(c.postError.value).toBe(false)
    expect(c.commentBody.value).toBe('sneaky comment')
  })

  it('posts to /api/comments once logged in, with the { showId, comment } body', async () => {
    auth.loggedIn.value = true
    auth.user.value = { username: '+4520123456' }
    const c = useShowComments(() => 42)
    c.commentBody.value = 'great show'

    await c.submitComment()

    expect(posted.calls).toEqual([{ showId: 42, comment: 'great show' }])
    // Successful post clears the draft and optimistically prepends the comment.
    expect(c.commentBody.value).toBe('')
    expect(c.comments.value[0]).toMatchObject({ showId: 42, body: 'great show', author: '+4520123456' })
  })
})
