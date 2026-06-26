<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <span class="inline-flex items-center gap-2 font-bold text-highlighted">
    <UIcon
      name="i-lucide-tv"
      class="size-6 text-primary"
    />
    <span>{{ t('app.name') }}</span>
  </span>
</template>
