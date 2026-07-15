// Nitro server utils (e.g. server/utils/phone.ts) call `createError` as a global
// auto-import that only exists in the Nitro runtime, not under Vitest. Provide a
// minimal stand-in that mirrors h3's shape (an Error carrying statusCode /
// statusMessage) so thrown errors can be asserted on. Only set when absent, so the
// real auto-import wins wherever it exists.
interface H3ErrorInput { statusCode?: number, statusMessage?: string, message?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).createError ??= (input: H3ErrorInput | string) => {
  const opts = typeof input === 'string' ? { message: input } : input
  const err = new Error(opts.statusMessage ?? opts.message ?? 'Error')
  return Object.assign(err, opts)
}
