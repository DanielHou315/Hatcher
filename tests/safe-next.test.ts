import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it('keeps paths on this site', () => {
    expect(safeNext('/p/abc?version=2#x')).toBe('/p/abc?version=2#x');
    expect(safeNext('/')).toBe('/');
  });

  it('refuses anything a browser could take to another site', () => {
    for (const bad of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/%09/evil.com'.replace('%09', '\t'), '/\n/evil.com', 'https://evil.com', 'evil.com', '/ /x', '', null, undefined]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
