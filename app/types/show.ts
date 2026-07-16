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
  // URL slug: readable name + numeric id (e.g. "under-the-dome-1"), built by
  // ~/utils/mapShow.showSlug so the detail page can resolve it by exact id.
  slug: string
  title: string
  // Localized summary as raw TV Maze HTML markup; strip with stripHtml() before
  // rendering.
  summary?: string | null
  // Poster URL (the raw image's `medium`, falling back to `original`).
  image?: string | null
  rating?: number | null
  genres: string[]
  // Number of comments on this show, shown in the catalogue card footer.
  // Populated from Compose once the comments read lands (null until then).
  commentCount?: number | null
}

export interface Comment {
  id: string
  // TV Maze numeric show id the comment belongs to.
  showId: number
  // Display name of the author. The phone-OTP login has no display name, so
  // this is the member's E.164 phone (AuthUser.username).
  author: string
  body: string
  // ISO 8601 timestamp.
  createdAt: string
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
