import type { Readable } from 'node:stream';

/** Every byte a stream yields, joined: what an S3 object body holds.
 *
 *  Example: `expect(await bytesOf(object.body)).toEqual(PNG_BYTES)` */
export async function bytesOf(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return new Uint8Array(Buffer.concat(chunks));
}
