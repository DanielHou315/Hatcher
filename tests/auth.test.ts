import { describe, expect, it } from 'vitest';
import { visibleEntries, type Entry } from '@/lib/content';
import { signContentToken, verifyContentToken } from '@/lib/content-token';
import { asRole, canSeeDrafts, roleCan } from '@/lib/roles';

describe('roles', () => {
  it('orders permissions user < editor < admin', () => {
    expect(roleCan('user', 'read')).toBe(true);
    expect(roleCan('user', 'write')).toBe(false);
    expect(roleCan('editor', 'write')).toBe(true);
    expect(roleCan('editor', 'publish')).toBe(false);
    expect(roleCan('admin', 'publish')).toBe(true);
    expect(canSeeDrafts(null)).toBe(false);
    expect(canSeeDrafts('user')).toBe(false);
    expect(canSeeDrafts('editor')).toBe(true);
  });

  it('reads stored roles, defaulting to user', () => {
    expect(asRole('admin')).toBe('admin');
    expect(asRole('user,editor')).toBe('editor');
    expect(asRole(null)).toBe('user');
    expect(asRole('superuser')).toBe('user');
  });
});

describe('draft visibility', () => {
  const e = (slug: string, status: 'draft' | 'ready', error?: string) => ({ slug, status, error }) as Entry;
  const entries = [e('a', 'ready'), e('b', 'draft'), e('c', 'ready', 'bad frontmatter')];

  it('shows readers only valid published pages', () => {
    expect(visibleEntries(entries, false).map((x) => x.slug)).toEqual(['a']);
    expect(visibleEntries(entries, true).map((x) => x.slug)).toEqual(['a', 'b', 'c']);
  });
});

describe('content tokens', () => {
  const now = Date.UTC(2026, 10, 16, 12, 30);
  const token = signContentToken('s3cret', 'concepts/x', now);

  it('verify for the same page and secret until they expire', () => {
    expect(verifyContentToken('s3cret', 'concepts/x', token, now)).toBe(true);
    expect(verifyContentToken('s3cret', 'concepts/x', token, now + 6 * 3600_000)).toBe(true);
    expect(verifyContentToken('s3cret', 'concepts/x', token, now + 8 * 3600_000)).toBe(false);
  });

  it('reject another page, another secret, or a tampered token', () => {
    expect(verifyContentToken('s3cret', 'concepts/y', token, now)).toBe(false);
    expect(verifyContentToken('other', 'concepts/x', token, now)).toBe(false);
    expect(verifyContentToken('s3cret', 'concepts/x', token.slice(0, -1) + 'A', now)).toBe(false);
    expect(verifyContentToken('s3cret', 'concepts/x', 'zzzz.abc', now)).toBe(false);
  });

  it('stay stable within the hour so frame URLs do not churn', () => {
    expect(signContentToken('s3cret', 'concepts/x', now + 10 * 60_000)).toBe(token);
  });
});
