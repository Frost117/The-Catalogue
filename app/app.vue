<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { loggedIn, logout } = useAuth()
const authModalOpen = ref(false)

// Locale-aware <html lang>, hreflang alternates and canonical for SEO.
const head = useLocaleHead()

const title = computed(() => t('app.name'))
const description = computed(() => t('app.tagline'))

useHead(() => ({
  htmlAttrs: { lang: head.value.htmlAttrs?.lang },
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    ...(head.value.link ?? [])
  ],
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ...(head.value.meta ?? [])
  ]
}))

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink
          :to="localePath('index')"
          :aria-label="t('app.name')"
        >
          <AppLogo class="h-6 w-auto shrink-0" />
        </NuxtLink>
      </template>

      <template #right>
        <LocaleSwitcher />
        <UColorModeButton />
        <UButton
          v-if="!loggedIn"
          variant="ghost"
          :label="t('auth.login')"
          @click="authModalOpen = true"
        />
        <UButton
          v-else
          variant="ghost"
          :label="t('auth.logout')"
          @click="logout()"
        />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UModal
      v-model:open="authModalOpen"
      :content="{ 'aria-labelledby': 'login-form-title' }"
    >
      <template #body>
        <LoginForm @close="authModalOpen = false" />
      </template>
    </UModal>

    <USeparator icon="i-lucide-tv" />

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          {{ t('app.name') }} • © {{ new Date().getFullYear() }}
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
