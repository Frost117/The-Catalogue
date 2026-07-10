<script setup lang="ts">
import { formatRating, stripHtml } from '~/utils/showHelpers'
import { showNumericId } from '~/utils/mapShow'
import { useSeasonCount } from '~/composables/useSeasonCount'
import type { ShowSummary } from '~/types/show'

// Show the hover preview only when the summary is long enough that the card's
// 3-line clamp is likely cutting it off. Char-count heuristic (card width varies
// across the 2–6 column breakpoints, so it's approximate but SSR-safe); tune if
// needed.
const SUMMARY_POPOVER_THRESHOLD = 140

const props = defineProps<{ show: ShowSummary }>()

const { t } = useI18n()

const fullSummary = computed(() => stripHtml(props.show.summary))
const rating = computed(() => formatRating(props.show.rating))
const hasLongSummary = computed(() => fullSummary.value.length > SUMMARY_POPOVER_THRESHOLD)

// Season count isn't part of the catalogue data; fetch it lazily the first time
// the popover opens (never on page load), cached per show by the composable key.
const tvShowId = computed(() => showNumericId(props.show.id))
const { data: seasons, status: seasonsStatus, ensureLoaded } = useSeasonCount(tvShowId.value ?? -1)

function onOpen(open: boolean) {
  if (open) ensureLoaded()
}
</script>

<template>
  <UPopover
    v-if="hasLongSummary"
    mode="hover"
    :open-delay="150"
    :close-delay="100"
    :content="{ side: 'right', align: 'start' }"
    @update:open="onOpen"
  >
    <ShowCardTile :show="show" />

    <template #content>
      <div class="flex w-72 max-w-[90vw] flex-col gap-2 p-4">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-highlighted">
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
            v-for="genre in show.genres"
            :key="genre"
            color="neutral"
            variant="soft"
            size="sm"
          >
            {{ genre }}
          </UBadge>
        </div>

        <p class="max-h-48 overflow-y-auto text-sm text-muted">
          {{ fullSummary }}
        </p>

        <USkeleton
          v-if="seasonsStatus === 'pending'"
          class="h-4 w-20"
        />
        <p
          v-else-if="seasons"
          class="text-sm font-medium text-toned"
        >
          {{ t('catalogue.seasonsCount', { count: seasons }, seasons) }}
        </p>
      </div>
    </template>
  </UPopover>

  <ShowCardTile
    v-else
    :show="show"
  />
</template>
