# Catalogue Sort (Title / Rating / Release) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sort control (title / rating / release date, each ascending or descending) to the catalogue page, ordered server-side via the GraphQL `orderBy` clause so it stays correct across cursor-based pagination.

**Architecture:** Sort state (`sortBy`/`sortDir`) is owned by `useCatalogueFilters` and synced to the URL, same pattern as the existing `search`/`genre` state. `useShowsQuery` turns that state into an inline `orderBy` literal substituted into the `shows.gql` query text (not a GraphQL variable — see Global Constraints). `pages/index.vue` wires the two together and renders a "sort by" select plus a direction-toggle button.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, `@nuxtjs/i18n`, Nuxt UI (`USelect`/`UButton`), GraphQL via a same-origin `/api/graphql` proxy (`gqlRequest`).

**Reference spec:** `docs/superpowers/specs/2026-07-10-catalogue-sort-design.md`

## Global Constraints

- This repo has **no automated test runner** (no vitest/jest — confirmed via `package.json`). Per-task verification is `pnpm typecheck` and `pnpm lint`; there is no test-writing step in this plan. Do not add a test framework as part of this feature — follow the repo's existing convention of typecheck + lint + manual dev-server verification (see recent commits like the composable-extraction refactors).
- `orderBy` in `shows.gql` is an inline literal substituted via string replacement, **not** a `$variable` — the repo has no GraphQL schema introspection artifact and the live Compose endpoint isn't reachable here, so the actual `orderBy` input type name is unconfirmed. An inline literal needs no declared type name, matching how `shows.gql`/`seasonCount.gql` already write `orderBy` today.
- Accepted, unverified risk: the nested `rating: { average: DIR }` orderBy shape is not confirmed against the live schema (title/release use plain scalar fields, matching the one other confirmed example, `season` in `seasonCount.gql`). This must be verified against the real Compose API once reachable; it cannot be verified in this environment.
- New i18n keys must be added to all three locale files (`i18n/locales/en.json`, `da.json`, `vi.json`) with real translations — no placeholders.
- `hasFilters`/`clearFilters` are unchanged by this feature — sort is a view/ordering preference, not a filter.

---

### Task 1: Sort state & URL sync in `useCatalogueFilters`

**Files:**
- Modify: `app/composables/useCatalogueFilters.ts`

**Interfaces:**
- Consumes: existing `firstQuery` helper, `useI18n`/`useRoute`/`useRouter` (already used in this file; all Nuxt auto-imports).
- Produces (new exports from this file, consumed by Tasks 2 and 3):
  - `type SortField = 'title' | 'rating' | 'release'`
  - `type SortDirection = 'asc' | 'desc'`
  - `useCatalogueFilters(...)` return object gains: `sortBy: Ref<SortField>`, `sortDir: Ref<SortDirection>`, `sortBySelection: WritableComputedRef<SortField>`, `sortFieldItems: ComputedRef<{ label: string, value: SortField }[]>`, `toggleSortDir: () => void`. All existing returned fields (`searchInput`, `search`, `genre`, `genreSelection`, `genreItems`, `hasFilters`, `clearFilters`) are unchanged.

- [ ] **Step 1: Replace the full contents of `app/composables/useCatalogueFilters.ts`**

```ts
function firstQuery(value: unknown): string {
  if (Array.isArray(value)) {
    return (value[0] as string) ?? ''
  }
  return (value as string) ?? ''
}

const ALL_GENRES = '__all__'

export type SortField = 'title' | 'rating' | 'release'
export type SortDirection = 'asc' | 'desc'

const SORT_FIELDS: SortField[] = ['title', 'rating', 'release']
const DEFAULT_SORT_FIELD: SortField = 'title'
const DEFAULT_SORT_DIR: Record<SortField, SortDirection> = {
  title: 'asc',
  rating: 'desc',
  release: 'desc'
}

function parseSortBy(value: unknown): SortField {
  const raw = firstQuery(value)
  return (SORT_FIELDS as string[]).includes(raw) ? (raw as SortField) : DEFAULT_SORT_FIELD
}

function parseSortDir(value: unknown, sortBy: SortField): SortDirection {
  const raw = firstQuery(value)
  return raw === 'asc' || raw === 'desc' ? raw : DEFAULT_SORT_DIR[sortBy]
}

// Owns the catalogue page's search/genre/sort filter state, debounces typed
// search input into a committed term, and keeps all of it in sync with the
// URL so results are shareable + SSR-able.
export function useCatalogueFilters(genres: () => string[] | null | undefined) {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()

  const searchInput = ref(firstQuery(route.query.q))
  const search = ref(searchInput.value)
  const genre = ref(firstQuery(route.query.genre))
  const sortBy = ref<SortField>(parseSortBy(route.query.sortBy))
  const sortDir = ref<SortDirection>(parseSortDir(route.query.sortDir, sortBy.value))

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  watch(searchInput, (value) => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      search.value = value
    }, 350)
  })

  watch([search, genre, sortBy, sortDir], () => {
    router.replace({
      query: {
        ...(search.value ? { q: search.value } : {}),
        ...(genre.value ? { genre: genre.value } : {}),
        ...(sortBy.value !== DEFAULT_SORT_FIELD ? { sortBy: sortBy.value } : {}),
        ...(sortDir.value !== DEFAULT_SORT_DIR[sortBy.value] ? { sortDir: sortDir.value } : {})
      }
    })
  })

  // Reka UI's Select reserves the empty string for the cleared/placeholder
  // state, so the "all genres" item needs a non-empty sentinel value. `genre`
  // stays the source of truth ('' = no filter) for the query/URL logic above;
  // this proxy maps the sentinel <-> '' only at the Select boundary.
  const genreSelection = computed({
    get: () => genre.value || ALL_GENRES,
    set: (value: string) => {
      genre.value = value === ALL_GENRES ? '' : value
    }
  })

  const genreItems = computed(() => [
    { label: t('catalogue.allGenres'), value: ALL_GENRES },
    ...(genres() ?? []).map(g => ({ label: g, value: g }))
  ])

  // Changing the sort field resets direction to that field's natural default
  // (title -> A-Z, rating/release -> highest/newest first). This lives in the
  // setter rather than a `watch(sortBy, ...)` so it only fires on a genuine
  // user field change, not when `sortDir` is restored verbatim from the URL
  // on page load.
  const sortBySelection = computed({
    get: () => sortBy.value,
    set: (value: SortField) => {
      sortBy.value = value
      sortDir.value = DEFAULT_SORT_DIR[value]
    }
  })

  const sortFieldItems = computed((): { label: string, value: SortField }[] => [
    { label: t('catalogue.sortBy.title'), value: 'title' },
    { label: t('catalogue.sortBy.rating'), value: 'rating' },
    { label: t('catalogue.sortBy.release'), value: 'release' }
  ])

  function toggleSortDir() {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }

  const hasFilters = computed(() => !!search.value || !!genre.value)

  function clearFilters() {
    searchInput.value = ''
    search.value = ''
    genre.value = ''
  }

  return {
    searchInput,
    search,
    genre,
    genreSelection,
    genreItems,
    sortBy,
    sortDir,
    sortBySelection,
    sortFieldItems,
    toggleSortDir,
    hasFilters,
    clearFilters
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this file isn't consumed anywhere yet, so this only validates the file's own internal types).

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/composables/useCatalogueFilters.ts
git commit -m "feat: add sort field/direction state to useCatalogueFilters"
```

---

### Task 2: GraphQL orderBy templating, wired into the query call site

**Files:**
- Modify: `app/graphql/shows.gql`
- Modify: `app/composables/useShowsQuery.ts`
- Modify: `app/pages/index.vue:9-31` (only the `useCatalogueFilters`/`useShowsQuery` script-setup wiring — no template changes in this task)

**Interfaces:**
- Consumes: `SortField`, `SortDirection` from Task 1 (`~/composables/useCatalogueFilters`); `sortBy`, `sortDir` refs returned by `useCatalogueFilters` (Task 1).
- Produces: `CatalogueFilters` interface (in `useShowsQuery.ts`) now requires `sortBy: SortField` and `sortDir: SortDirection` in addition to the existing `locale`/`search`/`genre`. `useShowsQuery`'s external return shape (`items`, `hasMore`, `loadMore`, `loadingMore`, `status`, `error`, `refresh`) is unchanged. After this task, visiting the catalogue page with `?sortBy=rating` or `?sortBy=release` in the URL already reorders results server-side, even though no visible sort UI exists yet (added in Task 3).

- [ ] **Step 1: Replace the full contents of `app/graphql/shows.gql`**

```graphql
# Catalogue query — cursor-paginated Show list with optional search + genre
# filter, sorted by the `orderBy` clause below.
#
# The `where` filter is built in the composable (~/composables/useShowsQuery)
# and passed as a NodeFilterInput variable, so optional filters can be omitted
# entirely rather than sent as nulls. `tvshow_collection` caps `first` at 100.
# There is no totalCount on this endpoint, so pagination is cursor-based
# (pageInfo) and the UI uses a "load more" affordance. Fields are flat on Show
# now (no `properties`); `summary` is localized inline ({ en, da, vi }).
#
# `orderBy` below is a literal `__ORDER_BY__` placeholder, not a GraphQL
# variable: there's no schema introspection artifact in this repo, so the
# real `orderBy` input type name is unconfirmed, whereas an inline literal
# (as used here and in seasonCount.gql) needs no declared type name.
# useShowsQuery's buildOrderByLiteral() substitutes the real literal text
# into this placeholder before the request is sent.
query Shows($where: NodeFilterInput!, $first: Int!, $after: String) {
  tvshow_collection(
    first: $first
    after: $after
    where: $where
    orderBy: __ORDER_BY__
  ) {
    items {
      ... on Show {
        id
        name
        genres
        image {
          medium
          original
        }
        rating {
          average
        }
        summary {
          en
          da
          vi
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

- [ ] **Step 2: Replace the full contents of `app/composables/useShowsQuery.ts`**

```ts
import showsQuery from '~/graphql/shows.gql?raw'
import { gqlRequest } from '~/utils/gqlRequest'
import { mapShowSummary } from '~/utils/mapShow'
import type { SortField, SortDirection } from '~/composables/useCatalogueFilters'
import type { ShowSummary } from '~/types/show'
import type { RawNodeConnection, RawShow } from '~/types/compose'

export const CATALOGUE_PAGE_SIZE = 24

export interface CatalogueFilters {
  // The locale doesn't filter the query (name/genres are shared across
  // languages); it only selects which `summary` translation the mapper reads.
  locale: string
  search: string
  genre: string
  sortBy: SortField
  sortDir: SortDirection
}

interface CataloguePage {
  items: ShowSummary[]
  endCursor: string | null
  hasNextPage: boolean
}

// Translate filters into the Compose `where` input. Optional filters are only
// included when set, so we never send `name_contains: null` or `genres_some:
// [null]`.
function buildWhere(filters: CatalogueFilters) {
  const show: Record<string, unknown> = {}
  if (filters.search) {
    show.name_contains = filters.search
  }
  if (filters.genre) {
    show.genres_some = [filters.genre]
  }
  return { show }
}

// Translate sortBy/sortDir into the inline `orderBy` literal substituted into
// shows.gql (see the placeholder note there). title/release sort on plain
// scalar fields, matching the one other confirmed orderBy example in this
// schema (`season` in seasonCount.gql). The nested `rating: { average }`
// shape is the one part of this unconfirmed against the live schema.
function buildOrderByLiteral(filters: CatalogueFilters): string {
  const dir: 'ASC' | 'DESC' = filters.sortDir === 'asc' ? 'ASC' : 'DESC'
  switch (filters.sortBy) {
    case 'rating':
      return `[{ show: { rating: { average: ${dir} } } }]`
    case 'release':
      return `[{ show: { premiered: ${dir} } }]`
    case 'title':
    default:
      return `[{ show: { name: ${dir} } }]`
  }
}

async function fetchPage(filters: CatalogueFilters, after: string | null): Promise<CataloguePage> {
  const query = showsQuery.replace('__ORDER_BY__', buildOrderByLiteral(filters))
  const res = await gqlRequest<{ tvshow_collection: RawNodeConnection<RawShow> }>(query, {
    where: buildWhere(filters),
    first: CATALOGUE_PAGE_SIZE,
    after
  })
  const conn = res.tvshow_collection
  return {
    items: (conn.items ?? [])
      .filter((s): s is RawShow => !!s)
      .map(s => mapShowSummary(s, filters.locale)),
    endCursor: conn.pageInfo?.endCursor ?? null,
    hasNextPage: conn.pageInfo?.hasNextPage ?? false
  }
}

// Paginated catalogue with a "load more" affordance. The first page is fetched
// via useAsyncData (so it renders during SSR and re-runs when the reactive
// search/genre/sort/locale state changes); subsequent pages are appended on
// the client.
export function useShowsQuery(filters: () => CatalogueFilters) {
  const { data, status, error, refresh } = useAsyncData(
    'catalogue',
    () => fetchPage(filters(), null),
    { watch: [filters] }
  )

  // State for pages loaded after the first via "load more". `appended` is null
  // until the user loads more, and resets when the first page changes (filter or
  // locale change) so the grid never mixes filter sets. Everything else is
  // derived from `data` so it is correct during SSR (watchers run async and
  // would miss the server render).
  const appended = ref<{ items: ShowSummary[], cursor: string | null, hasNextPage: boolean } | null>(null)
  const loadingMore = ref(false)

  watch(data, () => {
    appended.value = null
  })

  const items = computed<ShowSummary[]>(() => [
    ...(data.value?.items ?? []),
    ...(appended.value?.items ?? [])
  ])
  const cursor = computed(() =>
    appended.value ? appended.value.cursor : (data.value?.endCursor ?? null)
  )
  const hasMore = computed(() =>
    appended.value ? appended.value.hasNextPage : (data.value?.hasNextPage ?? false)
  )

  async function loadMore() {
    if (!hasMore.value || loadingMore.value || !cursor.value) {
      return
    }
    loadingMore.value = true
    try {
      const page = await fetchPage(filters(), cursor.value)
      appended.value = {
        items: [...(appended.value?.items ?? []), ...page.items],
        cursor: page.endCursor,
        hasNextPage: page.hasNextPage
      }
    } finally {
      loadingMore.value = false
    }
  }

  return { items, hasMore, loadMore, loadingMore, status, error, refresh }
}
```

- [ ] **Step 3: Update the `useCatalogueFilters`/`useShowsQuery` wiring in `app/pages/index.vue`**

Find this block (currently lines 9–31):

```ts
const { data: genres } = useGenresQuery()
const {
  searchInput,
  search,
  genre,
  genreSelection,
  genreItems,
  hasFilters,
  clearFilters
} = useCatalogueFilters(() => genres.value)

const {
  items: shows,
  hasMore,
  loadMore,
  loadingMore,
  status,
  error,
  refresh
} = useShowsQuery(() => ({
  locale: locale.value,
  search: search.value,
  genre: genre.value
}))
```

Replace it with:

```ts
const { data: genres } = useGenresQuery()
const {
  searchInput,
  search,
  genre,
  genreSelection,
  genreItems,
  sortBy,
  sortDir,
  hasFilters,
  clearFilters
} = useCatalogueFilters(() => genres.value)

const {
  items: shows,
  hasMore,
  loadMore,
  loadingMore,
  status,
  error,
  refresh
} = useShowsQuery(() => ({
  locale: locale.value,
  search: search.value,
  genre: genre.value,
  sortBy: sortBy.value,
  sortDir: sortDir.value
}))
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 6: Manual spot-check (URL-driven, no UI yet)**

Run: `pnpm dev`, open the catalogue page, then navigate to `<catalogue-url>?sortBy=release&sortDir=asc` directly in the browser address bar.
Expected: the page loads without error and the result order changes compared to the default (`?` with no params). Open browser dev tools → Network tab → find the `graphql` POST request → confirm the request body's `query` field contains `orderBy: [{ show: { premiered: ASC } }]` (not the placeholder text). Also try `?sortBy=rating` and confirm the request body contains `orderBy: [{ show: { rating: { average: DESC } } }]` — if Compose rejects this request (GraphQL error in the response, or the page's existing error state renders), that confirms the accepted risk from the design spec; note it but do not treat it as a blocker for this plan since it was called out as an open risk in the spec.

- [ ] **Step 7: Commit**

```bash
git add app/graphql/shows.gql app/composables/useShowsQuery.ts app/pages/index.vue
git commit -m "feat: sort catalogue results server-side via orderBy"
```

---

### Task 3: Sort UI controls + i18n

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `i18n/locales/en.json`
- Modify: `i18n/locales/da.json`
- Modify: `i18n/locales/vi.json`

**Interfaces:**
- Consumes: `sortBySelection`, `sortFieldItems`, `toggleSortDir`, `sortDir` from Task 1/2's `useCatalogueFilters`/`index.vue` wiring.
- Produces: visible sort controls in the catalogue page; no new exports.

- [ ] **Step 1: Add the new `catalogue` i18n keys to `i18n/locales/en.json`**

Find:

```json
  "catalogue": {
    "title": "TV Shows",
    "searchPlaceholder": "Search shows…",
    "genreLabel": "Genre",
    "allGenres": "All genres",
    "resultsCount": "{count} shows",
    "noResults": "No shows match your search.",
    "clearFilters": "Clear filters",
    "loadMore": "Load more",
    "seasonsCount": "{count} season | {count} seasons"
  },
```

Replace with:

```json
  "catalogue": {
    "title": "TV Shows",
    "searchPlaceholder": "Search shows…",
    "genreLabel": "Genre",
    "allGenres": "All genres",
    "resultsCount": "{count} shows",
    "noResults": "No shows match your search.",
    "clearFilters": "Clear filters",
    "loadMore": "Load more",
    "seasonsCount": "{count} season | {count} seasons",
    "sortLabel": "Sort by",
    "sortBy": {
      "title": "Title",
      "rating": "Rating",
      "release": "Release date"
    },
    "sortDirection": {
      "ascLabel": "Sort ascending",
      "descLabel": "Sort descending"
    }
  },
```

- [ ] **Step 2: Add the new `catalogue` i18n keys to `i18n/locales/da.json`**

Find:

```json
  "catalogue": {
    "title": "TV-serier",
    "searchPlaceholder": "Søg efter serier…",
    "genreLabel": "Genre",
    "allGenres": "Alle genrer",
    "resultsCount": "{count} serier",
    "noResults": "Ingen serier matcher din søgning.",
    "clearFilters": "Ryd filtre",
    "loadMore": "Indlæs flere",
    "seasonsCount": "{count} sæson | {count} sæsoner"
  },
```

Replace with:

```json
  "catalogue": {
    "title": "TV-serier",
    "searchPlaceholder": "Søg efter serier…",
    "genreLabel": "Genre",
    "allGenres": "Alle genrer",
    "resultsCount": "{count} serier",
    "noResults": "Ingen serier matcher din søgning.",
    "clearFilters": "Ryd filtre",
    "loadMore": "Indlæs flere",
    "seasonsCount": "{count} sæson | {count} sæsoner",
    "sortLabel": "Sortér efter",
    "sortBy": {
      "title": "Titel",
      "rating": "Bedømmelse",
      "release": "Udgivelsesdato"
    },
    "sortDirection": {
      "ascLabel": "Sortér stigende",
      "descLabel": "Sortér faldende"
    }
  },
```

- [ ] **Step 3: Add the new `catalogue` i18n keys to `i18n/locales/vi.json`**

Find:

```json
  "catalogue": {
    "title": "Chương trình TV",
    "searchPlaceholder": "Tìm kiếm chương trình…",
    "genreLabel": "Thể loại",
    "allGenres": "Tất cả thể loại",
    "resultsCount": "{count} chương trình",
    "noResults": "Không có chương trình nào phù hợp với tìm kiếm của bạn.",
    "clearFilters": "Xóa bộ lọc",
    "loadMore": "Tải thêm",
    "seasonsCount": "{count} phần"
  },
```

Replace with:

```json
  "catalogue": {
    "title": "Chương trình TV",
    "searchPlaceholder": "Tìm kiếm chương trình…",
    "genreLabel": "Thể loại",
    "allGenres": "Tất cả thể loại",
    "resultsCount": "{count} chương trình",
    "noResults": "Không có chương trình nào phù hợp với tìm kiếm của bạn.",
    "clearFilters": "Xóa bộ lọc",
    "loadMore": "Tải thêm",
    "seasonsCount": "{count} phần",
    "sortLabel": "Sắp xếp theo",
    "sortBy": {
      "title": "Tiêu đề",
      "rating": "Đánh giá",
      "release": "Ngày phát hành"
    },
    "sortDirection": {
      "ascLabel": "Sắp xếp tăng dần",
      "descLabel": "Sắp xếp giảm dần"
    }
  },
```

- [ ] **Step 4: Extend the script-setup destructure and add the icon/label computeds in `app/pages/index.vue`**

Find:

```ts
const { data: genres } = useGenresQuery()
const {
  searchInput,
  search,
  genre,
  genreSelection,
  genreItems,
  sortBy,
  sortDir,
  hasFilters,
  clearFilters
} = useCatalogueFilters(() => genres.value)
```

Replace with:

```ts
const { data: genres } = useGenresQuery()
const {
  searchInput,
  search,
  genre,
  genreSelection,
  genreItems,
  sortBy,
  sortDir,
  sortBySelection,
  sortFieldItems,
  toggleSortDir,
  hasFilters,
  clearFilters
} = useCatalogueFilters(() => genres.value)
```

Then find:

```ts
const pending = computed(() => status.value === 'pending')

useSeoMeta({
```

Replace with:

```ts
const pending = computed(() => status.value === 'pending')

const sortDirIcon = computed(() =>
  sortDir.value === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow'
)
const sortDirLabel = computed(() =>
  sortDir.value === 'asc' ? t('catalogue.sortDirection.ascLabel') : t('catalogue.sortDirection.descLabel')
)

useSeoMeta({
```

- [ ] **Step 5: Add the sort controls to the template in `app/pages/index.vue`**

Find:

```html
        <USelect
          v-model="genreSelection"
          :items="genreItems"
          value-key="value"
          :aria-label="t('catalogue.genreLabel')"
          class="sm:w-48"
        />
        <UButton
          v-if="hasFilters"
```

Replace with:

```html
        <USelect
          v-model="genreSelection"
          :items="genreItems"
          value-key="value"
          :aria-label="t('catalogue.genreLabel')"
          class="sm:w-48"
        />
        <USelect
          v-model="sortBySelection"
          :items="sortFieldItems"
          value-key="value"
          :aria-label="t('catalogue.sortLabel')"
          class="sm:w-44"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :icon="sortDirIcon"
          :aria-label="sortDirLabel"
          @click="toggleSortDir"
        />
        <UButton
          v-if="hasFilters"
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Lint**

Run: `pnpm lint`
Expected: no errors. If ESLint flags JSON formatting in the locale files, run `pnpm lint --fix` and re-check the diff only touches formatting, not the translated values.

- [ ] **Step 8: Commit**

```bash
git add app/pages/index.vue i18n/locales/en.json i18n/locales/da.json i18n/locales/vi.json
git commit -m "feat: add sort-by select and direction toggle to catalogue page"
```

---

### Task 4: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:** Consumes the fully wired feature from Tasks 1–3.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: server starts without errors; open the catalogue page in a browser.

- [ ] **Step 2: Verify default state is unchanged**

Expected: page loads with no `sort`-related query params in the URL, results in the same title-A-Z order as before this feature (default `sortBy=title`/`sortDir=asc` isn't written to the URL).

- [ ] **Step 3: Verify each sort field's default direction**

Select "Rating" from the sort-by dropdown. Expected: URL updates to include `?sortBy=rating` (no `sortDir` param, since desc is rating's default), results reorder, direction-toggle button/icon indicates descending.

Select "Release date". Expected: URL updates to `?sortBy=release`, results reorder, icon indicates descending.

Select "Title" again. Expected: URL params for sort disappear entirely (back to default state).

- [ ] **Step 4: Verify the direction toggle**

With "Rating" selected, click the direction-toggle button. Expected: URL updates to `?sortBy=rating&sortDir=asc`, results re-order to lowest-rated-first, icon flips. Click again: URL drops `sortDir` (back to rating's desc default), results revert.

- [ ] **Step 5: Verify "Clear filters" does not reset sort**

With a search term or genre selected (so the "Clear filters" button is visible) and a non-default sort selected, click "Clear filters". Expected: search/genre reset, but the sort-by select and direction toggle remain unchanged.

- [ ] **Step 6: Verify "load more" preserves sort order**

With a non-default sort selected and more than one page of results (scroll/click "Load more" at least once). Expected: newly appended items continue in the same sort order as the first page (no visible re-ordering or duplicate/out-of-place items).

- [ ] **Step 7: Verify shareable URLs**

Copy a URL with sort params (e.g. `?sortBy=rating&sortDir=asc`), open it in a fresh browser tab/private window. Expected: the page loads with that sort already applied and the UI controls reflect it (select shows "Rating", toggle icon shows ascending).

- [ ] **Step 8: Record the outcome of the rating-sort risk**

From Task 2 Step 6 and the checks above: note in the PR description (or directly to the person merging this) whether the live Compose API accepted the `orderBy: [{ show: { rating: { average: DIR } } }]` shape without a GraphQL error. If it was rejected, that's a known follow-up — file it rather than trying to fix the schema shape blind, since the correct shape can only be determined via real schema introspection or trial-and-error against the live endpoint.
