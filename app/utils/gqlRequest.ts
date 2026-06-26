// GraphQL request helper used by the data-access composables.
//
// Posts to the same-origin /api/graphql Nitro route, which attaches the Compose
// Bearer token server-side and forwards upstream. Works during SSR and on
// client navigations without ever exposing credentials to the browser.
//
// When the live schema is introspectable (correct GQL_HOST path + working
// codegen), the generated `Gql*` composables from nuxt-graphql-client can
// replace these calls inside app/composables/ — but keep routing through the
// server proxy so the token stays server-side.

interface GqlError {
  message: string
}

interface GqlResponse<T> {
  data?: T
  errors?: GqlError[]
}

export async function gqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await $fetch<GqlResponse<T>>('/api/graphql', {
    method: 'POST',
    body: { query, variables }
  })

  if (response.errors?.length) {
    throw createError({
      statusCode: 502,
      statusMessage: response.errors.map(e => e.message).join('; ')
    })
  }

  return response.data as T
}
