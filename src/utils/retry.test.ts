import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry.js";

function apiError(code: number, reason?: string): Error {
  const error = new Error(`API error ${code}`) as Error & {
    code: number;
    errors?: Array<{ reason: string }>;
  };
  error.code = code;
  if (reason) {
    error.errors = [{ reason }];
  }
  return error;
}

describe("withRetry", () => {
  it("returns the result when the call succeeds first try", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(429))
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on 403 rate limit and 5xx errors", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(403, "userRateLimitExceeded"))
      .mockRejectedValueOnce(apiError(500))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("does not retry on a plain 403 permission error", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(403));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(
      "API error 403",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(404));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(
      "API error 404",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const fn = vi.fn().mockRejectedValue(apiError(429));
    await expect(
      withRetry(fn, { baseDelayMs: 1, maxRetries: 3 }),
    ).rejects.toThrow("API error 429");
    expect(fn).toHaveBeenCalledTimes(4); // initial call + 3 retries
  });
});
