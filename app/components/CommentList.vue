<script setup lang="ts">
import type { Comment } from '~/types/comment'

defineProps<{ comments: Comment[] }>()

const { t } = useI18n()
</script>

<template>
  <p
    v-if="!comments.length"
    class="text-muted"
  >
    {{ t('comments.empty') }}
  </p>

  <ul
    v-else
    class="flex flex-col gap-4"
  >
    <li
      v-for="comment in comments"
      :key="comment.id"
    >
      <UCard>
        <div class="flex items-center justify-between gap-3">
          <p class="font-medium text-highlighted">
            {{ comment.authorDisplayName }}
          </p>
          <span class="text-xs text-muted">
            {{ new Date(comment.createdAt).toLocaleDateString() }}
          </span>
        </div>

        <div class="mt-1 flex items-center gap-0.5">
          <UIcon
            v-for="n in 5"
            :key="n"
            name="i-lucide-star"
            class="size-4"
            :class="n <= comment.rating ? 'text-primary' : 'text-muted'"
          />
        </div>

        <p class="mt-2 whitespace-pre-wrap text-toned">
          {{ comment.body }}
        </p>
      </UCard>
    </li>
  </ul>
</template>
