<script setup lang="ts">
import { useShowQuery } from '~/composables/useShowQuery'
import { formatRating, formatYear, groupEpisodesBySeason, stripHtml } from '~/utils/showHelpers'

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const slug = computed(() => String(route.params.slug))

const { data, status, error, refresh } = await useShowQuery(
  () => slug.value,
  () => locale.value
)

const show = computed(() => data.value?.show ?? null)
const summaryLang = computed(() => data.value?.summaryLang ?? null)

// 404 when the show genuinely doesn't exist (loaded, but null).
if (!show.value && status.value !== 'pending' && !error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: t('show.notFound'),
    fatal: true
  })
}

const rating = computed(() => formatRating(show.value?.rating))
const summary = computed(() => stripHtml(show.value?.summary))
const year = computed(() => formatYear(show.value?.premiered))
const seasons = computed(() => groupEpisodesBySeason(show.value?.episodes ?? []))

// The summary was served in a different language than requested (only summaries
// are localized in this schema; the fallback notice reflects that).
const fallbackLanguage = computed(() =>
  summaryLang.value && summaryLang.value !== locale.value
    ? t(`locale.${summaryLang.value}`)
    : null
)

useSeoMeta({
  title: () => show.value?.title ?? t('show.notFound'),
  description: () => summary.value || t('app.tagline'),
  ogTitle: () => show.value?.title,
  ogDescription: () => summary.value,
  ogImage: () => show.value?.image ?? undefined
})
</script>

<template>
  <UContainer class="py-8">
    <UButton
      :to="localePath('index')"
      color="neutral"
      variant="link"
      icon="i-lucide-arrow-left"
      :label="t('show.back')"
      class="mb-6 px-0"
    />

    <!-- Error -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('common.error')"
      :description="t('common.errorDescription')"
      :actions="[{ label: t('common.retry'), color: 'error', variant: 'solid', onClick: () => refresh() }]"
    />

    <!-- Loading -->
    <div
      v-else-if="status === 'pending'"
      class="flex flex-col gap-6 md:flex-row"
    >
      <USkeleton class="aspect-2/3 w-full shrink-0 rounded-lg md:w-64" />
      <div class="flex flex-1 flex-col gap-4">
        <USkeleton class="h-8 w-2/3" />
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-24 w-full" />
      </div>
    </div>

    <template v-else-if="show">
      <UAlert
        v-if="fallbackLanguage"
        color="warning"
        variant="subtle"
        icon="i-lucide-languages"
        class="mb-6"
        :description="t('common.fallbackNotice', { language: fallbackLanguage })"
      />

      <!-- Header -->
      <div class="flex flex-col gap-6 md:flex-row">
        <div class="aspect-2/3 w-full shrink-0 overflow-hidden rounded-lg bg-elevated md:w-64">
          <img
            v-if="show.image"
            :src="show.image"
            :alt="show.title"
            class="size-full object-cover"
          >
          <div
            v-else
            class="flex size-full items-center justify-center text-muted"
          >
            <UIcon
              name="i-lucide-image-off"
              class="size-10"
            />
          </div>
        </div>

        <div class="flex flex-1 flex-col gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-3xl font-bold text-highlighted">
              {{ show.title }}
            </h1>
            <UBadge
              v-if="rating"
              color="primary"
              variant="subtle"
              size="lg"
            >
              <UIcon
                name="i-lucide-star"
                class="size-4"
              />
              {{ rating }}
            </UBadge>
          </div>

          <p
            v-if="show.status || show.network || year"
            class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted"
          >
            <span v-if="show.status">{{ show.status }}</span>
            <span v-if="show.status && (show.network || year)">·</span>
            <span v-if="show.network">{{ show.network }}</span>
            <span v-if="show.network && year">·</span>
            <span v-if="year">{{ year }}</span>
          </p>

          <div
            v-if="show.genres?.length"
            class="flex flex-wrap gap-1.5"
          >
            <UBadge
              v-for="g in show.genres"
              :key="g"
              color="neutral"
              variant="soft"
            >
              {{ g }}
            </UBadge>
          </div>

          <div>
            <h2 class="mb-1 text-sm font-semibold tracking-wide text-muted uppercase">
              {{ t('show.summary') }}
            </h2>
            <p class="text-toned">
              {{ summary || t('show.noSummary') }}
            </p>
          </div>
        </div>
      </div>

      <!-- Cast -->
      <section class="mt-10">
        <h2 class="mb-4 text-xl font-semibold text-highlighted">
          {{ t('show.cast') }}
        </h2>
        <p
          v-if="!show.cast?.length"
          class="text-muted"
        >
          {{ t('show.noCast') }}
        </p>
        <div
          v-else
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
          <div
            v-for="member in show.cast"
            :key="member.id"
            class="flex items-center gap-3"
          >
            <UAvatar
              :src="member.image ?? undefined"
              :alt="member.name"
              size="lg"
            />
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">
                {{ member.name }}
              </p>
              <p
                v-if="member.character"
                class="truncate text-sm text-muted"
              >
                {{ member.character }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Episodes -->
      <section class="mt-10">
        <h2 class="mb-4 text-xl font-semibold text-highlighted">
          {{ t('show.episodes') }}
        </h2>
        <p
          v-if="!seasons.length"
          class="text-muted"
        >
          {{ t('show.noEpisodes') }}
        </p>
        <div
          v-else
          class="flex flex-col gap-6"
        >
          <div
            v-for="group in seasons"
            :key="group.season"
          >
            <h3 class="mb-2 font-semibold text-toned">
              {{ t('show.season', { number: group.season }) }}
            </h3>
            <ul class="divide-y divide-default rounded-md border border-default">
              <li
                v-for="ep in group.episodes"
                :key="ep.id"
                class="flex items-baseline gap-3 px-4 py-2.5"
              >
                <span class="w-10 shrink-0 text-sm font-medium text-muted">
                  {{ group.season }}×{{ String(ep.number).padStart(2, '0') }}
                </span>
                <span class="text-toned">{{ ep.name }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>
  </UContainer>
</template>
