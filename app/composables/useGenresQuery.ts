import genresQuery from '~/graphql/genres.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { BASELINE_VARIANT } from '~/utils/contentVariant'
import type { RawNodeConnection, RawShow } from '~/types/compose'

// Genre list for the catalogue filter, derived from the shows' genre arrays
// (the schema has no dedicated genres query). Applies the same locale → baseline
// fallback as the catalogue so the filter isn't empty under a locale that has
// no content yet.
export function useGenresQuery(locale: () => string) {
  return useAsyncData<string[]>(
    () => `genres:${locale()}`,
    async () => {
      const fetchFor = async (variant: string) => {
        const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(
          genresQuery,
          { where: { show: { variant } } }
        )
        return (res.tvshow_collection.items ?? []).filter((s): s is RawShow => !!s)
      }

      let shows = await fetchFor(locale())
      if (shows.length === 0 && locale() !== BASELINE_VARIANT) {
        shows = await fetchFor(BASELINE_VARIANT)
      }

      const genres = new Set<string>()
      for (const show of shows) {
        for (const genre of show.properties?.genres ?? []) {
          if (genre) {
            genres.add(genre)
          }
        }
      }
      return [...genres].sort((a, b) => a.localeCompare(b))
    },
    { watch: [locale], default: () => [] }
  )
}
