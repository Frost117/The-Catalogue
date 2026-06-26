<script setup lang="ts">
import type { ShowSummary } from '~/types/show'

const props = defineProps<{ show: ShowSummary }>()

const { t } = useI18n()
const localePath = useLocalePath()

const to = computed(() => localePath({ name: 'shows-slug', params: { slug: props.show.slug } }))
const rating = computed(() => formatRating(props.show.rating))
const summary = computed(() => stripHtml(props.show.summary))
</script>

<template>
  <UCard
    :to="to"
    class="group h-full transition-shadow hover:shadow-lg"
    :ui="{ body: 'flex flex-col gap-2' }"
  >
    <template #header>
      <div class="aspect-2/3 w-full overflow-hidden rounded-md bg-elevated">
        <img
          v-if="show.image"
          :src="show.image"
          :alt="show.title"
          loading="lazy"
          class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        >
        <div
          v-else
          class="flex size-full items-center justify-center text-muted"
        >
          <UIcon
            name="i-lucide-image-off"
            class="size-8"
          />
        </div>
      </div>
    </template>

    <div class="flex items-start justify-between gap-2">
      <h3 class="line-clamp-2 font-semibold text-highlighted">
        {{ show.title }}
      </h3>
      <UBadge
        v-if="rating"
        color="primary"
        variant="subtle"
        size="sm"
        :aria-label="t('show.rating')"
      >
        <UIcon
          name="i-lucide-star"
          class="size-3"
        />
        {{ rating }}
      </UBadge>
    </div>

    <div
      v-if="show.genres?.length"
      class="flex flex-wrap gap-1"
    >
      <UBadge
        v-for="genre in show.genres.slice(0, 3)"
        :key="genre"
        color="neutral"
        variant="soft"
        size="sm"
      >
        {{ genre }}
      </UBadge>
    </div>

    <p
      v-if="summary"
      class="line-clamp-3 text-sm text-muted"
    >
      {{ summary }}
    </p>
  </UCard>
</template>
