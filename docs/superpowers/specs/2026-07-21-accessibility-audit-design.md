# Accessibility audit (NFR-08) — design

## Goal

Resolve NFR-08 ("Accessibility: WCAG 2.1 AA compliance") from `tv-shows-architecture.html`'s Requirements tab, one of two partially-fulfilled Non-Functional Requirements identified as frontend-touching (the other, NFR-01 page-load performance, is a separate design/plan by agreement — tackled after this one).

Prior status: spot-coverage only (`aria-label` in a handful of files, `alt` text on images), no accessibility tooling in the repo, no audit ever run.

## Approach: automated audit + fix + keep the tooling

Two tools, added permanently (not a one-off check):

1. **`eslint-plugin-vuejs-accessibility`** — static analysis at lint time (missing `alt`, unlabeled form controls, invalid ARIA usage, etc.).
2. **`axe-core`** — runtime analysis against actually-rendered pages (contrast, ARIA structure, landmark regions, label associations that only exist once markup is composed).

Both were spike-tested against this exact repo before committing to this design:

- `eslint-plugin-vuejs-accessibility`'s `configs['flat/recommended']` plugs cleanly into the existing flat ESLint config (`eslint.config.mjs`'s `withNuxt(...)` wrapper) with no compatibility issues.
- **Running it against the whole `app/` directory as-is already passes with zero violations.** So adding this tool is pure regression-prevention going forward — there is no static-analysis fix pass to do.
- `axe-core` does **not** work against a plain detached `mountSuspended()` wrapper element in this project's `happy-dom` test environment (`axe.run(wrapper.element)` throws "No elements found for include in page Context"). It **does** work when the component is attached to a real `document.body` node first: `mountSuspended(Component, { attachTo: el })` where `el = document.createElement('div'); document.body.appendChild(el)`, then `axe.run(document.body)`. Verified by intentionally rendering a component with a missing `alt` and an unlabeled `<button>` and confirming axe reports exactly `image-alt` and `button-name`.

The runtime (`axe-core`) side is the actual unknown — it hasn't been run against the real pages yet. That's the audit this plan performs.

## Scope: three render surfaces

Covers the whole app by composition — no need to separately test shared components (`ShowCard`, `ShowCardTile`, `LocaleSwitcher`), since they're all rendered as part of one of these:

- `app/app.vue` — the global shell: header (logo, `LocaleSwitcher`, color-mode button, login/logout button), the login modal (`LoginForm`), footer. Present on every page.
- `app/pages/index.vue` — the catalogue page.
- `app/pages/shows/[slug].vue` — the show detail page (cast grid, episodes accordion, comment section + post form).

The login modal starts closed (`authModalOpen` defaults to `false`); its test must open it (set the ref or trigger the login button) before running axe, so `LoginForm`'s markup is actually in the DOM to check.

## Process

One test file per surface, e.g. `test/nuxt/a11y/app.test.ts`, `test/nuxt/a11y/catalogue.test.ts`, `test/nuxt/a11y/show-detail.test.ts`:

1. Mount the surface with `mountSuspended(Component, { attachTo: el })`, providing whatever mocked data/route params/composables that surface's existing tests already mock (following established patterns — e.g. `ShowCard.test.ts`'s stubs, `useShowQuery`/`useShowComments` mocking already established in prior work).
2. Run `axe.run(document.body)`.
3. Assert `results.violations` is empty (with a readable failure message listing violation IDs + affected nodes if not, so a real failure is diagnosable rather than a bare "expected [] to equal [...]").
4. Whatever it reports gets fixed in the actual page/component markup, then the test re-run until clean.

Because the concrete findings aren't knowable until the tests actually run against rendered markup, the implementation plan specifies the complete test harness code precisely, but treats "fix every reported violation until the suite is clean" as the task's exact, verifiable completion criterion — not a vague instruction. This mirrors how lint-adoption work is normally scoped: the process and the finish line are exact, even though the diff isn't predictable in advance.

## Out of scope

- **Color contrast precision.** `axe-core`'s `color-contrast` rule depends on real computed styles/layout, which `happy-dom` only partially implements. If it flags a contrast violation, fix it if the fix is obvious (e.g. a literal color value that's clearly wrong); don't chase exact contrast ratios through a headless DOM — that needs a real browser (Lighthouse) pass, which is not part of this scope.
- **Manual keyboard-only or screen-reader walkthroughs.** Automated-only, per the agreed rigor level.
- **NFR-01 (performance).** Separate design/plan, done after this one.

## Testing

The three new axe-core test files (plus whatever fixes they drive) are themselves the acceptance test for this work — "PASS" means NFR-08's automated-testable surface is clean. Existing test suite, lint, and typecheck must all still pass with no regressions.
