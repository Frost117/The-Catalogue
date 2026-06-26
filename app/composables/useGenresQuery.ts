import genresQuery from '~/graphql/genres.gql?raw'

// Genre list for the catalogue filter. If the live Compose schema has no
// `genres` query, delete this and derive genres client-side from catalogue
// results instead. Swap for the generated `GqlGenres` composable after codegen.
export function useGenresQuery(locale: () => string) {
  return useAsyncData<string[]>(
    () => `genres:${locale()}`,
    () => gqlRequest<{ genres: string[] }>(genresQuery, {
      locale: locale()
    }).then(r => r.genres ?? []),
    { watch: [locale], default: () => [] }
  )
}
