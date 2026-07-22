// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/i18n'
    // 'nuxt-graphql-client' — still disabled, but no longer blocked. The
    // correct endpoint is now in GQL_HOST (/{project}/{environment}, no /v1)
    // and it introspects with a plain Bearer token, so build-time codegen can
    // work. To re-enable: uncomment this module, restore the 'graphql-client'
    // config block below, and set GQL_TOKEN to a valid access token so codegen
    // can introspect. Until then the app talks to the endpoint via the
    // server-side gqlRequest helper, which keeps the Bearer token out of the
    // client bundle.
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Server-only Compose credentials. The browser never sees these: the
    // /api/graphql Nitro route exchanges them for a short-lived access token
    // (client-credentials grant) and forwards queries upstream. Set real
    // values in .env (gitignored); see .env.example.
    composeClientId: process.env.COMPOSE_CLIENT_ID || '',
    composeClientSecret: process.env.COMPOSE_CLIENT_SECRET || '',
    composeAuthTokenUrl: process.env.COMPOSE_AUTH_TOKEN_URL || 'https://management.umbracocompose.com/v1/auth/token',
    // OAuth scope(s) for the token. Leave empty: the no-scope token already
    // authorizes querying and introspection on this endpoint. `graphql` /
    // `graphql:introspection` return `invalid_scope` unless granted to the API
    // application in the Compose portal first, so only set them if needed.
    composeScope: process.env.COMPOSE_SCOPE || '',
    // Collection alias (Compose -> CollectionAlias), scoping queries to this collection.
    composeCollectionAlias: process.env.COMPOSE_COLLECTION_ALIAS || '',
    // Full Compose GraphQL URL, e.g. https://graphql.<region>.umbracocompose.com/<project>/<environment> (no /v1)
    composeGraphqlUrl: process.env.GQL_HOST || '',
    // Umbraco member-login backend. All /api/auth/* requests are proxied here
    // (server/api/auth/[...].ts); it owns the OTP flow and the session cookie.
    memberLoginHost: process.env.MEMBER_LOGIN_HOST || '',
    // Name of the member session cookie the backend sets on login. Umbraco
    // members use ASP.NET Core Identity's application scheme, whose cookie the
    // backend doesn't rename, so it's the framework default. The comments proxy
    // (server/api/comments.post.ts) rejects posts that arrive without it.
    memberSessionCookie: process.env.MEMBER_SESSION_COOKIE || '.AspNetCore.Identity.Application',
    public: {
      // reCAPTCHA v2 Invisible site key — public by design (used in the browser
      // to mint the X-Recaptcha-Token the member-login backend requires on the
      // OTP endpoints). See app/composables/useRecaptcha.ts.
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || ''
    }
  },

  routeRules: {
    // Locale prefixing moves the catalogue to /en, /da, /vi, so the old
    // `'/': { prerender: true }` no longer maps to a real page. The bare `/`
    // just redirects to the detected locale; show pages render on demand (SSR)
    // for SEO and fresh, localized content.
    '/': { redirect: '/en' }
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    preset: 'cloudflare_module'
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // https://i18n.nuxtjs.org/ — UI-chrome translations. Show metadata is
  // localized server-side via GraphQL, not here.
  i18n: {
    // Absolute site URL for hreflang/canonical SEO tags. Override per
    // environment via NUXT_PUBLIC_SITE_URL.
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    strategy: 'prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'da', language: 'da-DK', name: 'Dansk', file: 'da.json' },
      { code: 'vi', language: 'vi-VN', name: 'Tiếng Việt', file: 'vi.json' }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root',
      fallbackLocale: 'en'
    }
  }

  // Config for nuxt-graphql-client — re-add alongside the module (see modules
  // above) once the correct GraphQL path is in GQL_HOST. Used only for
  // build-time codegen; runtime requests go through app/utils/gqlRequest.ts.
  // The endpoint responds `WWW-Authenticate: Bearer`, so codegen needs the
  // token in GQL_TOKEN to introspect the schema:
  //
  // 'graphql-client': {
  //   clients: {
  //     default: {
  //       host: process.env.GQL_HOST,
  //       token: { type: 'Bearer', name: 'Authorization', value: process.env.GQL_TOKEN }
  //     }
  //   }
  // }
})
