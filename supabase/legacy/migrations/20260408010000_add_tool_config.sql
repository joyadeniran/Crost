-- Migration: Add config column to available_tools
ALTER TABLE available_tools ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';
