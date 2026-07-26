import { logger } from './logger.js';

export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  label?: string;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with exponential backoff retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const label = options.label ?? 'operation';
  const shouldRetry =
    options.shouldRetry ??
    ((err: unknown) => {
      if (err instanceof Error && /abort|cancel/i.test(err.message)) return false;
      return true;
    });

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = attempt < attempts && shouldRetry(error, attempt);
      logger.warn(`${label} failed (attempt ${attempt}/${attempts})`, {
        error: error instanceof Error ? error.message : String(error),
        retrying: retryable,
      });
      if (!retryable) break;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}
