// lib/gemini-models.ts — the one place Gemini model ids live.
// Google retires model ids for new API users regularly (the 2.x family now 404s), so every id is
// env-overridable: GEMINI_MODEL (primary), GEMINI_MODEL_LITE (cheap/fast), GEMINI_MODEL_PRO (strongest).
export const WORKING_GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
export const LITE_GEMINI_MODEL = process.env.GEMINI_MODEL_LITE ?? 'gemini-3.5-flash-lite'
export const PRO_GEMINI_MODEL = process.env.GEMINI_MODEL_PRO ?? 'gemini-3.1-pro-preview'
