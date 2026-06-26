// Compose serves each content node per `variant` (a culture code). The live
// data currently has only `da` and `vi` variants. Per the architecture, the
// canonical baseline is English (the TV Maze ingest) with a fallback chain of
// requested locale → baseline → empty — but the EN baseline is NOT yet
// published to this environment (a backend/ingest gap). Until it is, Danish
// acts as the baseline.
//
// EN-READY: when the TV Maze EN ingest is published to Compose, change
// BASELINE_VARIANT to 'en'. That is the only change required here — the
// fallback logic in the composables already keys off this constant.
export const BASELINE_VARIANT = 'da'
