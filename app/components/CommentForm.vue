<script setup lang="ts">
const props = defineProps<{ showId: string }>()
const emit = defineEmits<{ posted: [] }>()

const { t } = useI18n()
const { rating, body, posting, error, submit } = useCommentForm(() => props.showId)

async function handleSubmit() {
  if (await submit()) {
    emit('posted')
  }
}
</script>

<template>
  <form
    class="flex flex-col gap-3"
    @submit.prevent="handleSubmit"
  >
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :description="t('comments.postError')"
    />

    <div class="flex items-center gap-1">
      <UIcon
        v-for="n in 5"
        :key="n"
        name="i-lucide-star"
        class="size-6 cursor-pointer"
        :class="n <= rating ? 'text-primary' : 'text-muted'"
        @click="rating = n"
      />
    </div>

    <UTextarea
      v-model="body"
      :placeholder="t('comments.bodyPlaceholder')"
      :maxlength="2000"
      class="w-full"
    />

    <UButton
      type="submit"
      class="self-start"
      :loading="posting"
      :disabled="rating < 1 || !body.trim()"
      :label="t('comments.submit')"
    />
  </form>
</template>
