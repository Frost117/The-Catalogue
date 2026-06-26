// Raw response shapes for the Umbraco Compose GraphQL endpoint, as actually
// returned by the live schema (introspected, not assumed). Everything the UI
// consumes is mapped from these into the domain types in ~/types/show via
// ~/utils/mapShow — keep this file as the literal API contract, and the domain
// types as the clean shape components depend on.

export interface RawRichText {
  markup: string | null
}

export interface RawRoute {
  path: string | null
}

export interface RawCastMemberProperties {
  personName: string | null
  characterName: string | null
  personImage: string | null
  characterImage: string | null
}

export interface RawCastMember {
  id: string
  properties: RawCastMemberProperties | null
}

export interface RawBlockItem {
  content: RawCastMember | null
}

export interface RawShowProperties {
  image: string | null
  rating: number | null
  status: string | null
  network: string | null
  premiered: string | null
  genres: (string | null)[] | null
  summary: RawRichText | null
  cast: { items: (RawBlockItem | null)[] | null } | null
}

export interface RawShow {
  id: string
  variant: string | null
  name: string | null
  route: RawRoute | null
  properties: RawShowProperties | null
}

export interface RawEpisodeProperties {
  season: number | null
  episodeNumber: number | null
  summary: RawRichText | null
}

export interface RawEpisode {
  id: string
  name: string | null
  route: RawRoute | null
  properties: RawEpisodeProperties | null
}

export interface RawPageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

// `tvshow_collection` is a Relay-style connection. `items` is a flat list of
// Node (interface) values; queries narrow it with `... on Show` / `... on
// Episode` inline fragments, so callers parameterise T accordingly.
export interface RawNodeConnection<T> {
  items: (T | null)[] | null
  pageInfo?: RawPageInfo
}
