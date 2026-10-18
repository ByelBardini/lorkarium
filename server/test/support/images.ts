import { assetResponseDto, type AssetDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import type { SignedInUser } from './sign-in';
import type { Table } from './tables';

/** A solid PNG generated on the spot (no binary in the repo).
 *
 *  Example: `await pngOf(1400, 700)` */
export async function pngOf(width: number, height: number): Promise<Buffer> {
  const background = { r: 120, g: 60, b: 200, alpha: 1 };
  return sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer();
}

/** Sends a `width`×`height` PNG to `table` through the real HTTP edge, as `user`.
 *
 *  Example: `const map = await sendImage(app, ana, vharn, 1400, 700)` */
export async function sendImage(
  app: FastifyInstance,
  user: SignedInUser,
  table: Table,
  width: number,
  height: number,
): Promise<AssetDto> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/campaigns/${table.id}/assets?purpose=background`,
    cookies: { lk_session: user.token },
    headers: { 'content-type': 'image/png' },
    payload: await pngOf(width, height),
  });
  if (response.statusCode !== 201) throw new Error(`send to ${table.id} answered ${response.body}`);
  return assetResponseDto.parse(response.json()).asset;
}
