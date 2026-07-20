# Wire up live comment reads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stubbed read path in `useShowComments` with a real Compose GraphQL query against the now-live `Comment` node type, so the show detail page's comment list shows real data instead of only session-local optimistic posts.

**Architecture:** `Comment` is a sibling node inside `tvshow_collection` (same pattern as `Show`/`Episode`/`Cast`), filtered by `comment.showId` and sorted `comment.createdAt DESC`. A new `RawComment` raw type and `mapComment` mapper convert it to the existing domain `Comment` shape; a new exported `fetchComments(id)` function in `useShowComments.ts` issues the query and is called from the composable's `useAsyncData` handler.

**Tech Stack:** Nuxt 4, TypeScript, Compose GraphQL (via the same-origin `/api/graphql` proxy and `gqlRequest` helper), Vitest (`@nuxt/test-utils` nuxt project + plain node "unit" project).

## Global Constraints

- Raw Compose types live in `app/types/compose.ts` and describe only the confirmed live schema (introspected, not assumed) — never invent fields.
- Domain types (`app/types/show.ts`) and components never see raw types directly; all conversion happens in `app/utils/mapShow.ts`.
- GraphQL Decimal fields arrive as `number | string` and must be coerced with the existing `toNum()` helper.
- `.gql` files are imported with `?raw` and documented with a header comment explaining the schema shape and any non-obvious query decisions (see `app/graphql/shows.gql` for the existing style).
- The write path in `useShowComments.ts` (`post()` / `submitComment()`) must not change — keep its optimistic local prepend exactly as-is.
- No pagination/"load more" UI for comments in this change — fetch a single page of up to `COMMENTS_PAGE_SIZE` and do not select `pageInfo`.

---

### Task 1: `RawComment` type + `mapComment` mapper

**Files:**
- Modify: `app/types/compose.ts` (add `RawComment` after `RawCast`, before `RawPageInfo`)
- Modify: `app/utils/mapShow.ts` (add `mapComment`, update the two `import type` lines at the top)
- Test: `test/unit/mapShow.test.ts` (add a `mapComment` describe block)

**Interfaces:**
- Consumes: `toNum()` (already defined in `app/utils/mapShow.ts`), `Comment` domain type (already defined in `app/types/show.ts:41-51`)
- Produces: `RawComment` (raw type), `mapComment(raw: RawComment): Comment` — both consumed by Task 2

- [ ] **Step 1: Write the failing test**

Add to `test/unit/mapShow.test.ts`, importing `mapComment` in the existing import block at the top of the file (change line 2-11's import to include `mapComment`) and `RawComment` in the existing `import type` from `'../../app/types/compose'` (line 12):

```ts
describe('mapComment', () => {
  const raw: RawComment = {
    id: 'c1',
    createdAt: '2026-07-15T10:08:20.000Z',
    memberName: '+84971026949',
    showId: 1,
    text: 'Test comment ne'
  }

  it('maps a raw comment to the domain shape', () => {
    expect(mapComment(raw)).toEqual({
      id: 'c1',
      showId: 1,
      author: '+84971026949',
      body: 'Test comment ne',
      createdAt: '2026-07-15T10:08:20.000Z'
    })
  })

  it('coerces a decimal-string showId', () => {
    expect(mapComment({ ...raw, showId: '5' as unknown as number }).showId).toBe(5)
  })

  it('defaults missing author/body/createdAt', () => {
    const mapped = mapComment({ ...raw, memberName: null, text: null, createdAt: null })
    expect(mapped.author).toBe('')
    expect(mapped.body).toBe('')
    expect(mapped.createdAt).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/mapShow.test.ts`
Expected: FAIL — `mapComment` is not exported from `app/utils/mapShow.ts` (TypeScript/import error) and `RawComment` is not exported from `app/types/compose.ts`.

- [ ] **Step 3: Add `RawComment` to `app/types/compose.ts`**

Insert after the `RawCast` interface (after line 67, before the `RawPageInfo` interface):

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

- [ ] **Step 4: Add `mapComment` to `app/utils/mapShow.ts`**

Change the two `import type` lines at the top of the file:

```ts
import type { RawShow, RawEpisode, RawCast, RawComment, RawLocalizedText } from '~/types/compose'
import type { CastMember, Comment, Episode, Show, ShowSummary } from '~/types/show'
```

Add this function after `mapCast` (after line 87):

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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/unit/mapShow.test.ts`
Expected: PASS (all tests in the file, including the 3 new `mapComment` cases)

- [ ] **Step 6: Commit**

```bash
git add app/types/compose.ts app/utils/mapShow.ts test/unit/mapShow.test.ts
git commit -m "feat: add RawComment type and mapComment mapper"
```

---

### Task 2: Live `comments.gql` query + wire `useShowComments`

**Files:**
- Create: `app/graphql/comments.gql`
- Modify: `app/composables/useShowComments.ts`
- Test: `test/nuxt/useShowComments.test.ts` (new file)

**Interfaces:**
- Consumes: `mapComment(raw: RawComment): Comment` and `RawComment` (Task 1), `gqlRequest<T>(query, variables): Promise<T>` (`app/utils/gqlRequest.ts`), `RawNodeConnection<T>` (`app/types/compose.ts:77-80`)
- Produces: `fetchComments(id: number): Promise<Comment[]>` and `COMMENTS_PAGE_SIZE` (exported from `useShowComments.ts`, for the test to call directly — there's no other way to exercise the network call in isolation since `useAsyncData` is mocked in tests, matching how `useShowsQuery.test.ts` exercises `fetchPage` indirectly through `loadMore()`)

- [ ] **Step 1: Write the failing test**

Create `test/nuxt/useShowComments.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchComments, COMMENTS_PAGE_SIZE } from '~/composables/useShowComments'
import type { RawComment } from '~/types/compose'

// gqlRequest is the single network seam, same pattern as useShowsQuery.test.ts.
const gql = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('~/utils/gqlRequest', () => ({ gqlRequest: gql.requestMock }))

const raw = (over: Partial<RawComment> = {}): RawComment => ({
  id: 'c1',
  createdAt: '2026-07-15T10:08:20.000Z',
  memberName: '+84971026949',
  showId: 1,
  text: 'Test comment ne',
  ...over
})

beforeEach(() => {
  gql.requestMock.mockReset()
})

describe('fetchComments', () => {
  it('requests comments for a show, newest first, and maps them to the domain shape', async () => {
    gql.requestMock.mockResolvedValueOnce({ tvshow_collection: { items: [raw()] } })

    const comments = await fetchComments(1)

    expect(gql.requestMock).toHaveBeenCalledTimes(1)
    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toEqual({ where: { comment: { showId: 1 } }, first: COMMENTS_PAGE_SIZE })
    expect(comments).toEqual([
      { id: 'c1', showId: 1, author: '+84971026949', body: 'Test comment ne', createdAt: '2026-07-15T10:08:20.000Z' }
    ])
  })

  it('filters out null items and coerces a decimal-string showId', async () => {
    gql.requestMock.mockResolvedValueOnce({ tvshow_collection: { items: [null, raw({ showId: '5' })] } })

    const comments = await fetchComments(5)

    expect(comments).toHaveLength(1)
    expect(comments[0]!.showId).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/nuxt/useShowComments.test.ts`
Expected: FAIL — `fetchComments` and `COMMENTS_PAGE_SIZE` are not exported from `app/composables/useShowComments.ts`, and `app/graphql/comments.gql` does not exist yet.

- [ ] **Step 3: Create `app/graphql/comments.gql`**

```graphql
# Comments for a single show, newest first. `Comment` is a sibling node in
# `tvshow_collection` (same pattern as show.gql/episodes.gql/cast.gql, not a
# separate top-level query field), filtered by `comment.showId` and sorted
# by `comment.createdAt` — both confirmed via live introspection.
#
# Unlike shows.gql's `orderBy` (a string-substituted `__ORDER_BY__` literal,
# because its input type name was unconfirmed), `NodeSortOrderInput` here is
# a confirmed real type name and the order never varies, so `orderBy` is a
# plain inline literal.
#
# No pagination UI exists yet for comments, so this fetches a single page of
# up to $first and does not select pageInfo — add it if/when a "load more"
# affordance is built for the comment section.
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

- [ ] **Step 4: Wire `fetchComments` into `app/composables/useShowComments.ts`**

Replace lines 1-33 (the imports and the stubbed `useAsyncData` block, up through its closing `)`) with:

```ts
import { useAuth } from '~/composables/useAuth'
import commentsQuery from '~/graphql/comments.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapComment } from '~/utils/mapShow'
import type { Comment } from '~/types/show'
import type { RawComment, RawNodeConnection } from '~/types/compose'

export const COMMENTS_PAGE_SIZE = 50

// Owns the show page's comment section: the read (via Compose GraphQL,
// newest-first), the post form state + submit, and the small view helpers
// (date formatting, jump-to scroll). The view just binds what this returns.
//
// WRITE path forwards to the Umbraco backend via the same-origin /api/comments
// proxy (the member session cookie authenticates it), then optimistically
// prepends the new comment. That optimistic entry is kept even though the
// read path below is now live: read-after-write latency against Compose
// hasn't been verified, so the existing local-id bridge is the safer choice.

export async function fetchComments(id: number): Promise<Comment[]> {
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawComment> }>(
    commentsQuery,
    { where: { comment: { showId: id } }, first: COMMENTS_PAGE_SIZE }
  )
  return (res.tvshow_collection.items ?? [])
    .filter((c): c is RawComment => !!c)
    .map(mapComment)
}

export function useShowComments(showId: () => number | null) {
  const { user, loggedIn } = useAuth()
  const { locale } = useI18n()

  const { data, status, error, refresh } = useAsyncData<Comment[]>(
    () => `comments:${showId() ?? 'none'}`,
    async () => {
      const id = showId()
      return id == null ? [] : fetchComments(id)
    },
    { watch: [showId] }
  )
```

Leave everything from the original `const comments = computed(...)` line onward (currently lines 35-108) unchanged.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/nuxt/useShowComments.test.ts`
Expected: PASS (both `fetchComments` cases)

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: PASS — all existing suites (including `test/unit/mapShow.test.ts` from Task 1 and `test/nuxt/useShowsQuery.test.ts`) still pass alongside the two new files.

Run: `npm run typecheck`
Expected: PASS — no type errors introduced.

- [ ] **Step 7: Commit**

```bash
git add app/graphql/comments.gql app/composables/useShowComments.ts test/nuxt/useShowComments.test.ts
git commit -m "feat: read live comments via Compose GraphQL"
```

---

## Manual verification (not automated — do after Task 2)

The show detail page (`app/pages/shows/[slug].vue`) already binds `comments`/`count`/`status`/`error` from `useShowComments` with no changes needed. After Task 2, start the dev server (`npm run dev`) and visit a show known to have comments (e.g. `/shows/*-1`, `/shows/*-5`, `/shows/*-60`, or `/shows/*-167` — ids confirmed via introspection to already have comments in Compose) and confirm the real comments render, newest first.
