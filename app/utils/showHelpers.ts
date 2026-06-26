import type { Episode, SeasonGroup } from '~/types/show'

// TV Maze summaries arrive wrapped in HTML (e.g. "<p>…</p>"). Strip tags for
// safe plain-text rendering (card previews, meta descriptions).
export function stripHtml(input?: string | null): string {
  if (!input) {
    return ''
  }
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

// Round a 0–10 rating to one decimal for display; returns null when absent.
export function formatRating(rating?: number | null): string | null {
  if (rating === null || rating === undefined) {
    return null
  }
  return rating.toFixed(1)
}

// Extract the year from an ISO date string (e.g. "2014-01-11T00:00:00" → "2014")
// without timezone parsing; returns null when absent or malformed.
export function formatYear(isoDate?: string | null): string | null {
  const match = (isoDate ?? '').match(/^(\d{4})/)
  return match?.[1] ?? null
}

// Group a flat episode list into ordered seasons, episodes sorted within each.
export function groupEpisodesBySeason(episodes: Episode[]): SeasonGroup[] {
  const bySeason = new Map<number, Episode[]>()
  for (const episode of episodes) {
    const list = bySeason.get(episode.season) ?? []
    list.push(episode)
    bySeason.set(episode.season, list)
  }
  return [...bySeason.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, list]) => ({
      season,
      episodes: list.sort((a, b) => a.number - b.number)
    }))
}
