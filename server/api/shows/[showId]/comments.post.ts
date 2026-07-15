import { comments } from '../../../database/schema'

interface Body {
  rating: number
  body: string
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const showId = getRouterParam(event, 'showId')
  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'showId is required.' })
  }

  const body = await readBody<Body>(event)
  if (!Number.isInteger(body?.rating) || body.rating < 1 || body.rating > 5) {
    throw createError({ statusCode: 400, statusMessage: 'Rating must be an integer from 1 to 5.' })
  }
  const text = body.body?.trim()
  if (!text || text.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'Comment must be 1-2000 characters.' })
  }

  const db = useDb(event)
  const row = {
    id: crypto.randomUUID(),
    showId,
    userId: session.user.id,
    authorDisplayName: session.user.username,
    rating: body.rating,
    body: text,
    createdAt: Math.floor(Date.now() / 1000)
  }
  await db.insert(comments).values(row)

  return mapComment(row)
})
