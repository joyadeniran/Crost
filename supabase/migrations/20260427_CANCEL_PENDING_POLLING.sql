-- EMERGENCY RESET: Stop Endless Polling & Cancel Stuck Goals
-- Run this in the Supabase SQL Editor

-- 1. Cancel all pending approvals that might be causing 404 polling loops
UPDATE approval_queue 
SET status = 'failed', 
    execution_result = '{"error": "Administratively cancelled to stop endless polling"}'::jsonb 
WHERE status = 'pending';

-- 2. Mark all running or pending tasks as failed so they don't block
UPDATE goal_tasks 
SET status = 'failed' 
WHERE status IN ('running', 'pending', 'planned', 'awaiting_approval');

-- 3. Cancel all executing or pending goals
UPDATE goals 
SET status = 'failed', 
    outcome = 'Goal administratively cancelled to stop endless polling loop.' 
WHERE status IN ('pending', 'planning', 'executing', 'awaiting_approval', 'clarifying');

-- 4. Reset all departments to idle
UPDATE departments 
SET status = 'idle', 
    current_task = null 
WHERE status != 'idle';
