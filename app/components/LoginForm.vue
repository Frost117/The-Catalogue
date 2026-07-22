<script setup lang="ts">
import { CALLING_CODES } from '~/utils/callingCodes'

const { t } = useI18n()
const emit = defineEmits<{ close: [] }>()

const {
  step,
  phone,
  callingCode,
  code,
  loading,
  errorMessage,
  submitPhoneStep,
  submitCodeStep
} = useAuthForm(() => emit('close'))

// `name` is included so the searchable select filters on the country name too
// (see filter-fields below); the compact label keeps the trigger tidy.
const callingCodeItems = CALLING_CODES.map(c => ({
  label: `${c.flag} +${c.code}`,
  value: c.code,
  name: c.name
}))
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <h2
      id="login-form-title"
      class="text-lg font-semibold text-highlighted"
    >
      {{ t('auth.login') }}
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
      <div class="flex items-end gap-2">
        <UFormField :label="t('auth.callingCodeLabel')">
          <USelectMenu
            v-model="callingCode"
            :items="callingCodeItems"
            value-key="value"
            :filter-fields="['label', 'name']"
            class="w-40"
          />
        </UFormField>
        <UFormField
          :label="t('auth.phoneLabel')"
          class="flex-1"
        >
          <UInput
            v-model="phone"
            type="tel"
            inputmode="numeric"
            :placeholder="t('auth.phonePlaceholder')"
            class="w-full"
          />
        </UFormField>
      </div>

      <UButton
        type="submit"
        block
        :loading="loading"
        :disabled="!phone"
        :label="t('auth.sendCode')"
      />
    </form>

    <form
      v-else
      class="flex flex-col gap-3"
      @submit.prevent="submitCodeStep"
    >
      <p class="text-sm text-muted">
        {{ t('auth.codeSentDescription', { phone: `+${callingCode} ${phone}` }) }}
      </p>

      <UFormField :label="t('auth.codeLabel')">
        <UInput
          v-model="code"
          inputmode="numeric"
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

    <!-- Required reCAPTCHA attribution: shown because the floating badge is
         hidden via CSS (see main.css), which Google permits only with this
         disclosure in its place. -->
    <i18n-t
      keypath="auth.recaptchaNotice"
      tag="p"
      class="text-xs text-muted"
      scope="global"
    >
      <template #privacy>
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          class="underline"
        >{{ t('auth.recaptchaPrivacy') }}</a>
      </template>
      <template #terms>
        <a
          href="https://policies.google.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          class="underline"
        >{{ t('auth.recaptchaTerms') }}</a>
      </template>
    </i18n-t>
  </div>
</template>
