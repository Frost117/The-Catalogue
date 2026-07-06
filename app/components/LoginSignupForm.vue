<script setup lang="ts">
const { t } = useI18n()
const { sendOtp, signup, login } = useAuth()

const emit = defineEmits<{ close: [] }>()

const mode = ref<'login' | 'signup'>('login')
const step = ref<'phone' | 'code'>('phone')
const phone = ref('')
const displayName = ref('')
const code = ref('')
const loading = ref(false)
const errorMessage = ref<string | null>(null)

function toggleMode() {
  mode.value = mode.value === 'login' ? 'signup' : 'login'
  errorMessage.value = null
}

async function submitPhoneStep() {
  loading.value = true
  errorMessage.value = null
  try {
    await sendOtp(phone.value)
    step.value = 'code'
  } catch {
    errorMessage.value = t('auth.invalidPhone')
  } finally {
    loading.value = false
  }
}

async function submitCodeStep() {
  loading.value = true
  errorMessage.value = null
  try {
    if (mode.value === 'signup') {
      await signup(phone.value, displayName.value, code.value)
    } else {
      await login(phone.value, code.value)
    }
    emit('close')
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    if (statusCode === 409) {
      errorMessage.value = t('auth.phoneAlreadyRegistered')
    } else if (statusCode === 404) {
      errorMessage.value = t('auth.noAccount')
    } else {
      errorMessage.value = t('auth.invalidCode')
    }
  } finally {
    loading.value = false
  }
}
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
