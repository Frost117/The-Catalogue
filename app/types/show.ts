// Domain types for TV show content returned by the Compose GraphQL endpoint.
// These mirror the assumed schema shape in app/graphql/*.gql. Once the live
// schema is introspected (codegen), these can be replaced by the generated
// types — keep them as the contract used across components until then.

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
  summary?: string | null
}

export interface ShowSummary {
  id: string
  slug: string
  title: string
  summary?: string | null
  image?: string | null
  rating?: number | null
  genres: string[]
}

export interface Show extends ShowSummary {
  cast: CastMember[]
  episodes: Episode[]
}

export interface ShowsResult {
  items: ShowSummary[]
  total: number
  page: number
  pageSize: number
}

export interface SeasonGroup {
  season: number
  episodes: Episode[]
}
