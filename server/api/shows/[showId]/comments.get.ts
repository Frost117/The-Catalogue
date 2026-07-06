import { desc, eq } from 'drizzle-orm'
import { comments } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'showId')
  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'showId is required.' })
  }

  const db = useDb(event)
  const rows = await db.select().from(comments).where(eq(comments.showId, showId)).orderBy(desc(comments.createdAt))

  return { items: rows.map(mapComment) }
})
