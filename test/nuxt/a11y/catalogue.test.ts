import { describe, it, expect, vi, afterEach } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref, computed } from 'vue'
import axe from 'axe-core'
import IndexPage from '~/pages/index.vue'
import type { ShowSummary } from '~/types/show'

mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key, locale: ref('en') }))
mockNuxtImport('useRoute', () => () => ({
  query: {}, path: '/', fullPath: '/', params: {}, hash: '', name: 'index', matched: [], meta: {}
}))
// currentRoute is required: @nuxtjs/i18n's route-locale-detect plugin runs on
// app boot (strategy: 'prefix' + detectBrowserLanguage.redirectOn: 'root' in
// nuxt.config.ts) and reads router.currentRoute.value.meta — omitting it
// throws "Cannot read properties of undefined (reading 'value')" during init.
mockNuxtImport('useRouter', () => () => ({
  replace: vi.fn(), push: vi.fn(), afterEach: vi.fn(), beforeEach: vi.fn(), beforeResolve: vi.fn(), onError: vi.fn(),
  currentRoute: ref({ path: '/', fullPath: '/', params: {}, hash: '', name: 'index', matched: [], meta: {} })
}))
mockNuxtImport('useSeoMeta', () => vi.fn())

// ShowCard.vue only renders its hover popover (a second, duplicate title/
// rating/genre block) when the stripped summary exceeds SUMMARY_POPOVER_THRESHOLD
// (140 chars) — see app/components/ShowCard.vue. This second show's long
// summary exists specifically to trigger that branch so its markup gets
// scanned too, not just the plain-tile branch the first show renders.
const shows: ShowSummary[] = [
  {
    id: 'show-1',
    slug: 'under-the-dome-1',
    title: 'Under the Dome',
    summary: '<p>A small town sealed off from the rest of the world.</p>',
    image: null,
    rating: 6.5,
    genres: ['Drama', 'Sci-Fi']
  },
  {
    id: 'show-2',
    slug: 'grimm-2',
    title: 'Grimm',
    summary: '<p>Grimm is a drama series inspired by the classic Grimm Brothers\' Fairy Tales. After Portland homicide detective Nick Burkhardt discovers he\'s descended from an elite line of criminal profilers known as "Grimms", he increasingly finds his responsibilities as a detective at odds with his new responsibilities as a Grimm.</p>',
    image: null,
    rating: 8.4,
    genres: ['Drama', 'Crime', 'Supernatural']
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
  // Each test mounts its own <main> into document.body; without cleanup a
  // second test would see the first test's leftover <main>, producing a
  // false-positive landmark-no-duplicate-main/landmark-unique violation
  // that's purely a test artifact (same fix as test/nuxt/a11y/show-detail.test.ts).
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('has no axe violations with results rendered', async () => {
    // Mount into a <main> element rather than a plain <div>. In real usage this
    // page is never rendered standalone — app.vue always wraps <NuxtPage> in
    // Nuxt UI's <UMain>, which renders a native <main> landmark by default
    // (node_modules/@nuxt/ui/dist/runtime/components/Main.vue:
    // `as: { default: "main" }` on a Reka UI <Primitive>). There is no
    // app/layouts/ directory in this project, so UMain in app.vue is the only
    // source of that landmark for every page. Mounting the page directly in a
    // bare <div> (as the plan's original test container did) strips that
    // landmark and makes axe's `region` rule report all of the page's content
    // as unlandmarked — a false positive caused by testing the page outside
    // its always-present host context, not a defect in this page's markup.
    // Reproducing the real <main> wrapper here scopes the scan back to what
    // actually ships.
    const el = document.createElement('main')
    document.body.appendChild(el)
    await mountSuspended(IndexPage, { attachTo: el })

    const results = await axe.run(document.body)
    expect(results.violations.length, formatViolations(results.violations)).toBe(0)
  })

  it('has no axe violations with the hover popover open (long-summary card)', async () => {
    // ShowCard.vue's popover only mounts its content once opened, and it's a
    // hover-triggered Reka UI HoverCard (mode="hover"): the trigger's real
    // pointerenter/focus listener is applied via as-child (verified in
    // node_modules/reka-ui/src/HoverCard/HoverCardTrigger.vue), and opening
    // always waits out ShowCard.vue's :open-delay="150" regardless of trigger
    // method (node_modules/reka-ui/src/HoverCard/HoverCardRoot.vue's
    // handleOpen always sets a setTimeout for openDelay). So triggering a real
    // pointerenter and waiting past that delay is the only way to get the
    // popover's content into the DOM for axe to scan — this is exactly the
    // kind of conditionally-rendered markup Task 4's show-detail audit forced
    // into the DOM (expanded accordion, logged-in comment form), applied here
    // to the catalogue's own conditional branch.
    const el = document.createElement('main')
    document.body.appendChild(el)
    await mountSuspended(IndexPage, { attachTo: el })

    // [data-grace-area-trigger] is the exact attribute Reka UI's
    // HoverCardTrigger applies to the trigger element (verified in
    // node_modules/reka-ui/src/HoverCard/HoverCardTrigger.vue); only the
    // long-summary ("Grimm") card has one, since only it renders the popover.
    const trigger = document.body.querySelector('[data-grace-area-trigger]') as HTMLElement
    trigger.dispatchEvent(new Event('pointerenter'))
    await new Promise(resolve => setTimeout(resolve, 250))

    const results = await axe.run(document.body)
    expect(results.violations.length, formatViolations(results.violations)).toBe(0)
  })
})
