<script setup lang="ts">
import { useShowsQuery } from '~/composables/useShowsQuery'
import { useGenresQuery } from '~/composables/useGenresQuery'
import { useCatalogueFilters } from '~/composables/useCatalogueFilters'

const { t, locale } = useI18n()

const { data: genres } = useGenresQuery()
const {
  searchInput,
  search,
  genre,
  genreSelection,
  genreItems,
  hasFilters,
  clearFilters
} = useCatalogueFilters(() => genres.value)

const {
  items: shows,
  hasMore,
  loadMore,
  loadingMore,
  status,
  error,
  refresh
} = useShowsQuery(() => ({
  locale: locale.value,
  search: search.value,
  genre: genre.value
}))

const pending = computed(() => status.value === 'pending')

useSeoMeta({
  title: () => t('catalogue.title'),
  description: () => t('app.tagline')
})
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6 flex flex-col gap-4">
      <h1 class="text-2xl font-bold text-highlighted">
        {{ t('catalogue.title') }}
      </h1>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <UInput
          v-model="searchInput"
          icon="i-lucide-search"
          :placeholder="t('catalogue.searchPlaceholder')"
          class="sm:max-w-xs"
        />
        <USelect
          v-model="genreSelection"
          :items="genreItems"
          value-key="value"
          :aria-label="t('catalogue.genreLabel')"
          class="sm:w-48"
        />
        <UButton
          v-if="hasFilters"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :label="t('catalogue.clearFilters')"
          @click="clearFilters"
        />
      </div>

      <p
        v-if="!pending && !error"
        class="text-sm text-muted"
      >
        {{ t('catalogue.resultsCount', { count: shows.length }) }}
      </p>
    </div>

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

    <!-- Loading skeletons -->
    <div
      v-else-if="pending"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      <div
        v-for="n in 12"
        :key="n"
        class="flex flex-col gap-2"
      >
        <USkeleton class="aspect-2/3 w-full rounded-md" />
        <USkeleton class="h-4 w-3/4" />
        <USkeleton class="h-3 w-1/2" />
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="shows.length === 0"
      class="flex flex-col items-center gap-3 py-16 text-center text-muted"
    >
      <UIcon
        name="i-lucide-search-x"
        class="size-10"
      />
      <p>{{ t('catalogue.noResults') }}</p>
      <UButton
        v-if="hasFilters"
        color="neutral"
        variant="soft"
        :label="t('catalogue.clearFilters')"
        @click="clearFilters"
      />
    </div>

    <!-- Results -->
    <template v-else>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <ShowCard
          v-for="show in shows"
          :key="show.id"
          :show="show"
        />
      </div>

      <div
        v-if="hasMore"
        class="mt-8 flex justify-center"
      >
        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          :loading="loadingMore"
          :label="t('catalogue.loadMore')"
          @click="loadMore"
        />
      </div>
    </template>
  </UContainer>
</template>
