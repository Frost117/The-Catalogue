# Catalogue sort (title / rating / release) — design

## Goal

Add a sort control to the catalogue page (`app/pages/index.vue`) alongside the
existing search and genre filters, so results can be ordered by title, rating,
or release date, in either direction.

## Why server-side

`useShowsQuery` paginates via GraphQL cursor (`hasNextPage`/`endCursor`,
"load more"). Sorting must happen in the `orderBy` clause of the `Shows`
query, not client-side after fetch — client-side sorting would only reorder
whatever page(s) happen to be loaded, and would produce a wrong/inconsistent
order once "load more" appends a new page.

## State & URL model (`useCatalogueFilters`)

Two new refs, alongside the existing `search`/`genre`:

- `sortBy: 'title' | 'rating' | 'release'` — default `'title'`
- `sortDir: 'asc' | 'desc'` — default depends on field:
  - `title` → `asc`
  - `rating` → `desc`
  - `release` → `desc`

```ts
const DEFAULT_SORT_DIR: Record<SortField, SortDirection> = {
  title: 'asc',
  rating: 'desc',
  release: 'desc'
}
```

**Field-change resets direction.** A `sortBySelection` computed proxy (same
pattern as the existing `genreSelection` proxy) is what the "sort by" select
binds to. Its setter changes `sortBy` **and** resets `sortDir` to that field's
default in one step:

```ts
const sortBySelection = computed({
  get: () => sortBy.value,
  set: (value: SortField) => {
    sortBy.value = value
    sortDir.value = DEFAULT_SORT_DIR[value]
  }
})
```

This reset must live in the setter, not a `watch(sortBy, ...)`. A watcher
can't distinguish "user just picked a new field" from "URL restored
`sortBy=rating` on page load" — a watcher would wrongly stomp on an explicit
`sortDir` restored from the URL on hydration.

`toggleSortDir()` flips `sortDir` directly and is what the direction-toggle
button calls; it does not touch `sortBy`.

**URL sync** extends the existing `watch([search, genre], ...)` to include
`sortBy`/`sortDir`, with the same omit-if-default convention already used for
`q`/`genre`:

- `sortBy` is written to the query only when it isn't `'title'`.
- `sortDir` is written to the query only when it differs from that field's
  default (`DEFAULT_SORT_DIR[sortBy]`).

So the default view has no sort params at all; selecting "Rating" alone
produces `?sortBy=rating` (desc is implied); explicitly flipping it adds
`&sortDir=asc`.

Parsing back from the URL on load mirrors `firstQuery`, falling back to
defaults on missing/invalid values.

**`hasFilters` / `clearFilters` are unchanged** — sort is a view/ordering
preference, not a filter, so "Clear filters" does not reset it.

## GraphQL / data layer

`CatalogueFilters` (`useShowsQuery.ts`) gains `sortBy`/`sortDir`, passed
through from `pages/index.vue` next to `locale`/`search`/`genre`.

**No new GraphQL variable.** The existing `.gql` files (`shows.gql`,
`seasonCount.gql`) already express `orderBy` as an inline literal in the
query text (`orderBy: [{ show: { name: ASC } }]`), not as a `$variable`. There
is no schema introspection checked into this repo and the live Compose
endpoint isn't reachable here, so the actual `orderBy` input type name is
unknown — declaring `$orderBy: [SomeInputName!]` would require guessing that
name for no benefit. Instead, `shows.gql` keeps the inline-literal style and
gets a placeholder token:

```graphql
query Shows($where: NodeFilterInput!, $first: Int!, $after: String) {
  tvshow_collection(
    first: $first
    after: $after
    where: $where
    orderBy: __ORDER_BY__
  ) {
    ...
  }
}
```

`fetchPage` in `useShowsQuery.ts` substitutes the token before sending:

```ts
function buildOrderByLiteral(filters: CatalogueFilters): string {
  const dir = filters.sortDir === 'asc' ? 'ASC' : 'DESC'
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

const query = showsQuery.replace('__ORDER_BY__', buildOrderByLiteral(filters))
```

The substituted values come only from our own fixed field/direction mapping
(never raw user input), so this is not a query-injection risk. The gateway
(`server/api/graphql.post.ts`) is a plain pass-through of `{ query, variables
}` to Compose with no persisted-query hashing or caching keyed on query text,
so a per-request query string is exactly as valid as the existing static one.

**Accepted risk:** the nested `rating: { average: DIR }` shape is not
confirmed against the live schema (no introspection artifact exists, and the
one other `orderBy` example in the repo — `seasonCount.gql`'s `season: DESC`
— only sorts a plain scalar, never a nested field). Sorting by `title` and
`release` use plain scalars following the same pattern as `season`, so those
are low-risk by comparison. **Verify the rating sort against the real
Compose API once reachable; adjust `buildOrderByLiteral`'s `rating` branch if
the shape is rejected.**

## Front-end behavior

No changes to reactivity, pagination, or SSR wiring:

- `useAsyncData('catalogue', () => fetchPage(filters(), null), { watch:
  [filters] })` already refetches on any change to the `filters()` object;
  adding `sortBy`/`sortDir` to that object means sort changes refetch through
  the same existing path as search/genre changes.
- `loadMore()` calls `fetchPage(filters(), cursor.value)` fresh each time, so
  it always uses the current sort.
- The existing `watch(data, () => { appended.value = null })` already clears
  "load more" state on any filter change, so switching sort correctly resets
  pagination, same as changing genre does today.

## UI

In `index.vue`, next to the genre `USelect`:

- A "sort by" `USelect` (Title / Rating / Release), bound to
  `sortBySelection`.
- A small icon `UButton` direction toggle (e.g.
  `i-lucide-arrow-up-narrow-wide` / `i-lucide-arrow-down-wide-narrow`),
  calling `toggleSortDir()`, with an `aria-label` reflecting the current
  direction ("Sort ascending" / "Sort descending").

## i18n

New keys under `catalogue`, added to `en.json`, `da.json`, `vi.json`:

- `sortLabel` (aria-label for the sort-by select)
- `sortBy.title`, `sortBy.rating`, `sortBy.release` (option labels)
- `sortDirection.ascLabel`, `sortDirection.descLabel` (toggle button
  aria-labels)

## Out of scope

- Displaying `premiered`/release date on the card itself (only used for
  sorting; `ShowSummary`/`mapShowSummary` are not changed to include it).
- Multi-key/compound sorting.
- Persisting sort choice beyond the URL (e.g. user preference storage).
