import showsQuery from '~/graphql/shows.gql?raw'
import type { ShowsResult } from '~/types/show'

export interface CatalogueVars {
  locale: string
  page: number
  pageSize: number
  search?: string
  genre?: string
}

// Paginated catalogue fetch. Pass a getter so the query re-runs when the
// reactive search/genre/page/locale state changes. Swap the gqlRequest call for
// the generated `GqlShows` composable once codegen has run.
export function useShowsQuery(vars: () => CatalogueVars) {
  return useAsyncData<ShowsResult>(
    'catalogue',
    () => {
      const v = vars()
      return gqlRequest<{ shows: ShowsResult }>(showsQuery, {
        locale: v.locale,
        page: v.page,
        pageSize: v.pageSize,
        search: v.search || undefined,
        genre: v.genre || undefined
      }).then(r => r.shows)
    },
    { watch: [vars] }
  )
}
