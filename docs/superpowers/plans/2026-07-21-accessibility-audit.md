# Accessibility Audit (NFR-08) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve NFR-08 (WCAG 2.1 AA) by adding permanent accessibility tooling (static + runtime) and fixing every violation it finds across the app's three render surfaces.

**Architecture:** `eslint-plugin-vuejs-accessibility` catches static markup issues at lint time; `axe-core` catches runtime issues (contrast, ARIA structure, label associations) against actually-rendered output in three new test files, one per surface (`app.vue` shell, catalogue page, show detail page). Both were spike-verified against this exact repo before this plan was written (see the design spec) — the static tool already passes with zero violations on the current codebase; the runtime tool's findings are the real unknown this plan audits and fixes.

**Tech Stack:** Nuxt 4, Vue 3, ESLint 10 (flat config), Vitest + `@nuxt/test-utils` (nuxt project, `happy-dom`), `axe-core`, `eslint-plugin-vuejs-accessibility`.

## Global Constraints

- Both tools are added **permanently** (ongoing regression prevention), not run once and removed.
- Color-contrast findings: fix only if the fix is obvious (a clearly wrong literal color value). Do not chase exact contrast ratios through `happy-dom` — that needs a real browser, out of scope.
- No manual keyboard-only or screen-reader walkthroughs — automated tooling only, per the agreed rigor level.
- `axe-core` must be run via `axe.run(document.body)` with the component mounted via `mountSuspended(Component, { attachTo: el })` where `el` is created and appended to `document.body` first — a detached wrapper element does not work in this project's `happy-dom` test environment (verified: throws "No elements found for include in page Context" otherwise).
- This is audit-and-fix work: the exact violations (if any) aren't knowable until each test actually runs against real rendered markup. Each task's mocking setup is given complete and specific, but if a mock is wrong (mounting fails, or a composable isn't stubbed the way the real component needs), fixing the *test's own mock* to correctly reflect how the component is actually used is expected iteration — follow the established mocking patterns in `test/nuxt/ShowCard.test.ts` and `test/nuxt/useCatalogueFilters.test.ts` for how this codebase mocks `useRoute`/`useRouter`/`useI18n`/whole composable modules. What is *not* acceptable is loosening a mock to make a genuine accessibility violation disappear (e.g. stubbing out the very element axe is complaining about) — violations get fixed in the real component/page markup.

---

### Task 1: Add accessibility tooling

**Files:**
- Modify: `package.json` (via `npm install`, not hand-edited)
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: nothing new
- Produces: `eslint-plugin-vuejs-accessibility`'s recommended flat-config rule set active on every `npm run lint`; `axe-core` available as an importable dependency for Tasks 2-4.

- [ ] **Step 1: Install both packages**

Run: `npm install --save-dev axe-core eslint-plugin-vuejs-accessibility`

- [ ] **Step 2: Add the plugin to the flat ESLint config**

Replace the full contents of `eslint.config.mjs` with:

```js
// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'

export default withNuxt(
  pluginVueA11y.configs['flat/recommended']
)
```

- [ ] **Step 3: Run lint to confirm the current codebase is already clean**

Run: `npm run lint`
Expected: PASS, 0 problems. (Verified during design: the whole `app/` directory already passes this rule set as-is — this step is confirming that verification still holds, not fixing anything.)

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npx vitest run`
Expected: PASS — all existing suites unaffected. Note: this project has a known-flaky cold-start Nuxt setup hook timeout that can hit any nuxt-project test file on the first run in a fresh worktree — if you see ONLY that failure, re-run once to confirm it passes warm.

Run: `npm run typecheck`
Expected: PASS, except one pre-existing unrelated error in `app/app.vue` (a `useHead` type mismatch) that predates this work.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json eslint.config.mjs
git commit -m "chore: add accessibility lint rules and axe-core"
```

---

### Task 2: Accessibility audit — app shell (`app.vue`)

**Files:**
- Test: `test/nuxt/a11y/app.test.ts` (new)
- Modify: `app/app.vue` and/or `app/components/LocaleSwitcher.vue`/`app/components/LoginForm.vue` — only if axe reports a violation there; do not touch these files if the test passes clean.

**Interfaces:**
- Consumes: `app/app.vue` (renders `UHeader`/`LocaleSwitcher`/login `UModal`+`LoginForm`/`UFooter`), `axe-core`'s `run()` API (verified pattern above)
- Produces: nothing consumed by later tasks — each of Tasks 2-4 is independent.

- [ ] **Step 1: Write the test**

Create `test/nuxt/a11y/app.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { defineComponent, nextTick, ref } from 'vue'
import axe from 'axe-core'
import App from '~/app.vue'

// IMPORTANT: every field below that a template reads directly (as opposed to
// only via explicit `.value` inside a composable's own script) MUST be a real
// `ref()`/`computed()`, not a plain `{ value: x }` object. Vue's template
// auto-unwrapping only unwraps actual refs — a plain object stays truthy
// forever, so `v-if="!loggedIn"` with `loggedIn: { value: false }` silently
// always renders the wrong branch. Verified by direct spike against this
// project's test setup before writing this plan.
mockNuxtImport('useI18n', () => () => ({
  t: (key: string) => key,
  locale: ref('en'),
  locales: ref([
    { code: 'en', name: 'English' },
    { code: 'da', name: 'Dansk' },
    { code: 'vi', name: 'Tiếng Việt' }
  ]),
  setLocale: vi.fn()
}))
mockNuxtImport('useLocaleHead', () => () => ref({ htmlAttrs: { lang: 'en' }, link: [], meta: [] }))
mockNuxtImport('useLocalePath', () => () => (to: unknown) => (typeof to === 'string' ? `/${to}` : '/'))
mockNuxtImport('useAuth', () => () => ({ loggedIn: ref(false), logout: vi.fn() }))
vi.mock('~/composables/useAuthForm', () => ({
  useAuthForm: () => ({
    step: ref('phone'),
    phone: ref(''),
    callingCode: ref(45),
    code: ref(''),
    loading: ref(false),
    errorMessage: ref(null),
    submitPhoneStep: vi.fn(),
    submitCodeStep: vi.fn()
  })
}))

// NuxtPage is stubbed — this test audits the shell (header/footer/modal),
// not whatever page happens to be routed; pages are audited separately in
// Task 3/4.
const stubs = {
  NuxtPage: defineComponent({ template: '<div />' })
}

function formatViolations(violations: import('axe-core').Result[]): string {
  return violations.map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ')).join(', ')})`).join('\n')
}

describe('accessibility: app shell', () => {
  it('has no axe violations in the header/footer chrome and the opened login modal', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const wrapper = await mountSuspended(App, { attachTo: el, global: { stubs } })

    // Open the login modal so LoginForm's markup is actually in the DOM —
    // it starts closed. The mocked t() returns the raw key, so the login
    // button's rendered label is literally "auth.login".
    const loginButton = wrapper.findAll('button').find(b => b.text() === 'auth.login')
    await loginButton?.trigger('click')
    await nextTick()

    const results = await axe.run(document.body)
    expect(results.violations.length, formatViolations(results.violations)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/nuxt/a11y/app.test.ts`
Expected: either a mounting/mock error (fix the mock per the Global Constraints guidance — e.g. a missing auto-import that needs stubbing, following `ShowCard.test.ts`'s patterns), or the test runs and reports zero or more axe violations. Any outcome other than "0 violations, clean pass" means real work remains — proceed to Step 3.

- [ ] **Step 3: Fix every reported violation**

Fix each violation axe reports in the real markup (`app/app.vue`, `LocaleSwitcher.vue`, or `LoginForm.vue` — wherever the violation's node points). Re-run the test after each fix. Repeat until `npx vitest run test/nuxt/a11y/app.test.ts` passes with 0 violations.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS — no regressions in existing suites.

- [ ] **Step 5: Commit**

```bash
git add test/nuxt/a11y/app.test.ts app/app.vue app/components/LocaleSwitcher.vue app/components/LoginForm.vue
git commit -m "test: add accessibility audit for the app shell"
```
(Only `git add` the component files that actually changed — if none needed a fix, the commit is test-only.)

---

### Task 3: Accessibility audit — catalogue page (`pages/index.vue`)

**Files:**
- Test: `test/nuxt/a11y/catalogue.test.ts` (new)
- Modify: `app/pages/index.vue` and/or `app/components/ShowCard.vue`/`app/components/ShowCardTile.vue` — only if axe reports a violation there.

**Interfaces:**
- Consumes: `app/pages/index.vue`, `axe-core`'s `run()` API
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test**

Create `test/nuxt/a11y/catalogue.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref, computed } from 'vue'
import axe from 'axe-core'
import IndexPage from '~/pages/index.vue'
import type { ShowSummary } from '~/types/show'

mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key, locale: ref('en') }))
mockNuxtImport('useRoute', () => () => ({
  query: {}, path: '/', fullPath: '/', params: {}, hash: '', name: 'index', matched: [], meta: {}
}))
mockNuxtImport('useRouter', () => () => ({
  replace: vi.fn(), push: vi.fn(), afterEach: vi.fn(), beforeEach: vi.fn(), beforeResolve: vi.fn(), onError: vi.fn()
}))
mockNuxtImport('useSeoMeta', () => vi.fn())

const shows: ShowSummary[] = [
  {
    id: 'show-1',
    slug: 'under-the-dome-1',
    title: 'Under the Dome',
    summary: '<p>A small town sealed off from the rest of the world.</p>',
    image: null,
    rating: 6.5,
    genres: ['Drama', 'Sci-Fi']
  }
]

vi.mock('~/composables/useGenresQuery', () => ({
  useGenresQuery: () => ({ data: ref(['Drama', 'Sci-Fi']) })
}))
vi.mock('~/composables/useShowsQuery', () => ({
  useShowsQuery: () => ({
    items: computed(() => shows),
    hasMore: ref(false),
    loadMore: vi.fn(),
    loadingMore: ref(false),
    status: ref('success'),
    error: ref(null),
    refresh: vi.fn()
  })
}))
vi.mock('~/composables/useSeasonCount', () => ({
  useSeasonCount: () => ({ data: ref(null), status: ref('idle'), ensureLoaded: vi.fn() })
}))

function formatViolations(violations: import('axe-core').Result[]): string {
  return violations.map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ')).join(', ')})`).join('\n')
}

describe('accessibility: catalogue page', () => {
  it('has no axe violations with results rendered', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    await mountSuspended(IndexPage, { attachTo: el })

    const results = await axe.run(document.body)
    expect(results.violations.length, formatViolations(results.violations)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/nuxt/a11y/catalogue.test.ts`
Expected: either a mounting/mock error (fix the mock, following `test/nuxt/useCatalogueFilters.test.ts`'s exact `useRoute`/`useRouter` mock shape if `useCatalogueFilters` needs adjustment), or the test runs and reports zero or more violations.

- [ ] **Step 3: Fix every reported violation**

Fix each violation in the real markup (`app/pages/index.vue`, `ShowCard.vue`, or `ShowCardTile.vue`). Re-run after each fix until clean.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS — no regressions.

- [ ] **Step 5: Commit**

```bash
git add test/nuxt/a11y/catalogue.test.ts app/pages/index.vue app/components/ShowCard.vue app/components/ShowCardTile.vue
git commit -m "test: add accessibility audit for the catalogue page"
```
(Only `git add` the component files that actually changed.)

---

### Task 4: Accessibility audit — show detail page (`pages/shows/[slug].vue`)

**Files:**
- Test: `test/nuxt/a11y/show-detail.test.ts` (new)
- Modify: `app/pages/shows/[slug].vue` — only if axe reports a violation there.

**Interfaces:**
- Consumes: `app/pages/shows/[slug].vue`, `axe-core`'s `run()` API
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the test**

Create `test/nuxt/a11y/show-detail.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref, computed } from 'vue'
import axe from 'axe-core'
import ShowDetailPage from '~/pages/shows/[slug].vue'
import type { Show, Comment } from '~/types/show'

mockNuxtImport('useI18n', () => () => ({
  t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  locale: ref('en')
}))
mockNuxtImport('useRoute', () => () => ({
  params: { slug: 'under-the-dome-1' },
  query: {},
  path: '/shows/under-the-dome-1',
  fullPath: '/shows/under-the-dome-1',
  hash: '',
  name: 'shows-slug',
  matched: [],
  meta: {}
}))
mockNuxtImport('useLocalePath', () => () => (to: unknown) => (typeof to === 'string' ? `/${to}` : '/'))
mockNuxtImport('useSeoMeta', () => vi.fn())

const show: Show = {
  id: 'show-1',
  slug: 'under-the-dome-1',
  title: 'Under the Dome',
  summary: '<p>A small town sealed off from the rest of the world.</p>',
  image: 'https://static.tvmaze.com/uploads/images/medium_portrait/610/1525272.jpg',
  rating: 6.5,
  genres: ['Drama', 'Sci-Fi'],
  status: 'Ended',
  network: 'CBS',
  premiered: '2013-06-24',
  cast: [{ id: 'cast-1-1', name: 'Mike Vogel', character: 'Dale Barbara', image: null }],
  episodes: [{ id: 'episode-1', season: 1, number: 1, name: 'Pilot', summary: null }]
}

const comments: Comment[] = [
  { id: 'c1', showId: 1, author: '+4512345678', body: 'Great show!', createdAt: '2026-01-01T00:00:00Z' }
]

vi.mock('~/composables/useShowQuery', () => ({
  useShowQuery: () => ({
    data: ref({ show, summaryLang: 'en' }),
    status: ref('success'),
    error: ref(null),
    refresh: vi.fn()
  })
}))
vi.mock('~/composables/useShowComments', () => ({
  useShowComments: () => ({
    comments: computed(() => comments),
    count: computed(() => comments.length),
    hasMore: ref(false),
    loadMore: vi.fn(),
    loadingMore: ref(false),
    loggedIn: ref(false),
    commentBody: ref(''),
    posting: ref(false),
    postError: ref(false),
    submitComment: vi.fn(),
    formatCommentDate: (iso: string) => iso,
    scrollToComments: vi.fn()
  })
}))

function formatViolations(violations: import('axe-core').Result[]): string {
  return violations.map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ')).join(', ')})`).join('\n')
}

describe('accessibility: show detail page', () => {
  it('has no axe violations with a full show rendered', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    await mountSuspended(ShowDetailPage, { attachTo: el })

    const results = await axe.run(document.body)
    expect(results.violations.length, formatViolations(results.violations)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/nuxt/a11y/show-detail.test.ts`
Expected: either a mounting/mock error (fix the mock), or the test runs and reports zero or more violations.

- [ ] **Step 3: Fix every reported violation**

Fix each violation in `app/pages/shows/[slug].vue`. Re-run after each fix until clean.

- [ ] **Step 4: Run the full suite, lint, and typecheck**

Run: `npx vitest run`
Expected: PASS — no regressions.

Run: `npm run lint`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS, except the same pre-existing unrelated `app/app.vue` error noted in Task 1.

- [ ] **Step 5: Commit**

```bash
git add test/nuxt/a11y/show-detail.test.ts app/pages/shows/\[slug\].vue
git commit -m "test: add accessibility audit for the show detail page"
```
(Only `git add` the page file if it actually changed.)

---

## Manual verification (not automated)

None required — this plan's own automated tests (Tasks 2-4) are the acceptance criterion for NFR-08's automated-testable surface, per the design spec. Color-contrast precision and manual keyboard/screen-reader walkthroughs remain explicitly out of scope (see Global Constraints).
