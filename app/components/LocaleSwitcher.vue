<script setup lang="ts">
const { t } = useI18n()
const { current, items } = useLocaleMenu()
</script>

<template>
  <UDropdownMenu :items="items">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-languages"
      :label="current?.name ?? current?.code"
      :aria-label="t('locale.label')"
    />
  </UDropdownMenu>
</template>
