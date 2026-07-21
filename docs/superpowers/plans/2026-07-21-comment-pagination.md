# Comment Pagination (FR-07) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cursor-based "load more" pagination to the show detail page's comment section, so FR-07 ("comments displayed, paginated, newest first") is fully met instead of only displaying a single fixed-size page.

**Architecture:** Mirror `useShowsQuery.ts`'s existing cursor-pagination pattern (`appended` state + `hasMore`/`loadMore()`) inside `useShowComments.ts`. `fetchComments()` changes from returning a bare `Comment[]` to a `{ items, endCursor, hasNextPage }` page object, matching `useShowsQuery`'s `fetchPage`. The one deliberate deviation from that precedent: the "reset appended on refetch" logic lives inside the `useAsyncData` handler itself, not a `watch(data, ...)`, because `post()`'s optimistic prepend mutates `data.value` directly and a blanket watch would wrongly clear an already-loaded second page every time a comment is posted.

**Tech Stack:** Nuxt 4, TypeScript, Compose GraphQL (`gqlRequest` + `?raw` `.gql` imports), Vitest (`@nuxt/test-utils` nuxt project).

## Global Constraints

- There is no `totalCount` on the comments connection. The comment count shown in the UI reflects comments **loaded so far**, not a true total — same convention as `catalogue.resultsCount`. Do not attempt to fetch or display a true total.
- `COMMENTS_PAGE_SIZE` changes from `50` to `20`.
- The write path (`post()`/`submitComment()`) keeps its optimistic local prepend — do not switch to `refresh()`-after-post.
- Sort order for comments stays fixed newest-first (`orderBy: [{ comment: { createdAt: DESC } }]`) — no user-facing sort control.
- FR-02 (title localization) is out of scope for this plan entirely — it's a flagged backend dependency, not frontend work (see `docs/superpowers/specs/2026-07-21-comment-pagination-design.md`).

---

### Task 1: Paginated `fetchComments` + `useShowComments` wiring

**Files:**
- Modify: `app/graphql/comments.gql` (full file, 30 lines)
- Modify: `app/composables/useShowComments.ts` (full file, 117 lines)
- Test: `test/nuxt/useShowComments.test.ts` (full file, 45 lines)

**Interfaces:**
- Consumes: `gqlRequest<T>(query, variables): Promise<T>` (`app/utils/gqlRequest.ts`), `mapComment(raw: RawComment): Comment` (`app/utils/mapShow.ts`), `RawComment`/`RawNodeConnection<T>` (`app/types/compose.ts`), `useAuth()` (`app/composables/useAuth.ts`)
- Produces: `fetchComments(id: number, after?: string | null): Promise<CommentsPage>` where `CommentsPage = { items: Comment[], endCursor: string | null, hasNextPage: boolean }`; `COMMENTS_PAGE_SIZE = 20`; `useShowComments()` return object gains `hasMore: ComputedRef<boolean>`, `loadMore: () => Promise<void>`, `loadingMore: Ref<boolean>` alongside its existing `comments`, `count`, `status`, `error`, `refresh`, `loggedIn`, `commentBody`, `posting`, `postError`, `submitComment`, `formatCommentDate`, `scrollToComments` — all consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `test/nuxt/useShowComments.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { fetchComments, useShowComments, COMMENTS_PAGE_SIZE } from '~/composables/useShowComments'
import type { RawComment } from '~/types/compose'
import type { Comment } from '~/types/show'

// gqlRequest is the single network seam, same pattern as useShowsQuery.test.ts.
const gql = vi.hoisted(() => ({ requestMock: vi.fn() }))
vi.mock('~/utils/gqlRequest', () => ({ gqlRequest: gql.requestMock }))

// $fetch is the write-path network seam (post() posts directly to it).
const fetchMock = vi.hoisted(() => vi.fn())
mockNuxtImport('$fetch', () => fetchMock)
mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key, locale: ref('en') }))

const raw = (over: Partial<RawComment> = {}): RawComment => ({
  id: 'c1',
  createdAt: '2026-07-15T10:08:20.000Z',
  memberName: '+84971026949',
  showId: 1,
  text: 'Test comment ne',
  ...over
})

const comment = (id: string): Comment => ({
  id,
  showId: 1,
  author: '+84971026949',
  body: `body-${id}`,
  createdAt: '2026-07-15T10:08:20.000Z'
})

beforeEach(() => {
  gql.requestMock.mockReset()
  fetchMock.mockReset()
})

describe('fetchComments', () => {
  it('requests the first page, newest first, and maps items to the domain shape', async () => {
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [raw()], pageInfo: { hasNextPage: false, endCursor: null } }
    })

    const page = await fetchComments(1)

    expect(gql.requestMock).toHaveBeenCalledTimes(1)
    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toEqual({ where: { comment: { showId: 1 } }, first: COMMENTS_PAGE_SIZE, after: null })
    expect(page).toEqual({
      items: [{ id: 'c1', showId: 1, author: '+84971026949', body: 'Test comment ne', createdAt: '2026-07-15T10:08:20.000Z' }],
      endCursor: null,
      hasNextPage: false
    })
  })

  it('passes an explicit cursor through as `after`', async () => {
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [], pageInfo: { hasNextPage: false, endCursor: null } }
    })

    await fetchComments(1, 'cur1')

    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toMatchObject({ after: 'cur1' })
  })

  it('filters out null items and coerces a decimal-string showId', async () => {
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [null, raw({ showId: '5' })], pageInfo: { hasNextPage: true, endCursor: 'cur2' } }
    })

    const page = await fetchComments(5)

    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.showId).toBe(5)
    expect(page.hasNextPage).toBe(true)
    expect(page.endCursor).toBe('cur2')
  })
})

// --- useShowComments pagination + optimistic post interaction ---

const asyncState = vi.hoisted(() => ({ data: null as unknown }))
mockNuxtImport('useAsyncData', () => {
  return (_key: string, _handler: unknown) => ({
    data: asyncState.data,
    status: ref('success'),
    error: ref(null),
    refresh: vi.fn()
  })
})

describe('useShowComments pagination', () => {
  it('loadMore appends results and advances the cursor with the fixed page size', async () => {
    asyncState.data = ref({ items: [comment('c1')], endCursor: 'cur1', hasNextPage: true })
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [raw({ id: 'c2' })], pageInfo: { hasNextPage: false, endCursor: 'cur2' } }
    })

    const c = useShowComments(() => 1)
    expect(c.comments.value.map(x => x.id)).toEqual(['c1'])
    expect(c.count.value).toBe(1)
    expect(c.hasMore.value).toBe(true)

    await c.loadMore()

    expect(c.comments.value.map(x => x.id)).toEqual(['c1', 'c2'])
    expect(c.count.value).toBe(2)
    expect(c.hasMore.value).toBe(false)
    expect(gql.requestMock).toHaveBeenCalledTimes(1)
    const [, variables] = gql.requestMock.mock.calls[0]!
    expect(variables).toMatchObject({ after: 'cur1', first: COMMENTS_PAGE_SIZE })
  })

  it('does not fetch when there is no next page', async () => {
    asyncState.data = ref({ items: [comment('c1')], endCursor: null, hasNextPage: false })
    const c = useShowComments(() => 1)

    await c.loadMore()

    expect(gql.requestMock).not.toHaveBeenCalled()
    expect(c.loadingMore.value).toBe(false)
  })

  it('posting a comment while a second page is loaded keeps the appended page', async () => {
    asyncState.data = ref({ items: [comment('c1')], endCursor: 'cur1', hasNextPage: true })
    gql.requestMock.mockResolvedValueOnce({
      tvshow_collection: { items: [raw({ id: 'c2' })], pageInfo: { hasNextPage: false, endCursor: 'cur2' } }
    })
    fetchMock.mockResolvedValueOnce({})

    const c = useShowComments(() => 1)
    await c.loadMore()
    expect(c.comments.value.map(x => x.id)).toEqual(['c1', 'c2'])

    c.commentBody.value = 'new comment'
    await c.submitComment()

    // The optimistic comment is prepended to the first page; the
    // already-loaded second page (c2) must still be present afterward.
    expect(c.comments.value.map(x => x.id).slice(1)).toEqual(['c1', 'c2'])
    expect(fetchMock).toHaveBeenCalledWith('/api/comments', { method: 'POST', body: { showId: 1, comment: 'new comment' } })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/nuxt/useShowComments.test.ts`
Expected: FAIL — `fetchComments` still returns a bare `Comment[]` (not `{ items, endCursor, hasNextPage }`), so `variables` won't include `after`, and `useShowComments` doesn't export `hasMore`/`loadMore`/`loadingMore` yet (`c.loadMore is not a function`).

- [ ] **Step 3: Rewrite `app/graphql/comments.gql`**

Replace the full file contents with:

```graphql
# Comments for a single show, newest first, paginated. `Comment` is a sibling
# node in `tvshow_collection` (same pattern as show.gql/episodes.gql/cast.gql,
# not a separate top-level query field), filtered by `comment.showId` and
# sorted by `comment.createdAt` — both confirmed via live introspection.
#
# `orderBy` is a plain inline literal since `NodeSortOrderInput` is a
# confirmed real type name and the order never varies (no user-facing sort
# control for comments).
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

- [ ] **Step 4: Rewrite `app/composables/useShowComments.ts`**

Replace the full file contents with:

```ts
import { useAuth } from '~/composables/useAuth'
import commentsQuery from '~/graphql/comments.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapComment } from '~/utils/mapShow'
import type { Comment } from '~/types/show'
import type { RawComment, RawNodeConnection } from '~/types/compose'

export const COMMENTS_PAGE_SIZE = 20

export interface CommentsPage {
  items: Comment[]
  endCursor: string | null
  hasNextPage: boolean
}

// Owns the show page's comment section: the read (via Compose GraphQL,
// newest-first, cursor-paginated with a "load more" affordance), the post
// form state + submit, and the small view helpers (date formatting, jump-to
// scroll). The view just binds what this returns.
//
// WRITE path forwards to the Umbraco backend via the same-origin /api/comments
// proxy (the member session cookie authenticates it), then optimistically
// prepends the new comment into the first page. That optimistic entry is kept
// even though the read path below is now live: read-after-write latency
// against Compose hasn't been verified, so the existing local-id bridge is
// the safer choice.

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

export function useShowComments(showId: () => number | null) {
  const { user, loggedIn } = useAuth()
  const { locale } = useI18n()

  // State for pages loaded after the first via "load more". Declared before
  // the useAsyncData call below because its handler resets it.
  const appended = ref<{ items: Comment[], cursor: string | null, hasNextPage: boolean } | null>(null)
  const loadingMore = ref(false)

  const { data, status, error, refresh } = useAsyncData<CommentsPage>(
    () => `comments:${showId() ?? 'none'}`,
    async () => {
      // Reset here — not via `watch(data, ...)` — because post()'s optimistic
      // prepend below mutates `data.value` directly. A blanket watch on
      // `data` would wrongly wipe an already-loaded second page every time a
      // comment is posted. This only resets on an actual re-fetch: a show
      // change or an explicit refresh().
      appended.value = null
      const id = showId()
      return id == null ? { items: [], endCursor: null, hasNextPage: false } : fetchComments(id)
    },
    { watch: [showId] }
  )

  const comments = computed<Comment[]>(() => [
    ...(data.value?.items ?? []),
    ...(appended.value?.items ?? [])
  ])
  const count = computed(() => comments.value.length)
  const cursor = computed(() => (appended.value ? appended.value.cursor : (data.value?.endCursor ?? null)))
  const hasMore = computed(() => (appended.value ? appended.value.hasNextPage : (data.value?.hasNextPage ?? false)))

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

  // Post form state.
  const commentBody = ref('')
  const posting = ref(false)
  const postError = ref(false)

  async function post(text: string) {
    const id = showId()
    if (id == null) {
      throw new Error('Cannot post a comment without a show id.')
    }
    // Body matches the backend's PostCommentRequest(int ShowId, string Comment):
    // the field is `comment`, not `text` (ASP.NET binds by property name). The
    // member is identified server-side from the session cookie, not the body.
    await $fetch('/api/comments', {
      method: 'POST',
      body: { showId: id, comment: text }
    })
    // Optimistic prepend into the first page — the read path can't fetch this
    // comment back yet.
    const optimistic: Comment = {
      id: `local-${Date.now()}`,
      showId: id,
      author: user.value?.username ?? '',
      body: text,
      createdAt: new Date().toISOString()
    }
    data.value = {
      items: [optimistic, ...(data.value?.items ?? [])],
      endCursor: data.value?.endCursor ?? null,
      hasNextPage: data.value?.hasNextPage ?? false
    }
  }

  async function submitComment() {
    const text = commentBody.value.trim()
    if (!text || posting.value) {
      return
    }
    posting.value = true
    postError.value = false
    try {
      await post(text)
      commentBody.value = ''
    } catch {
      postError.value = true
    } finally {
      posting.value = false
    }
  }

  function formatCommentDate(iso: string): string {
    const date = new Date(iso)
    return Number.isNaN(date.getTime())
      ? ''
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  }

  function scrollToComments() {
    document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })
  }

  return {
    comments,
    count,
    hasMore,
    loadMore,
    loadingMore,
    status,
    error,
    refresh,
    loggedIn,
    commentBody,
    posting,
    postError,
    submitComment,
    formatCommentDate,
    scrollToComments
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/nuxt/useShowComments.test.ts`
Expected: PASS (all 6 tests). Note: this suite has an occasional cold-start Nuxt setup hook timeout on the *first* run of the session (unrelated flakiness) — if you see only that failure, re-run once.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npx vitest run`
Expected: PASS — all files (existing suites unaffected).

Run: `npm run typecheck`
Expected: PASS, except one pre-existing unrelated error in `app/app.vue` (`useHead` type mismatch) that predates this work.

- [ ] **Step 7: Commit**

```bash
git add app/graphql/comments.gql app/composables/useShowComments.ts test/nuxt/useShowComments.test.ts
git commit -m "feat: paginate comment reads with a load-more cursor"
```

---

### Task 2: "Load more" UI + i18n

**Files:**
- Modify: `app/pages/shows/[slug].vue:50-60` (composable destructure) and `:338-356` (comment list template)
- Modify: `i18n/locales/en.json:66-77`, `i18n/locales/da.json:66-77`, `i18n/locales/vi.json:66-77`

**Interfaces:**
- Consumes: `hasMore: ComputedRef<boolean>`, `loadMore: () => Promise<void>`, `loadingMore: Ref<boolean>` (Task 1's `useShowComments` return object)
- Produces: nothing further consumed — this is the final UI layer for FR-07.

- [ ] **Step 1: Add the `loadMore` i18n key**

In `i18n/locales/en.json`, change:

```json
    "count": "{count} comment | {count} comments",
    "jump": "Jump to comments"
  }
}
```

to:

```json
    "count": "{count} comment | {count} comments",
    "jump": "Jump to comments",
    "loadMore": "Load more"
  }
}
```

In `i18n/locales/da.json`, change:

```json
    "count": "{count} kommentar | {count} kommentarer",
    "jump": "Gå til kommentarer"
  }
}
```

to:

```json
    "count": "{count} kommentar | {count} kommentarer",
    "jump": "Gå til kommentarer",
    "loadMore": "Indlæs flere"
  }
}
```

In `i18n/locales/vi.json`, change:

```json
    "count": "{count} bình luận",
    "jump": "Đến phần bình luận"
  }
}
```

to:

```json
    "count": "{count} bình luận",
    "jump": "Đến phần bình luận",
    "loadMore": "Tải thêm"
  }
}
```

- [ ] **Step 2: Destructure the new fields in `app/pages/shows/[slug].vue`**

Change:

```ts
const {
  comments,
  count: commentCount,
  loggedIn,
  commentBody,
  posting,
  postError,
  submitComment,
  formatCommentDate,
  scrollToComments
} = useShowComments(() => showId.value)
```

to:

```ts
const {
  comments,
  count: commentCount,
  hasMore,
  loadMore,
  loadingMore,
  loggedIn,
  commentBody,
  posting,
  postError,
  submitComment,
  formatCommentDate,
  scrollToComments
} = useShowComments(() => showId.value)
```

- [ ] **Step 3: Add the "Load more" button to the comment list**

Change:

```html
        <ul
          v-else
          class="flex flex-col gap-4"
        >
          <li
            v-for="comment in comments"
            :key="comment.id"
            class="rounded-md border border-default p-4"
          >
            <div class="mb-1 flex items-center justify-between gap-2 text-sm">
              <span class="font-medium text-highlighted">{{ comment.author }}</span>
              <span class="text-muted">{{ formatCommentDate(comment.createdAt) }}</span>
            </div>
            <p class="whitespace-pre-wrap text-toned">
              {{ comment.body }}
            </p>
          </li>
        </ul>
      </section>
```

to:

```html
        <ul
          v-else
          class="flex flex-col gap-4"
        >
          <li
            v-for="comment in comments"
            :key="comment.id"
            class="rounded-md border border-default p-4"
          >
            <div class="mb-1 flex items-center justify-between gap-2 text-sm">
              <span class="font-medium text-highlighted">{{ comment.author }}</span>
              <span class="text-muted">{{ formatCommentDate(comment.createdAt) }}</span>
            </div>
            <p class="whitespace-pre-wrap text-toned">
              {{ comment.body }}
            </p>
          </li>
        </ul>

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
      </section>
```

- [ ] **Step 4: Run the full suite, lint, and typecheck**

Run: `npx vitest run`
Expected: PASS — no test covers this page's template directly (no existing test file for `pages/shows/[slug].vue`, matching this codebase's convention of testing composables/small components rather than full pages), so this step confirms no regressions elsewhere.

Run: `npm run lint`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS, except the same pre-existing unrelated `app/app.vue` error noted in Task 1.

- [ ] **Step 5: Commit**

```bash
git add app/pages/shows/\[slug\].vue i18n/locales/en.json i18n/locales/da.json i18n/locales/vi.json
git commit -m "feat: add load-more button to the comment section"
```

---

## Manual verification (not automated — do after Task 2)

Start the dev server (`npm run dev`) and visit a show with more than 20 comments if one exists, or temporarily lower `COMMENTS_PAGE_SIZE` to something small (e.g. `2`) to force the button to appear on a show with only a couple of comments (ids `1`, `5`, `60`, `167` are confirmed to have comments — see the design spec). Confirm:
- The comment section shows the first page, newest first.
- "Load more" appears only when there are more comments, and disappears once exhausted.
- Clicking it appends the next page below the existing ones without duplicating or reordering.
- Posting a new comment still prepends it to the very top, even after "load more" has been clicked at least once.
