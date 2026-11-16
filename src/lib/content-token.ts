// Short-lived capability tokens for sandboxed content that is not public (drafts, or every page
// on a private site). Sandboxed frames cannot send the session cookie, so the page that renders a
// frame signs its URL path instead: /c/~<token>/<kind dir>/<slug>/...
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const HOUR = 3600_000;
/** Tokens last 6 to 7 hours; expiry is rounded to the hour so frame URLs stay stable across renders. */
const LIFETIME = 6 * HOUR;

function key(secret: string): Buffer {
  return createHash('sha256').update(`hatcher-content-token:${secret}`).digest();
}

function mac(secret: string, scope: string, exp: number): string {
  return createHmac('sha256', key(secret)).update(`${scope}:${exp}`).digest('base64url');
}

/** `scope` is `<kind dir>/<slug>`. */
export function signContentToken(secret: string, scope: string, now = Date.now()): string {
  const exp = Math.ceil(now / HOUR) * HOUR + LIFETIME;
  return `${exp.toString(36)}.${mac(secret, scope, exp)}`;
}

export function verifyContentToken(secret: string, scope: string, token: string, now = Date.now()): boolean {
  const [expPart, sig] = token.split('.');
  if (!expPart || !sig) return false;
  const exp = parseInt(expPart, 36);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = Buffer.from(mac(secret, scope, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
