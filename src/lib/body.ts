// Reading request bodies with a hard size cap. Content-Length is checked first, but chunked bodies
// have none, so the cap is enforced while reading too.

export class BodyTooLarge extends Error {
  constructor(readonly max: number) {
    super(`request body over ${Math.round(max / 1024)} KB`);
  }
}

/** The whole body, or BodyTooLarge once it passes `max` bytes. */
export async function readCapped(request: Request, max: number): Promise<Buffer> {
  if (Number(request.headers.get('content-length') ?? 0) > max) throw new BodyTooLarge(max);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLarge(max);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** A copy of `request` whose body is already read, within `max` bytes, for code that reads it again. */
export async function withCappedBody(request: Request, max: number): Promise<Request> {
  if (request.method === 'GET' || request.method === 'HEAD') return request;
  const body = await readCapped(request, max);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.delete('transfer-encoding');
  return new Request(request.url, { method: request.method, headers, body: new Uint8Array(body) });
}
