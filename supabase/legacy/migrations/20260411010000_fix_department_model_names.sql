-- Migration: Fix department model_names to match current LiteLLM config
-- All model_name values must correspond to a model_name entry in litellm/config.yaml
-- Valid values: groq/llama-3.3-70b-versatile | gemini/gemini-2.5-flash |
--               anthropic/claude-sonnet-4.6  | anthropic/claude-opus-4.6

-- 1. Fix Groq legacy aliases
UPDATE departments
SET
  model_name     = 'groq/llama-3.3-70b-versatile',
  model_provider = 'groq'
WHERE model_name IN (
  'cloud/groq-llama',
  'groq/llama3-70b-8192',
  'groq/llama3-8b-8192'
);

-- 2. Fix Gemini legacy aliases (includes deprecated 1.5 models and old cloud/* naming)
UPDATE departments
SET
  model_name     = 'gemini/gemini-2.5-flash',
  model_provider = 'gemini'
WHERE model_name IN (
  'cloud/gemini-pro',
  'gemini/gemini-1.5-flash',
  'gemini/gemini-1.5-pro',
  'gemini/gemini-2.5-flash-preview-04-17',
  'local/gemma3',
  'local/gemma3-lite',
  'local/llama3',
  'local/mistral'
);

-- 3. Fix Claude legacy aliases
UPDATE departments
SET
  model_name     = 'anthropic/claude-sonnet-4.6',
  model_provider = 'claude'
WHERE model_name IN (
  'cloud/claude-sonnet',
  'anthropic/claude-3-5-sonnet-20241022',
  'anthropic/claude-sonnet-4-5-20250929'
);

UPDATE departments
SET
  model_name     = 'anthropic/claude-opus-4.6',
  model_provider = 'claude'
WHERE model_name IN (
  'cloud/claude-opus',
  'anthropic/claude-3-opus-20240229',
  'anthropic/claude-opus-4-5-20251101'
);

-- 4. Update the column default so new rows default to a valid model
ALTER TABLE departments
  ALTER COLUMN model_name SET DEFAULT 'groq/llama-3.3-70b-versatile';
