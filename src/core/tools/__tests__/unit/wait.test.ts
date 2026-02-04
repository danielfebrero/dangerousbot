/**
 * Unit tests for wait tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitHandler } from '../../wait.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

describe('wait tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createMockToolContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should have the correct name', () => {
    expect(waitHandler.name).toBe('wait');
  });

  it('should wait for the specified number of seconds', async () => {
    const promise = waitHandler.execute({ seconds: 0.01 }, ctx);

    vi.advanceTimersByTime(10);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.waited).toBe(0.01);
    expect(result.message).toContain('0.01');
  });

  it('should return error for NaN input', async () => {
    const result = await waitHandler.execute({ seconds: NaN }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error for non-number input', async () => {
    const result = await waitHandler.execute({ seconds: 'abc' }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error for negative seconds', async () => {
    const result = await waitHandler.execute({ seconds: -1 }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error when exceeding max wait of 300 seconds', async () => {
    const result = await waitHandler.execute({ seconds: 301 }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('300');
  });

  it('should accept exactly 300 seconds (the max)', async () => {
    const promise = waitHandler.execute({ seconds: 300 }, ctx);

    vi.advanceTimersByTime(300_000);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.waited).toBe(300);
  });

  it('should accept 0 seconds', async () => {
    const promise = waitHandler.execute({ seconds: 0 }, ctx);

    vi.advanceTimersByTime(0);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.waited).toBe(0);
  });

  it('should handle plural seconds in message', async () => {
    const promise = waitHandler.execute({ seconds: 2 }, ctx);

    vi.advanceTimersByTime(2000);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.message).toContain('secondes');
  });

  it('should handle singular second in message', async () => {
    const promise = waitHandler.execute({ seconds: 1 }, ctx);

    vi.advanceTimersByTime(1000);

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.message).not.toContain('secondes');
  });

  it('should reject when abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const ctxWithAbort = createMockToolContext({
      abortSignal: controller.signal,
    });

    await expect(
      waitHandler.execute({ seconds: 5 }, ctxWithAbort),
    ).rejects.toThrow('annulée');
  });

  it('should reject when abort signal fires during wait', async () => {
    const controller = new AbortController();

    const ctxWithAbort = createMockToolContext({
      abortSignal: controller.signal,
    });

    const promise = waitHandler.execute({ seconds: 10 }, ctxWithAbort);

    // Abort after 1 second
    vi.advanceTimersByTime(1000);
    controller.abort();

    await expect(promise).rejects.toThrow('annulée');
  });
});
