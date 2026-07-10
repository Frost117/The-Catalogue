import seasonCountQuery from '~/graphql/seasonCount.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import type { RawNodeConnection, RawEpisode } from '~/types/compose'

// Number of seasons for a show. Episodes are separate nodes linked by numeric
// tvShowId; TV Maze seasons are contiguous from 1, so the highest season number
// is the count. Not part of the catalogue payload, so this is fetched lazily
// (immediate: false) — the catalogue popover calls ensureLoaded() on first open,
// which guards against repeat fetches and runs execute() once — and cached per
// show by the useAsyncData key.
export function useSeasonCount(tvShowId: number) {
  const seasonsRequested = ref(false)

  const result = useAsyncData<number | null>(
    `seasons:${tvShowId}`,
    async () => {
      const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawEpisode> }>(
        seasonCountQuery,
        { where: { episode: { tvShowId } } }
      )
      const top = (res.tvshow_collection.items ?? []).find((e): e is RawEpisode => !!e)
      const season = top?.season == null ? null : Number(top.season)
      return season && season > 0 ? season : null
    },
    { immediate: false, default: () => null }
  )

  function ensureLoaded() {
    if (!seasonsRequested.value && tvShowId >= 0) {
      seasonsRequested.value = true
      result.execute()
    }
  }

  return { ...result, ensureLoaded }
}
