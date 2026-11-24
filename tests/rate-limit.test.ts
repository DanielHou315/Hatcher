import { beforeEach, describe, expect, it } from 'vitest';
import { allow, resetRateLimits } from '@/lib/rate-limit';

describe('rate limit', () => {
  beforeEach(resetRateLimits);
  it('allows up to the limit in the window, then again once it passes', () => {
    const t = 1_000_000;
    expect([1, 2, 3].map((i) => allow('k', 2, 1000, t + i))).toEqual([true, true, false]);
    expect(allow('other', 2, 1000, t)).toBe(true);
    expect(allow('k', 2, 1000, t + 1500)).toBe(true);
  });
});
