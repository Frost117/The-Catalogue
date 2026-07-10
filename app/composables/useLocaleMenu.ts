import type { DropdownMenuItem } from '@nuxt/ui'

export function useLocaleMenu() {
  const { locale, locales, setLocale } = useI18n()

  const current = computed(() => locales.value.find(l => l.code === locale.value))

  const items = computed<DropdownMenuItem[]>(() =>
    locales.value.map(l => ({
      label: l.name ?? l.code,
      icon: l.code === locale.value ? 'i-lucide-check' : undefined,
      onSelect: () => setLocale(l.code)
    }))
  )

  return { current, items }
}
