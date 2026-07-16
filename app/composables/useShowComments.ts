import { useAuth } from '~/composables/useAuth'
import type { Comment } from '~/types/show'

// Owns the show page's comment section: the (currently stubbed) read, the post
// form state + submit, and the small view helpers (date formatting, jump-to
// scroll). The view just binds what this returns.
//
// READ path is stubbed: the Compose GraphQL comments query isn't live yet (see
// MEMORY — reads pending backend), so the list starts empty and only fills with
// comments posted in this session. When the schema lands, replace the fetcher
// below with a gqlRequest (newest-first, paginated) — the view won't change.
//
// WRITE path is real: submitComment() forwards to the Umbraco backend via the
// same-origin /api/comments proxy (the member session cookie authenticates it),
// then optimistically prepends the new comment since the read path can't fetch
// it back yet.
export function useShowComments(showId: () => number | null) {
  const { user, loggedIn } = useAuth()
  const { locale } = useI18n()

  const { data, status, error, refresh } = useAsyncData<Comment[]>(
    () => `comments:${showId() ?? 'none'}`,
    async () => {
      const id = showId()
      if (id == null) {
        return []
      }
      // TODO: replace with a Compose GraphQL read once the schema exposes
      // comments (key by `id`, newest first, paginate).
      return []
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
