import type { Comment } from '~/types/comment'

export function useCommentsQuery(showId: () => string) {
  return useAsyncData<Comment[]>(
    () => `comments:${showId()}`,
    async () => {
      if (!showId()) {
        return []
      }
      const res = await $fetch<{ items: Comment[] }>(`/api/shows/${showId()}/comments`)
      return res.items
    },
    { watch: [showId], default: () => [] }
  )
}
