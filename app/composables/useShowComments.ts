import { useAuth } from '~/composables/useAuth'
import commentsQuery from '~/graphql/comments.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapComment } from '~/utils/mapShow'
import type { Comment } from '~/types/show'
import type { RawComment, RawNodeConnection } from '~/types/compose'

export const COMMENTS_PAGE_SIZE = 20

export interface CommentsPage {
  items: Comment[]
  endCursor: string | null
  hasNextPage: boolean
}

// Owns the show page's comment section: the read (via Compose GraphQL,
// newest-first, cursor-paginated with a "load more" affordance), the post
// form state + submit, and the small view helpers (date formatting, jump-to
// scroll). The view just binds what this returns.
//
// WRITE path forwards to the Umbraco backend via the same-origin /api/comments
// proxy (the member session cookie authenticates it), then optimistically
// prepends the new comment into the first page. That optimistic entry is kept
// even though the read path below is now live: read-after-write latency
// against Compose hasn't been verified, so the existing local-id bridge is
// the safer choice.

export async function fetchComments(id: number, after: string | null = null): Promise<CommentsPage> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawComment> }>(
    commentsQuery,
    { where: { comment: { showId: id } }, first: COMMENTS_PAGE_SIZE, after }
  )
  const conn = res.tvshow_collection
  return {
    items: (conn.items ?? []).filter((c): c is RawComment => !!c).map(mapComment),
    endCursor: conn.pageInfo?.endCursor ?? null,
    hasNextPage: conn.pageInfo?.hasNextPage ?? false
  }
}

export function useShowComments(showId: () => number | null) {
  const { user, loggedIn } = useAuth()
  const { locale } = useI18n()

  // State for pages loaded after the first via "load more". Declared before
  // the useAsyncData call below because its handler resets it.
  const appended = ref<{ items: Comment[], cursor: string | null, hasNextPage: boolean } | null>(null)
  const loadingMore = ref(false)

  const { data, status, error, refresh } = useAsyncData<CommentsPage>(
    () => `comments:${showId() ?? 'none'}`,
    async () => {
      // Reset here — not via `watch(data, ...)` — because post()'s optimistic
      // prepend below mutates `data.value` directly. A blanket watch on
      // `data` would wrongly wipe an already-loaded second page every time a
      // comment is posted. This only resets on an actual re-fetch: a show
      // change or an explicit refresh().
      appended.value = null
      const id = showId()
      return id == null ? { items: [], endCursor: null, hasNextPage: false } : fetchComments(id)
    },
    { watch: [showId] }
  )

  const comments = computed<Comment[]>(() => [
    ...(data.value?.items ?? []),
    ...(appended.value?.items ?? [])
  ])
  const count = computed(() => comments.value.length)
  const cursor = computed(() => (appended.value ? appended.value.cursor : (data.value?.endCursor ?? null)))
  const hasMore = computed(() => (appended.value ? appended.value.hasNextPage : (data.value?.hasNextPage ?? false)))

  async function loadMore() {
    const id = showId()
    if (!hasMore.value || loadingMore.value || !cursor.value || id == null) {
      return
    }
    loadingMore.value = true
    try {
      const page = await fetchComments(id, cursor.value)
      if (showId() !== id) {
        return
      }
      appended.value = {
        items: [...(appended.value?.items ?? []), ...page.items],
        cursor: page.endCursor,
        hasNextPage: page.hasNextPage
      }
    } finally {
      loadingMore.value = false
    }
  }

  // Post form state.
  const commentBody = ref('')
  const posting = ref(false)
  const postError = ref(false)

  async function post(text: string) {
    const id = showId()
    if (id == null) {
      throw new Error('Cannot post a comment without a show id.')
    }
    // Body matches the backend's PostCommentRequest(int ShowId, string Comment):
    // the field is `comment`, not `text` (ASP.NET binds by property name). The
    // member is identified server-side from the session cookie, not the body.
    await $fetch('/api/comments', {
      method: 'POST',
      body: { showId: id, comment: text }
    })
    // Optimistic prepend into the first page — the read path can't fetch this
    // comment back yet.
    const optimistic: Comment = {
      id: `local-${Date.now()}`,
      showId: id,
      author: user.value?.username ?? '',
      body: text,
      createdAt: new Date().toISOString()
    }
    data.value = {
      items: [optimistic, ...(data.value?.items ?? [])],
      endCursor: data.value?.endCursor ?? null,
      hasNextPage: data.value?.hasNextPage ?? false
    }
  }

  async function submitComment() {
    const text = commentBody.value.trim()
    // Defense in depth against posting while logged out. The write is authorized
    // upstream by the member session cookie (see server/api/comments.post.ts),
    // and the view only renders the form when logged in — but this guarantees no
    // submit path fires a guaranteed-401 /api/comments request without a session.
    if (!text || posting.value || !loggedIn.value) {
      return
    }
    posting.value = true
    postError.value = false
    try {
      await post(text)
      commentBody.value = ''
    } catch {
      postError.value = true
    } finally {
      posting.value = false
    }
  }

  function formatCommentDate(iso: string): string {
    const date = new Date(iso)
    return Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }

  function scrollToComments() {
    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })
  }

  return {
    comments,
    count,
    hasMore,
    loadMore,
    loadingMore,
    status,
    error,
    refresh,
    loggedIn,
    commentBody,
    posting,
    postError,
    submitComment,
    formatCommentDate,
    scrollToComments
  }
}
