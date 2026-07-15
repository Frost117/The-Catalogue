import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import CommentForm from '~/components/CommentForm.vue'

mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))

// Mock useCommentForm with controllable refs + a scripted submit().
const form = vi.hoisted(() => ({ current: null as unknown }))
mockNuxtImport('useCommentForm', () => () => form.current)

function makeForm() {
  return {
    rating: ref(0),
    body: ref(''),
    posting: ref(false),
    error: ref<unknown>(null),
    submit: vi.fn()
  }
}

const stubs = {
  UAlert: defineComponent({ props: ['description'], template: '<div class="alert">{{ description }}</div>' }),
  UIcon: defineComponent({ template: '<i class="star" @click="$emit(\'click\')" />' }),
  UTextarea: defineComponent({ props: ['modelValue'], template: '<textarea />' }),
  UButton: defineComponent({ props: ['label', 'loading', 'disabled'], template: '<button :disabled="disabled">{{ label }}</button>' })
}

beforeEach(() => {
  form.current = makeForm()
})

describe('CommentForm', () => {
  it('sets the rating when a star is clicked', async () => {
    const state = form.current as ReturnType<typeof makeForm>
    const wrapper = await mountSuspended(CommentForm, { props: { showId: 'show-1' }, global: { stubs } })

    await wrapper.findAll('.star')[2]!.trigger('click') // 3rd star
    expect(state.rating.value).toBe(3)
  })

  it('disables submit until a rating and non-empty body are present', async () => {
    const state = form.current as ReturnType<typeof makeForm>
    const wrapper = await mountSuspended(CommentForm, { props: { showId: 'show-1' }, global: { stubs } })

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()

    state.rating.value = 4
    state.body.value = 'Nice'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('emits "posted" when submit succeeds', async () => {
    const state = form.current as ReturnType<typeof makeForm>
    state.submit.mockResolvedValueOnce(true)
    const wrapper = await mountSuspended(CommentForm, { props: { showId: 'show-1' }, global: { stubs } })

    await wrapper.find('form').trigger('submit.prevent')
    expect(state.submit).toHaveBeenCalledOnce()
    expect(wrapper.emitted('posted')).toHaveLength(1)
  })

  it('does not emit "posted" when submit fails', async () => {
    const state = form.current as ReturnType<typeof makeForm>
    state.submit.mockResolvedValueOnce(false)
    const wrapper = await mountSuspended(CommentForm, { props: { showId: 'show-1' }, global: { stubs } })

    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.emitted('posted')).toBeUndefined()
  })
})
