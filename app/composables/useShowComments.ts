import { useAuth } from '~/composables/useAuth'
import commentsQuery from '~/graphql/comments.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapComment } from '~/utils/mapShow'
import type { Comment } from '~/types/show'
import type { RawComment, RawNodeConnection } from '~/types/compose'

export const COMMENTS_PAGE_SIZE = 50

// Owns the show page's comment section: the read (via Compose GraphQL,
// newest-first), the post form state + submit, and the small view helpers
// (date formatting, jump-to scroll). The view just binds what this returns.
//
// WRITE path forwards to the Umbraco backend via the same-origin /api/comments
// proxy (the member session cookie authenticates it), then optimistically
// prepends the new comment. That optimistic entry is kept even though the
// read path below is now live: read-after-write latency against Compose
// hasn't been verified, so the existing local-id bridge is the safer choice.

export async function fetchComments(id: number): Promise<Comment[]> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawComment> }>(
    commentsQuery,
    { where: { comment: { showId: id } }, first: COMMENTS_PAGE_SIZE }
  )
  return (res.tvshow_collection.items ?? [])
    .filter((c): c is RawComment => !!c)
    .map(mapComment)
}

export function useShowComments(showId: () => number | null) {
  const { user, loggedIn } = useAuth()
  const { locale } = useI18n()

  const { data, status, error, refresh } = useAsyncData<Comment[]>(
    () => `comments:${showId() ?? 'none'}`,
    async () => {
      const id = showId()
      return id == null ? [] : fetchComments(id)
    },
    { watch: [showId] }
  )

  const comments = computed(() => data.value ?? [])
  const count = computed(() => comments.value.length)

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
    // Optimistic prepend — the read path can't return this yet.
    const optimistic: Comment = {
      id: `local-${Date.now()}`,
      showId: id,
      author: user.value?.username ?? '',
      body: text,
      createdAt: new Date().toISOString()
    }
    data.value = [optimistic, ...(data.value ?? [])]
  }

  async function submitComment() {
    const text = commentBody.value.trim()
    if (!text || posting.value) {
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
