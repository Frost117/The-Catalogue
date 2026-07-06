import type { Comment } from '~/types/comment'

export function usePostComment(showId: () => string) {
  const posting = ref(false)
  const error = ref<Error | null>(null)

  async function post(rating: number, body: string): Promise<Comment | null> {
    posting.value = true
    error.value = null
    try {
      return await $fetch<Comment>(`/api/shows/${showId()}/comments`, {
        method: 'POST',
        body: { rating, body }
      })
    } catch (e) {
      error.value = e as Error
      return null
    } finally {
      posting.value = false
    }
  }

  return { post, posting, error }
}
