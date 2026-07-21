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
})
