<script setup lang="ts">
const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const pageSize = 24

function firstQuery(value: unknown): string {
  if (Array.isArray(value)) {
    return (value[0] as string) ?? ''
  }
  return (value as string) ?? ''
}

const searchInput = ref(firstQuery(route.query.q))
const search = ref(searchInput.value)
const genre = ref(firstQuery(route.query.genre))
const page = ref(Math.max(1, Number(route.query.page) || 1))

// Debounce typing into a committed search term; reset to page 1 on new search.
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    search.value = value
    page.value = 1
  }, 350)
})

watch(genre, () => {
  page.value = 1
})

// Keep filter/pagination state in the URL so results are shareable + SSR-able.
watch([search, genre, page], () => {
  router.replace({
    query: {
      ...(search.value ? { q: search.value } : {}),
      ...(genre.value ? { genre: genre.value } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {})
    }
  })
})

const { data: genres } = useGenresQuery(() => locale.value)

const genreItems = computed(() => [
  { label: t('catalogue.allGenres'), value: '' },
  ...(genres.value ?? []).map(g => ({ label: g, value: g }))
])

const { data, status, error, refresh } = useShowsQuery(() => ({
  locale: locale.value,
  page: page.value,
  pageSize,
  search: search.value,
  genre: genre.value
}))

const shows = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pending = computed(() => status.value === 'pending')
const hasFilters = computed(() => !!search.value || !!genre.value)

function clearFilters() {
  searchInput.value = ''
  search.value = ''
  genre.value = ''
  page.value = 1
}

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
          v-model="genre"
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
        {{ t('catalogue.resultsCount', { count: total }) }}
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
    <div
      v-else
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      <ShowCard
        v-for="show in shows"
        :key="show.id"
        :show="show"
      />
    </div>

    <div
      v-if="total > pageSize"
      class="mt-8 flex justify-center"
    >
      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="pageSize"
      />
    </div>
  </UContainer>
</template>
