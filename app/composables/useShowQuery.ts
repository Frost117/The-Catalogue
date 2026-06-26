import showQuery from '~/graphql/show.gql?raw'
import type { Show } from '~/types/show'

// Single show detail by slug + locale. Pass getters so it re-runs on locale
// change. Swap the gqlRequest call for the generated `GqlShow` composable once
// codegen has run.
export function useShowQuery(slug: () => string, locale: () => string) {
  return useAsyncData<Show | null>(
    () => `show:${slug()}:${locale()}`,
    () => gqlRequest<{ show: Show | null }>(showQuery, {
      slug: slug(),
      locale: locale()
    }).then(r => r.show),
    { watch: [slug, locale] }
  )
}
