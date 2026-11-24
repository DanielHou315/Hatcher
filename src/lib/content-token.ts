// Short-lived capability tokens for page content. Sandboxed frames cannot send the session cookie,
// so the viewer page checks access and signs the frame's URL instead: /c/~<token>/<page id>/<version>/...
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MINUTE = 60_000;
const STEP = 10 * MINUTE;
/** Tokens last 2 hours plus up to 10 minutes; expiry is rounded so frame URLs stay stable across renders. */
const LIFETIME = 120 * MINUTE;

function key(secret: string): Buffer {
  return createHash('sha256').update(`hatcher-content-token:${secret}`).digest();
}

function mac(secret: string, scope: string, exp: number): string {
  return createHmac('sha256', key(secret)).update(`${scope}:${exp}`).digest('base64url');
}

/** `scope` is the page id. */
export function signContentToken(secret: string, scope: string, now = Date.now()): string {
  const exp = Math.ceil(now / STEP) * STEP + LIFETIME;
  return `${exp.toString(36)}.${mac(secret, scope, exp)}`;
}

export function verifyContentToken(secret: string, scope: string, token: string, now = Date.now()): boolean {
  const [expPart, sig] = token.split('.');
  if (!expPart || !sig) return false;
  const exp = parseInt(expPart, 36);
  if (!Number.isFinite(exp) || exp < now || exp > now + LIFETIME + STEP) return false;
  const expected = Buffer.from(mac(secret, scope, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
