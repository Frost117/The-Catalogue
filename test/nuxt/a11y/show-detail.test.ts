import { describe, it, expect, vi, afterEach } from 'vitest'
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

// A real ref shared with the mock below, so individual tests can flip
// logged-in state to exercise the comment post form's markup (it's only in
// the DOM when loggedIn is true) without re-mocking per test.
const loggedIn = ref(false)

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
    loggedIn,
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
  // Each test mounts its own <main> into document.body (see the note below on
  // why <main> rather than <div>). Without cleanup, later tests' scans see
  // every prior test's leftover <main>, producing a false-positive
  // landmark-no-duplicate-main/landmark-unique violation that's purely a test
  // artifact of the shared happy-dom document, not a real page defect.
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('has no axe violations with a full show rendered', async () => {
    // Mount into a <main> element rather than a plain <div>. In real usage this
    // page is never rendered standalone — app.vue always wraps <NuxtPage> in
    // Nuxt UI's <UMain>, which renders a native <main> landmark by default
    // (node_modules/@nuxt/ui/dist/runtime/components/Main.vue:
    // `as: { default: "main" }` on a Reka UI <Primitive>). There is no
    // app/layouts/ directory in this project, so UMain in app.vue is the only
    // source of that landmark for every page. Mounting the page directly in a
    // bare <div> strips that landmark and makes axe's `region` rule report all
    // of the page's content as unlandmarked — a false positive caused by
    // testing the page outside its always-present host context, not a defect
    // in this page's markup (see the identical fix in test/nuxt/a11y/catalogue.test.ts).
    const el = document.createElement('main')
    document.body.appendChild(el)
    await mountSuspended(ShowDetailPage, { attachTo: el })

    const results = await axe.run(document.body)
    expect(results.violations.length, formatViolations(results.violations)).toBe(0)
  })

  it('has no axe violations with a season expanded (episode list in the DOM)', async () => {
    // UAccordion unmounts collapsed panels (unmountOnHide defaults to true),
    // so the episode <ul> markup is absent from the base render above. Expand
    // the first season so axe actually scans that content instead of scanning
    // nothing and reporting a false clean bill of health for it.
    const el = document.createElement('main')
    document.body.appendChild(el)
    const wrapper = await mountSuspended(ShowDetailPage, { attachTo: el })

    const trigger = document.querySelector('[data-slot="trigger"]') as HTMLElement
    trigger.click()
    await wrapper.vm.$nextTick()

    const results = await axe.run(document.body)
    expect(results.violations.length, formatViolations(results.violations)).toBe(0)
  })

  it('has no axe violations with the comment post form rendered (logged in)', async () => {
    // The post form (UTextarea + submit UButton) only renders when loggedIn
    // is true; the base render above only covers the logged-out prompt. Flip
    // the shared mock ref so this state's markup gets scanned too.
    loggedIn.value = true
    try {
      const el = document.createElement('main')
      document.body.appendChild(el)
      await mountSuspended(ShowDetailPage, { attachTo: el })

      const results = await axe.run(document.body)
      expect(results.violations.length, formatViolations(results.violations)).toBe(0)
    } finally {
      loggedIn.value = false
    }
  })
})
