import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // crypto.randomUUID(), generated app-side
  phone: text('phone').notNull().unique(), // E.164, e.g. +4512345678
  displayName: text('display_name').notNull(),
  // Umbraco Members id — nullable until the real adapter is implemented.
  // See server/utils/umbracoMembers.ts.
  umbracoMemberId: text('umbraco_member_id'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`)
})

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  showId: text('show_id').notNull(), // Compose node id, e.g. "show-1" == Show.id
  userId: text('user_id').notNull().references(() => users.id),
  // Denormalized snapshot of the author's display name at post time, so
  // historical comments render correctly even if the user later renames.
  authorDisplayName: text('author_display_name').notNull(),
  rating: integer('rating').notNull(), // 1-5, also enforced in the API route
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`)
})
