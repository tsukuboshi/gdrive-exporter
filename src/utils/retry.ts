import { setTimeout as sleep } from "node:timers/promises";

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;

const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

interface ApiErrorLike {
  code?: number | string;
  status?: number;
  errors?: Array<{ reason?: string }>;
  response?: { data?: { error?: { errors?: Array<{ reason?: string }> } } };
}

function statusOf(error: unknown): number | undefined {
  const apiError = error as ApiErrorLike;
  if (typeof apiError?.status === "number") {
    return apiError.status;
  }
  const code = apiError?.code;
  const parsed = typeof code === "string" ? Number.parseInt(code, 10) : code;
  return typeof parsed === "number" && !Number.isNaN(parsed)
    ? parsed
    : undefined;
}

function isRateLimited(error: unknown): boolean {
  const apiError = error as ApiErrorLike;
  const reasons =
    apiError?.errors ?? apiError?.response?.data?.error?.errors ?? [];
  return reasons.some(
    (entry) => entry.reason != null && RATE_LIMIT_REASONS.has(entry.reason),
  );
}

function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined) {
    return false;
  }
  // Per the official guide, 403 should only be retried when it is a
  // rate-limit response; permission errors would just waste ~30s of backoff.
  if (status === 403) {
    return isRateLimited(error);
  }
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Runs an API call with exponential backoff + jitter, following
 * https://developers.google.com/workspace/drive/api/guides/handle-errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      await sleep(delay);
    }
  }
  throw lastError;
}
