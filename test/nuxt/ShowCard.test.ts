import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import ShowCard from '~/components/ShowCard.vue'
import type { ShowSummary } from '~/types/show'

mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))

// useSeasonCount is imported by path in ShowCard; mock the whole module so we can
// assert the lazy-fetch wiring without hitting the GraphQL layer.
const season = vi.hoisted(() => ({ ensureLoaded: vi.fn() }))
vi.mock('~/composables/useSeasonCount', () => ({
  useSeasonCount: () => ({ data: ref(null), status: ref('idle'), ensureLoaded: season.ensureLoaded })
}))

const UPopover = defineComponent({
  name: 'UPopover',
  emits: ['update:open'],
  template: '<div class="upopover"><slot /><slot name="content" /></div>'
})

const stubs = {
  UPopover,
  ShowCardTile: defineComponent({ name: 'ShowCardTile', template: '<div class="tile" />' }),
  UBadge: defineComponent({ template: '<span><slot /></span>' }),
  UIcon: true,
  USkeleton: true
}

const makeShow = (summary: string): ShowSummary => ({
  id: 'show-1',
  slug: 'x-1',
  title: 'X',
  summary,
  rating: 8,
  genres: ['Drama']
})

beforeEach(() => season.ensureLoaded.mockClear())

describe('ShowCard', () => {
  it('renders a plain tile (no popover) when the summary is short', async () => {
    const wrapper = await mountSuspended(ShowCard, {
      props: { show: makeShow('<p>Short summary</p>') },
      global: { stubs }
    })
    expect(wrapper.findComponent(UPopover).exists()).toBe(false)
    expect(wrapper.find('.tile').exists()).toBe(true)
  })

  it('renders a hover popover when the stripped summary exceeds the threshold', async () => {
    const wrapper = await mountSuspended(ShowCard, {
      props: { show: makeShow(`<p>${'word '.repeat(40)}</p>`) }, // >140 plain chars
      global: { stubs }
    })
    expect(wrapper.findComponent(UPopover).exists()).toBe(true)
  })

  it('fetches the season count lazily — only once the popover opens', async () => {
    const wrapper = await mountSuspended(ShowCard, {
      props: { show: makeShow(`<p>${'word '.repeat(40)}</p>`) },
      global: { stubs }
    })
    expect(season.ensureLoaded).not.toHaveBeenCalled() // not on mount

    await wrapper.findComponent(UPopover).vm.$emit('update:open', true)
    expect(season.ensureLoaded).toHaveBeenCalledOnce()

    await wrapper.findComponent(UPopover).vm.$emit('update:open', false) // close: no extra fetch
    expect(season.ensureLoaded).toHaveBeenCalledOnce()
  })
})
