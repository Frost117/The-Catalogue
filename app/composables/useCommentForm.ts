export function useCommentForm(showId: () => string) {
  const { post, posting, error } = usePostComment(showId)

  const rating = ref(0)
  const body = ref('')

  async function submit(): Promise<boolean> {
    const comment = await post(rating.value, body.value)
    if (comment) {
      rating.value = 0
      body.value = ''
      return true
    }
    return false
  }

  return { rating, body, posting, error, submit }
}
