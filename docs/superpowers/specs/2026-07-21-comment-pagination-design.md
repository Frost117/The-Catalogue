# Comment pagination (FR-07) — design

## Goal

Resolve the two partially-fulfilled frontend requirements from `tv-shows-architecture.html`'s Requirements tab:

- **FR-07** (comments displayed, paginated, newest first) — currently displayed + newest-first, **not paginated** (single fetch of up to 50, no load-more). This doc designs the fix.
- **FR-02** (localized title) — **out of scope for this doc**, see below.

## FR-02 status: flagged, not planned

`Show.name` is a single shared scalar in the live Compose GraphQL schema, not a per-locale field like `summary`. There is no frontend code path to build until Compose exposes title as a localized field (the same `{ en, da, vi }` shape `summary`/`ShowName` briefly took on during the schema drift investigated earlier this session, before it was reverted). Building speculative frontend plumbing ahead of that field existing would repeat the exact mistake just corrected by removing the dormant `commentCount` passthrough — so this is intentionally left as a flagged backend dependency:

**Action needed:** whoever owns the Compose schema/collection config needs to add per-locale name fields (mirroring `summary`) and a migration/backfill for existing shows. No further tracking beyond this note is proposed here.

## FR-07: comment pagination

### Why this mirrors `useShowsQuery`

The comments connection (`tvshow_collection` filtered to `... on Comment`) is a Relay-style connection with `pageInfo { hasNextPage endCursor }`, identical in shape to the shows connection. `useShowsQuery.ts`'s cursor-pagination + "load more" pattern is the established precedent in this codebase and is reused directly rather than inventing a new pagination shape.

### Count semantics

There is no `totalCount` on this connection (same reason the catalogue has none). The comment count shown in the UI ("Jump to comments (N)" and the section header) reflects **comments loaded so far**, not a true total — exactly how `catalogue.resultsCount` already works (`shows.length`, not a grand total). This is a known, accepted limitation, not a bug to fix later.

### `app/graphql/comments.gql`

Add pagination support:

```graphql
query Comments($where: NodeFilterInput!, $first: Int!, $after: String) {
  tvshow_collection(
    first: $first
    after: $after
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
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

Update the header comment: remove the "no pagination UI exists yet ... does not select pageInfo" note (no longer true).

### `app/composables/useShowComments.ts`

**`COMMENTS_PAGE_SIZE`**: `50` → `20`.

**`fetchComments`** changes shape to match `useShowsQuery`'s `fetchPage`:

```ts
interface CommentsPage {
  items: Comment[]
  endCursor: string | null
  hasNextPage: boolean
}

export async function fetchComments(id: number, after: string | null = null): Promise<CommentsPage> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawComment> }>(
    commentsQuery,
    { where: { comment: { showId: id } }, first: COMMENTS_PAGE_SIZE, after }
  )
  const conn = res.tvshow_collection
  return {
    items: (conn.items ?? []).filter((c): c is RawComment => !!c).map(mapComment),
    endCursor: conn.pageInfo?.endCursor ?? null,
    hasNextPage: conn.pageInfo?.hasNextPage ?? false
  }
}
```

**`useShowComments`** gains the same `appended`/`loadingMore`/`hasMore`/`loadMore()` shape as `useShowsQuery`:

```ts
const { data, status, error, refresh } = useAsyncData<CommentsPage>(
  () => `comments:${showId() ?? 'none'}`,
  async () => {
    // Reset here (not via `watch(data, ...)`) because post()'s optimistic
    // prepend below mutates `data.value` directly — a blanket watch would
    // wrongly wipe already-loaded extra pages every time a comment is
    // posted. This only resets on an actual re-fetch: a show change or an
    // explicit refresh().
    appended.value = null
    const id = showId()
    return id == null ? { items: [], endCursor: null, hasNextPage: false } : fetchComments(id)
  },
  { watch: [showId] }
)

const appended = ref<{ items: Comment[], cursor: string | null, hasNextPage: boolean } | null>(null)
const loadingMore = ref(false)

const comments = computed<Comment[]>(() => [
  ...(data.value?.items ?? []),
  ...(appended.value?.items ?? [])
])
const count = computed(() => comments.value.length)
const cursor = computed(() => appended.value ? appended.value.cursor : (data.value?.endCursor ?? null))
const hasMore = computed(() => appended.value ? appended.value.hasNextPage : (data.value?.hasNextPage ?? false))

async function loadMore() {
  const id = showId()
  if (!hasMore.value || loadingMore.value || !cursor.value || id == null) {
    return
  }
  loadingMore.value = true
  try {
    const page = await fetchComments(id, cursor.value)
    appended.value = {
      items: [...(appended.value?.items ?? []), ...page.items],
      cursor: page.endCursor,
      hasNextPage: page.hasNextPage
    }
  } finally {
    loadingMore.value = false
  }
}
```

`appended` must be declared before the `useAsyncData` call (the handler closure references it), so the ref declaration moves above it — a small reordering from the current file layout.

**`post()`**'s optimistic prepend updates to the new shape, prepending only into the first page:

```ts
data.value = {
  items: [optimistic, ...(data.value?.items ?? [])],
  endCursor: data.value?.endCursor ?? null,
  hasNextPage: data.value?.hasNextPage ?? false
}
```

**Return object** gains `hasMore`, `loadMore`, `loadingMore` alongside the existing `comments`, `count`, etc.

### `app/pages/shows/[slug].vue`

Destructure `hasMore`, `loadMore`, `loadingMore` from `useShowComments()`. Add a "load more" button after the comment `<ul>`, matching the catalogue's existing pattern:

```html
<div
  v-if="hasMore"
  class="mt-4 flex justify-center"
>
  <UButton
    color="neutral"
    variant="soft"
    :loading="loadingMore"
    :label="t('comments.loadMore')"
    @click="loadMore"
  />
</div>
```

### i18n

New key `comments.loadMore` in `en.json` ("Load more"), `da.json` ("Indlæs flere" — matching `catalogue.loadMore`'s existing Danish translation), `vi.json` ("Tải thêm" — matching `catalogue.loadMore`'s existing Vietnamese translation).

### Testing

`test/nuxt/useShowComments.test.ts`:
- Update the two existing `fetchComments` tests for the new `{ items, endCursor, hasNextPage }` return shape (currently asserts a bare array).
- Add pagination tests mirroring `useShowsQuery.test.ts`'s `useShowsQuery pagination` describe block: `loadMore()` appends results and advances the cursor with the fixed page size; no fetch when `hasMore` is false.
- Add one test for the subtlety this design is built around: posting a comment while `appended` already holds a loaded second page does **not** clear `appended` (i.e. `comments.value` still contains the appended items after `post()`).

## Out of scope

- FR-02 (title localization) — flagged above, no code.
- Any backend/Compose changes.
- Sort order for comments (still fixed newest-first, no user control — unrelated to pagination).
