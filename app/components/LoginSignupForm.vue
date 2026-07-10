<script setup lang="ts">
const { t } = useI18n()
const emit = defineEmits<{ close: [] }>()

const {
  mode,
  step,
  phone,
  displayName,
  code,
  loading,
  errorMessage,
  toggleMode,
  submitPhoneStep,
  submitCodeStep
} = useAuthForm(() => emit('close'))
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <h2 class="text-lg font-semibold text-highlighted">
      {{ mode === 'signup' ? t('auth.signup') : t('auth.login') }}
    </h2>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :description="errorMessage"
    />

    <form
      v-if="step === 'phone'"
      class="flex flex-col gap-3"
      @submit.prevent="submitPhoneStep"
    >
      <UFormField :label="t('auth.phoneLabel')">
        <UInput
          v-model="phone"
          type="tel"
          :placeholder="t('auth.phonePlaceholder')"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="mode === 'signup'"
        :label="t('auth.displayNameLabel')"
      >
        <UInput
          v-model="displayName"
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        block
        :loading="loading"
        :disabled="!phone || (mode === 'signup' && !displayName.trim())"
        :label="t('auth.sendCode')"
      />

      <UButton
        variant="link"
        color="neutral"
        :label="mode === 'signup' ? t('auth.switchToLogin') : t('auth.switchToSignup')"
        @click="toggleMode"
      />
    </form>

    <form
      v-else
      class="flex flex-col gap-3"
      @submit.prevent="submitCodeStep"
    >
      <p class="text-sm text-muted">
        {{ t('auth.codeSentDescription', { phone }) }}
      </p>

      <UFormField :label="t('auth.codeLabel')">
        <UInput
          v-model="code"
          class="w-full"
        />
      </UFormField>

      <UButton
        type="submit"
        block
        :loading="loading"
        :disabled="!code"
        :label="t('auth.verify')"
      />
    </form>
  </div>
</template>
