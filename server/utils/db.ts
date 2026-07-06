import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from '../database/schema'

export function useDb(event: H3Event) {
  const d1 = event.context.cloudflare?.env?.DB
  if (!d1) {
    throw createError({ statusCode: 500, statusMessage: 'D1 binding "DB" is not available.' })
  }
  return drizzle(d1, { schema })
}
