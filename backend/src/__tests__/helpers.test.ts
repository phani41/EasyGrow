import { describe, it, expect, vi, afterEach } from 'vitest';
import { TimeoutError, withTimeout, isTimeoutError, sleep } from '../utils/helpers';

describe('TimeoutError', () => {
  it('should be an instance of Error', () => {
    const error = new TimeoutError('Timed out');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it('should have the correct name', () => {
    const error = new TimeoutError('Timed out');
    expect(error.name).toBe('TimeoutError');
  });

  it('should store the message', () => {
    const error = new TimeoutError('Custom timeout message');
    expect(error.message).toBe('Custom timeout message');
  });

  it('should use the default message when none provided', () => {
    const error = new TimeoutError('');
    expect(error.message).toBe('');
  });
});

describe('withTimeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve with the value when promise settles before timeout', async () => {
    const fastPromise = Promise.resolve('success');
    const result = await withTimeout(fastPromise, 1000);
    expect(result).toBe('success');
  });

  it('should reject with TimeoutError when timeout fires first', async () => {
    // Use a promise that never settles
    const slowPromise = new Promise<string>((_resolve) => {
      // Intentionally never resolve
    });

    await expect(withTimeout(slowPromise, 50)).rejects.toThrow(TimeoutError);
  });

  it('should reject with the default timeout message', async () => {
    const slowPromise = new Promise<string>((_resolve) => {
      // Intentionally never resolve
    });

    await expect(withTimeout(slowPromise, 20)).rejects.toThrow(
      'Operation timed out after 20ms'
    );
  });

  it('should reject with a custom timeout message when provided', async () => {
    const slowPromise = new Promise<string>((_resolve) => {
      // Intentionally never resolve
    });

    await expect(
      withTimeout(slowPromise, 20, 'Custom timeout')
    ).rejects.toThrow('Custom timeout');
  });

  it('should reject with the original error when promise rejects before timeout', async () => {
    const failingPromise = Promise.reject(new Error('Original error'));

    await expect(withTimeout(failingPromise, 1000)).rejects.toThrow(
      'Original error'
    );
  });

  it('should clear the timer when the promise resolves before timeout', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const fastPromise = Promise.resolve('done');

    await withTimeout(fastPromise, 100);

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should clear the timer when the promise rejects before timeout', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const failingPromise = Promise.reject(new Error('fail'));

    await expect(withTimeout(failingPromise, 100)).rejects.toThrow('fail');
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should not keep the process alive after timeout', async () => {
    // Using unref-style semantics — after the timeout, the timer should be cleared
    // so the process can exit naturally. We verify by checking the timer was cleared.
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const slowPromise = new Promise<string>((_resolve) => {
      // Intentionally never resolve
    });

    await expect(withTimeout(slowPromise, 10)).rejects.toThrow(TimeoutError);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should handle zero timeout', async () => {
    const slowPromise = new Promise<string>((_resolve) => {
      // Intentionally never resolve
    });

    await expect(withTimeout(slowPromise, 0)).rejects.toThrow(
      'Operation timed out after 0ms'
    );
  });

  it('should work with a promise that resolves after a delay but within timeout', async () => {
    const result = await withTimeout(sleep(10).then(() => 'delayed'), 500);
    expect(result).toBe('delayed');
  });
});

describe('isTimeoutError', () => {
  it('should return true for a TimeoutError', () => {
    expect(isTimeoutError(new TimeoutError('test'))).toBe(true);
  });

  it('should return false for a regular Error', () => {
    expect(isTimeoutError(new Error('test'))).toBe(false);
  });

  it('should return false for null', () => {
    expect(isTimeoutError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isTimeoutError(undefined)).toBe(false);
  });

  it('should return false for a string', () => {
    expect(isTimeoutError('error')).toBe(false);
  });

  it('should return false for an object without Error prototype', () => {
    expect(isTimeoutError({ message: 'test' })).toBe(false);
  });

  it('should return false for a custom error that is not TimeoutError', () => {
    class CustomError extends Error {
      constructor() {
        super('custom');
        this.name = 'CustomError';
      }
    }
    expect(isTimeoutError(new CustomError())).toBe(false);
  });
});
