export interface Comment {
  id: string
  showId: string
  authorDisplayName: string
  rating: number // 1-5
  body: string
  createdAt: string // ISO string
}
