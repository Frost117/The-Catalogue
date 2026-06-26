// Domain types the UI depends on. These are the clean, stable shape that
// components consume; they are mapped from the raw Compose responses
// (~/types/compose) by ~/utils/mapShow. Keeping this contract separate from the
// raw schema means a schema tweak only ripples through the mapper, not the
// components.

export interface CastMember {
  id: string
  name: string
  character?: string | null
  image?: string | null
}

export interface Episode {
  id: string
  season: number
  number: number
  name: string
  // Raw HTML markup (RichText); strip with stripHtml() before rendering.
  summary?: string | null
}

export interface ShowSummary {
  id: string
  // Locale-specific slug, derived from the content node's route path.
  slug: string
  title: string
  // Raw HTML markup (RichText); strip with stripHtml() before rendering.
  summary?: string | null
  image?: string | null
  rating?: number | null
  genres: string[]
}

export interface Show extends ShowSummary {
  status?: string | null
  network?: string | null
  premiered?: string | null
  cast: CastMember[]
  episodes: Episode[]
}

export interface SeasonGroup {
  season: number
  episodes: Episode[]
}
