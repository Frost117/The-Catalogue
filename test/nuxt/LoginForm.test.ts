import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LoginForm from '~/components/LoginForm.vue'

mockNuxtImport('useI18n', () => () => ({ t: (key: string) => key }))

// LoginForm delegates all logic to useAuthForm; mock it with controllable refs so
// we can assert the template reflects each state and wires submits.
const form = vi.hoisted(() => ({ current: null as unknown }))
mockNuxtImport('useAuthForm', () => () => form.current)

function makeForm() {
  return {
    step: ref<'phone' | 'code'>('phone'),
    phone: ref(''),
    callingCode: ref(45),
    code: ref(''),
    loading: ref(false),
    errorMessage: ref<string | null>(null),
    submitPhoneStep: vi.fn(),
    submitCodeStep: vi.fn()
  }
}

const stubs = {
  UAlert: defineComponent({ props: ['description'], template: '<div class="alert">{{ description }}</div>' }),
  UFormField: defineComponent({ props: ['label'], template: '<label>{{ label }}<slot /></label>' }),
  USelectMenu: defineComponent({ props: ['modelValue', 'items', 'valueKey', 'filterFields'], template: '<div class="calling-code" />' }),
  UInput: defineComponent({ props: ['modelValue'], template: '<input />' }),
  UButton: defineComponent({ props: ['label', 'loading', 'disabled'], template: '<button>{{ label }}</button>' })
}

beforeEach(() => {
  form.current = makeForm()
})

describe('LoginForm', () => {
  it('renders the phone step with a calling-code selector and submits it', async () => {
    const state = form.current as ReturnType<typeof makeForm>
    const wrapper = await mountSuspended(LoginForm, { global: { stubs } })

    expect(wrapper.text()).toContain('auth.login')
    expect(wrapper.find('.calling-code').exists()).toBe(true)
    expect(wrapper.text()).toContain('auth.callingCodeLabel')

    await wrapper.find('form').trigger('submit.prevent')
    expect(state.submitPhoneStep).toHaveBeenCalledOnce()
    expect(state.submitCodeStep).not.toHaveBeenCalled()
  })

  it('renders the code step once step advances and submits it', async () => {
    const state = form.current as ReturnType<typeof makeForm>
    state.step.value = 'code'
    const wrapper = await mountSuspended(LoginForm, { global: { stubs } })

    expect(wrapper.text()).toContain('auth.codeSentDescription')
    expect(wrapper.find('.calling-code').exists()).toBe(false)
    await wrapper.find('form').trigger('submit.prevent')
    expect(state.submitCodeStep).toHaveBeenCalledOnce()
    expect(state.submitPhoneStep).not.toHaveBeenCalled()
  })

  it('surfaces the error message in an alert', async () => {
    const state = form.current as ReturnType<typeof makeForm>
    state.errorMessage.value = 'auth.invalidCode'
    const wrapper = await mountSuspended(LoginForm, { global: { stubs } })

    expect(wrapper.find('.alert').text()).toBe('auth.invalidCode')
  })
})
