import {
  userReportAttachmentResponseDto,
  userReportsPageDto,
  type UserReportAttachmentDto,
} from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const MAX_BYTES = 5 * 1024 * 1024;
const SENDS_PER_MINUTE = 20;

async function admin(name: string): Promise<SignedInUser> {
  const user = await live.signUp(name);
  await live.connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
  return user;
}

function sendShot(user: SignedInUser | null, body: Buffer, contentType = 'image/png') {
  const headers = { 'content-type': contentType };
  return live.http(user, {
    method: 'POST',
    url: '/api/reports/attachments',
    headers,
    payload: body,
  });
}

async function shotOf(user: SignedInUser, body?: Buffer): Promise<UserReportAttachmentDto> {
  const response = await sendShot(user, body ?? (await pngOf(320, 200)));
  if (response.statusCode !== 201) throw new Error(`screenshot answered ${response.body}`);
  return userReportAttachmentResponseDto.parse(response.json()).attachment;
}

function report(user: SignedInUser, targetId: string, attachmentIds: string[]) {
  const payload = { reason: 'harassment', attachmentIds };
  return live.http(user, { method: 'POST', url: `/api/users/${targetId}/reports`, payload });
}

function readShot(user: SignedInUser | null, reportId: string, attachmentId: string) {
  const url = `/api/admin/reports/${reportId}/attachments/${attachmentId}`;
  return live.http(user, { method: 'GET', url });
}

async function storageKeyOf(attachmentId: string): Promise<string | undefined> {
  const found = await live.connection.db.execute(
    sql`SELECT storage_key FROM report_attachments WHERE id = ${attachmentId}`,
  );
  return (found.rows[0] as { storage_key: string } | undefined)?.storage_key;
}

async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 160, height: 90, channels: 3, background: '#3a6' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1' } })
    .toBuffer();
}

function codeOf(response: { statusCode: number; json: () => { code?: string } }) {
  return [response.statusCode, response.json().code];
}

describe('sending a screenshot for a report', () => {
  it('answers 201 with the normalized image, kept loose under reports/<id>', async () => {
    const shot = await shotOf(live.bia);

    expect(shot).toMatchObject({ mimeType: 'image/webp', width: 320, height: 200 });
    expect(await storageKeyOf(shot.id)).toBe(`reports/${shot.id}`);
  });

  it('a JPEG with a GPS position is kept as WebP without any EXIF', async () => {
    const withGps = await jpegWithGps();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const root = await admin('Root');
    const shot = await shotOf(live.bia, withGps);
    await report(live.bia, live.caio.id, [shot.id]);
    const [listed] = userReportsPageDto.parse(
      (await live.http(root, { method: 'GET', url: '/api/admin/reports' })).json(),
    ).reports;

    const response = await readShot(root, listed!.id, shot.id);

    const kept = await sharp(response.rawPayload).metadata();
    expect({ format: kept.format, exif: kept.exif }).toEqual({ format: 'webp', exif: undefined });
  });

  it('a body past 5 MiB is 413 ATTACHMENT_TOO_LARGE and nothing is kept', async () => {
    const response = await sendShot(live.bia, Buffer.alloc(MAX_BYTES + 1));

    expect(codeOf(response)).toEqual([413, 'ATTACHMENT_TOO_LARGE']);
    expect(await live.connection.db.execute(sql`SELECT 1 FROM report_attachments`)).toMatchObject({
      rows: [],
    });
  });

  it.each(['image/gif', 'text/plain'])(
    'a body sent as %s is 415 UNSUPPORTED_IMAGE',
    async (type) => {
      const response = await sendShot(live.bia, await pngOf(10, 10), type);

      expect(codeOf(response)).toEqual([415, 'UNSUPPORTED_IMAGE']);
    },
  );

  it('bytes that do not decode are 422 UNSUPPORTED_IMAGE', async () => {
    const response = await sendShot(live.bia, Buffer.from('<html>not an image</html>'));

    expect(codeOf(response)).toEqual([422, 'UNSUPPORTED_IMAGE']);
  });

  it('without a session it is 401', async () => {
    expect((await sendShot(null, await pngOf(10, 10))).statusCode).toBe(401);
  });

  it(`past ${SENDS_PER_MINUTE} screenshots a minute the next is 429`, async () => {
    const png = await pngOf(8, 8);
    for (let index = 0; index < SENDS_PER_MINUTE; index += 1) await sendShot(live.bia, png);

    expect(codeOf(await sendShot(live.bia, png))).toEqual([429, 'RATE_LIMITED']);
  });
});

describe('a report with screenshots', () => {
  it('claims the screenshots and the admin queue lists them', async () => {
    const root = await admin('Root');
    const first = await shotOf(live.bia);
    const second = await shotOf(live.bia);

    expect((await report(live.bia, live.caio.id, [first.id, second.id])).statusCode).toBe(201);

    const page = await live.http(root, { method: 'GET', url: '/api/admin/reports' });
    const [listed] = userReportsPageDto.parse(page.json()).reports;
    expect(listed!.attachments.map((shot) => shot.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("someone else's screenshot is 404 ATTACHMENT_NOT_FOUND and no report is kept", async () => {
    const caios = await shotOf(live.caio);

    expect(codeOf(await report(live.bia, live.ana.id, [caios.id]))).toEqual([
      404,
      'ATTACHMENT_NOT_FOUND',
    ]);
    const kept = await live.connection.db.execute(sql`SELECT 1 FROM user_reports`);
    expect(kept.rows).toEqual([]);
  });
});

describe('reading a screenshot back', () => {
  async function reportedShot(): Promise<{ reportId: string; shotId: string }> {
    const root = await admin('Root');
    const shot = await shotOf(live.bia);
    await report(live.bia, live.caio.id, [shot.id]);
    const page = await live.http(root, { method: 'GET', url: '/api/admin/reports' });
    const [listed] = userReportsPageDto.parse(page.json()).reports;
    return { reportId: listed!.id, shotId: shot.id };
  }

  it('the admin gets the bytes with the kept type and no cache', async () => {
    const { reportId, shotId } = await reportedShot();
    const root = await admin('Rita');

    const response = await readShot(root, reportId, shotId);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/webp');
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it.each(['bia', 'caio'] as const)('%s, not an admin, is 403 even being a side', async (who) => {
    const { reportId, shotId } = await reportedShot();

    expect((await readShot(live[who], reportId, shotId)).statusCode).toBe(403);
  });

  it('the screenshot under another report id is 404 ATTACHMENT_NOT_FOUND', async () => {
    const { shotId } = await reportedShot();
    const root = await admin('Rita');
    const other = '00000000-0000-4000-8000-000000000000';

    expect(codeOf(await readShot(root, other, shotId))).toEqual([404, 'ATTACHMENT_NOT_FOUND']);
  });
});
