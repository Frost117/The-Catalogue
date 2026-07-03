import genresQuery from '~/graphql/genres.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import type { RawNodeConnection, RawShow } from '~/types/compose'

// Genre list for the catalogue filter, derived from the shows' genre arrays (the
// schema has no dedicated genres query). Genres are not localised in the data
// (always English), so this is locale-independent.
export function useGenresQuery() {
  return useAsyncData<string[]>(
    'genres',
    async () => {
      const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(
        genresQuery,
        { where: { show: {} }, first: 100 }
      )
      const shows = (res.tvshow_collection.items ?? []).filter((s): s is RawShow => !!s)

      const genres = new Set<string>()
      for (const show of shows) {
        for (const genre of show.genres ?? []) {
          if (genre) {
            genres.add(genre)
          }
        }
      }
      return [...genres].sort((a, b) => a.localeCompare(b))
    },
    { default: () => [] }
  )
}
