# Wire up live comment reads — design

## Goal

Replace the stubbed read path in `useShowComments` with a real Compose
GraphQL query, now that the backend exposes comments for reading. The write
path (`/api/comments` proxy → Umbraco) is unaffected.

## Schema (confirmed live via introspection)

Introspected against the local dev server's `/api/graphql` proxy (real
`GQL_HOST`, real credentials from `.env`) — not assumed, matching how every
other query in this repo (`show.gql`, `shows.gql`, etc.) was built.

`Comment` is a node type living inside `tvshow_collection`, the same pattern
as `Show`/`Episode`/`Cast` (no separate top-level query field — `Query` only
exposes `tvshow_collection`):

```
type Comment {
  id: ID!
  variant: String
  createdAt: String
  memberId: String
  memberName: String
  showId: Decimal
  text: String
}
```

Filtering nests under `NodeFilterInput.comment: CommentNodeFilterInput`
(confirmed field: `showId: Decimal`). Sorting nests under
`NodeSortOrderInput.comment: CommentNodeSortOrderInput` — and unlike
`shows.gql`'s `orderBy` (which needed a `__ORDER_BY__` string-substitution
placeholder because its input type name was unconfirmed), `NodeSortOrderInput`
here is a confirmed real type name, so `orderBy` can be a plain inline literal
in the query text with no substitution needed — the order never varies
(always newest-first).

Verified against real data already in the instance (4 existing comments
posted 2026-07-15 → 2026-07-17): `memberName` is the E.164 phone (e.g.
`"+84971026949"`), confirming it maps directly to the domain `Comment.author`
field, exactly as the existing doc comment in `types/show.ts` already assumed.

Also checked and ruled out: `Show` has no `commentCount` field yet (its full
field list was introspected — not present). `RawShow.commentCount` /
`mapShowSummary`'s existing passthrough is untouched; this task is scoped to
the comment list only, not the catalogue card counts.

## Query — `app/graphql/comments.gql` (new file)

```graphql
# Comments for a single show, newest first. `Comment` is a sibling node
# in `tvshow_collection` (same pattern as show.gql/episodes.gql/cast.gql),
# filtered by `comment.showId`. No pagination UI exists yet in the show
# page, so this fetches one page of up to COMMENTS_PAGE_SIZE and does not
# select pageInfo — add it if/when a "load more" affordance is built.
query Comments($where: NodeFilterInput!, $first: Int!) {
  tvshow_collection(
    first: $first
    where: $where
    orderBy: [{ comment: { createdAt: DESC } }]
  ) {
    items {
      ... on Comment {
        id
        createdAt
        memberName
        showId
        text
      }
    }
  }
}
```

## Types — `app/types/compose.ts`

Add, next to `RawCast`/`RawEpisode`:

```ts
export interface RawComment {
  id: string
  createdAt: string | null
  memberName: string | null
  // GraphQL Decimal, so coerce with Number() when mapping.
  showId: number | string | null
  text: string | null
}
```

## Mapper — `app/utils/mapShow.ts`

Add `mapComment`, following the existing `mapCast`/`mapEpisode` shape:

```ts
export function mapComment(raw: RawComment): Comment {
  return {
    id: raw.id,
    showId: toNum(raw.showId) ?? 0,
    author: raw.memberName ?? '',
    body: raw.text ?? '',
    createdAt: raw.createdAt ?? ''
  }
}
```

## Composable — `app/composables/useShowComments.ts`

Replace the stubbed fetcher body with a real request, following
`useShowsQuery`'s `fetchPage` pattern:

```ts
const COMMENTS_PAGE_SIZE = 50

const { data, status, error, refresh } = useAsyncData<Comment[]>(
  () => `comments:${showId() ?? 'none'}`,
  async () => {
    const id = showId()
    if (id == null) {
      return []
    }
    const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawComment> }>(
      commentsQuery,
      { where: { comment: { showId: id } }, first: COMMENTS_PAGE_SIZE }
    )
    return (res.tvshow_collection.items ?? [])
      .filter((c): c is RawComment => !!c)
      .map(mapComment)
  },
  { watch: [showId] }
)
```

Everything downstream (`comments`, `count`, `status`, `error`, `refresh`) is
already consumed correctly by `pages/shows/[slug].vue` — no view changes.

**Write path is unchanged.** `post()` keeps its optimistic local prepend
as-is. Read-after-write latency against Compose hasn't been verified (the
comments found via introspection were days old), so the safer, smaller
change is to leave the existing optimistic-entry bridge in place rather than
switch to `refresh()`-after-post.

Update the file's header comment (currently describing the stub) to
describe the live read instead.

## Testing

- `test/unit/mapShow.test.ts`: add a `mapComment` describe block (raw → domain
  mapping, `showId` decimal-string coercion, null-field defaults), mirroring
  the existing `mapCast`/`mapEpisode` tests.
- `test/nuxt/useShowComments.test.ts` (new file, or extend if one exists):
  mock `gqlRequest` and `useAsyncData` the same way
  `test/nuxt/useShowsQuery.test.ts` does, and assert:
  - the query is called with `{ where: { comment: { showId: <id> } }, first: COMMENTS_PAGE_SIZE }`
  - raw items map to the domain `Comment` shape
  - `showId() == null` short-circuits to `[]` without calling `gqlRequest`

## Out of scope

- Pagination / "load more" for comments (no UI affordance exists today).
- Catalogue-wide `commentCount` (still dormant — `Show` has no such field
  live yet).
- Changing the write path's optimistic-prepend behavior.
