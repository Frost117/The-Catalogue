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

    // First pass: header/footer chrome with the modal closed.
    const shellResults = await axe.run(document.body)

    // Open the login modal so LoginForm's markup is actually in the DOM —
    // it starts closed. The mocked t() returns the raw key, so the login
    // button's rendered label is literally "auth.login".
    const loginButton = wrapper.findAll('button').find(b => b.text() === 'auth.login')
    await loginButton?.trigger('click')
    await nextTick()

    // Second pass: scope the scan to the dialog itself rather than
    // document.body. Reka UI's Dialog (which UModal wraps) correctly applies
    // aria-hidden to the rest of the page while trapping keyboard focus
    // inside the dialog (verified in reka-ui/src/Dialog/DialogContentModal.vue:
    // `:trap-focus="rootContext.open.value"`, true whenever the dialog is
    // open) — this is the WAI-ARIA APG pattern for modal dialogs, and the
    // same one Radix/shadcn use. axe's static analysis can't see that the
    // trap makes the hidden header unreachable by Tab, so scanning
    // document.body here would report a false-positive `aria-hidden-focus`
    // against a correctly-built dialog rather than a real defect in this
    // app's markup. Scoping to the dialog still fully audits LoginForm and
    // the modal chrome — the actually-interactive surface introduced by
    // opening it.
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const modalResults = await axe.run(dialog)

    const violations = [...shellResults.violations, ...modalResults.violations]
    expect(violations.length, formatViolations(violations)).toBe(0)
  })
})
