// Capability tokens for page content. Sandboxed frames cannot send the session cookie, so the
// viewer page checks access and signs the frame's URL instead: /c/~<token>/<page id>/<version>/...
//
// A token names the user it was made for and is bound to one page version. The content route
// checks that user's access again on every request, so removing a share or suspending an account
// takes effect at once, and a token for one version cannot open another.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MINUTE = 60_000;
const STEP = 10 * MINUTE;
/** Tokens last 2 hours plus up to 10 minutes; expiry is rounded so frame URLs stay stable across renders. */
const LIFETIME = 120 * MINUTE;
const USER_RE = /^[A-Za-z0-9_-]{1,64}$/;

function key(secret: string): Buffer {
  return createHash('sha256').update(`hatcher-content-token:v2:${secret}`).digest();
}

function mac(secret: string, pageId: string, version: number, userId: string, exp: number): string {
  return createHmac('sha256', key(secret)).update(`${pageId}:${version}:${userId}:${exp}`).digest('base64url');
}

export function signContentToken(secret: string, pageId: string, version: number, userId: string, now = Date.now()): string {
  if (!USER_RE.test(userId)) throw new Error('unexpected user id');
  const exp = Math.ceil(now / STEP) * STEP + LIFETIME;
  return `${userId}.${exp.toString(36)}.${mac(secret, pageId, version, userId, exp)}`;
}

/** The user the token was made for, if it is valid for this page version; otherwise null. */
export function verifyContentToken(secret: string, pageId: string, version: number, token: string, now = Date.now()): string | null {
  const [userId, expPart, sig] = token.split('.');
  if (!userId || !USER_RE.test(userId) || !expPart || !sig) return null;
  const exp = parseInt(expPart, 36);
  if (!Number.isFinite(exp) || exp < now || exp > now + LIFETIME + STEP) return null;
  const expected = Buffer.from(mac(secret, pageId, version, userId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}
