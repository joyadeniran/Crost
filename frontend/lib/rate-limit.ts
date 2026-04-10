// lib/rate-limit.ts
// Simple in-memory rate limiting for API routes.
// In a serverless environment, this resets on cold starts.
// For more robust limiting, use Redis.

interface RateLimitState {
  count: number;
  resetAt: number;
}

const stores = new Map<string, RateLimitState>();

/**
 * Checks if a user has exceeded their rate limit.
 * @param userId The user's UUID
 * @param limit Max requests allowed in the window
 * @param windowMs Time window in milliseconds
 * @returns { allowed: boolean, retryAfterSeconds?: number }
 */
export function checkRateLimit(userId: string, limit: number = 60, windowMs: number = 60000) {
  const now = Date.now();
  const state = stores.get(userId);

  if (!state || now > state.resetAt) {
    // New window
    stores.set(userId, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }

  if (state.count >= limit) {
    const retryAfterSeconds = Math.ceil((state.resetAt - now) / 1000);
    return { 
      allowed: false, 
      retryAfterSeconds 
    };
  }

  state.count++;
  return { allowed: true };
}
