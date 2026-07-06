import type { Comment } from '~/types/comment'

export function mapComment(row: {
  id: string
  showId: string
  authorDisplayName: string
  rating: number
  body: string
  createdAt: number
}): Comment {
  return {
    id: row.id,
    showId: row.showId,
    authorDisplayName: row.authorDisplayName,
    rating: row.rating,
    body: row.body,
    createdAt: new Date(row.createdAt * 1000).toISOString()
  }
}
