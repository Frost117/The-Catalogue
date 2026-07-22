// Raw response shapes for the Umbraco Compose GraphQL endpoint, as actually
// returned by the live schema (introspected, not assumed). Everything the UI
// consumes is mapped from these into the domain types in ~/types/show via
// ~/utils/mapShow — keep this file as the literal API contract, and the domain
// types as the clean shape components depend on.
//
// Schema shape (third-env): show / episode / cast are sibling nodes in a single
// `tvshow_collection`, keyed by namespaced ids (`show-{id}`, `episode-{id}`,
// `cast-{personId}-{characterId}`). There is no `route`/slug and no per-`variant`
// node — `variant` is always null. Localization is inline per field: `Show.name`,
// `Episode.name`, and both `summary` fields are translated (each a { en, da, vi }
// object); cast names (person/character) are shared, not localized. Episodes and
// cast link back to their show via the numeric `tvShowId`.

// Localized rich-text: TV Maze HTML markup per locale (strip before rendering).
export interface RawLocalizedText {
  en: string | null
  da: string | null
  vi: string | null
}

export interface RawImage {
  medium: string | null
  original: string | null
}

export interface RawShowRating {
  average: number | null
}

export interface RawShowNetwork {
  name: string | null
}

export interface RawShow {
  id: string
  // Localized (a live schema change made this a { en, da, vi } object,
  // matching `summary`) — resolve with resolveLocalized().
  name: RawLocalizedText | null
  genres: (string | null)[] | null
  status: string | null
  premiered: string | null
  network: RawShowNetwork | null
  image: RawImage | null
  rating: RawShowRating | null
  summary: RawLocalizedText | null
}

export interface RawEpisode {
  id: string
  // Localized (same live schema change as Show.name) — resolve with
  // resolveLocalized().
  name: RawLocalizedText | null
  // `season` / `number` are GraphQL Decimals — coerce with Number() when mapping.
  season: number | null
  number: number | null
  summary: RawLocalizedText | null
}

export interface RawCastParty {
  name: string | null
  image: RawImage | null
}

export interface RawCast {
  id: string
  person: RawCastParty | null
  character: RawCastParty | null
}

export interface RawComment {
  id: string
  createdAt: string | null
  memberName: string | null
  // GraphQL Decimal, so coerce with Number() when mapping.
  showId: number | string | null
  text: string | null
}

export interface RawPageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

// `tvshow_collection` is a Relay-style connection. `items` is a flat list of
// Node (interface) values; queries narrow it with `... on Show` / `... on
// Episode` / `... on Cast` inline fragments, so callers parameterise T.
export interface RawNodeConnection<T> {
  items: (T | null)[] | null
  pageInfo?: RawPageInfo
}
