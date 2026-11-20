import { feedbackPageDto, publishFeedbackResponseDto } from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { useFeedbackLive } from '../support/feedback-live';
import type { SignedInUser } from '../support/sign-in';

const live = useFeedbackLive();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const BUG = {
  content: { kind: 'bug', steps: 'Abri a mesa', expected: 'Andar', actual: 'O token voltou' },
  platform: 'browser',
  appVersion: 'Chrome 142',
};
const PUBLISH = { title: '[bug] O token voltou', body: 'Revisado. Valeu @bia!' };

function send(user: SignedInUser | null, payload: object = BUG) {
  return live.http(user, { method: 'POST', url: '/api/feedback', payload });
}

function queue(user: SignedInUser | null) {
  return live.http(user, { method: 'GET', url: '/api/admin/feedback' });
}

async function waitingOf() {
  return feedbackPageDto.parse((await queue(live.root)).json()).entries;
}

function publish(user: SignedInUser | null, id: string, payload: object = PUBLISH) {
  return live.http(user, { method: 'POST', url: `/api/admin/feedback/${id}/publish`, payload });
}

function archive(user: SignedInUser | null, id: string) {
  return live.http(user, { method: 'POST', url: `/api/admin/feedback/${id}/archive` });
}

function readShot(user: SignedInUser | null, entryId: string, shotId: string) {
  return live.http(user, {
    method: 'GET',
    url: `/api/admin/feedback/${entryId}/attachments/${shotId}`,
  });
}

async function queuedKeys(): Promise<string[]> {
  const found = await live.connection.db.execute(
    sql`SELECT key FROM storage_deletions ORDER BY key`,
  );
  return found.rows.map((row) => (row as { key: string }).key);
}

function codeOf(response: { statusCode: number; json: () => { code?: string } }) {
  return [response.statusCode, response.json().code];
}

describe('sending feedback over HTTP', () => {
  it('POST answers 201 with no body and the admin sees it with the draft and the @', async () => {
    const response = await send(live.bia);

    expect([response.statusCode, response.body]).toEqual([201, '']);
    const [entry] = await waitingOf();
    expect(entry).toMatchObject({
      content: BUG.content,
      platform: 'browser',
      sender: { id: live.bia.id, username: 'bia' },
      draft: { title: '[bug] O token voltou' },
    });
  });

  it('without a session is 401 and an invalid body is 400', async () => {
    expect((await send(null)).statusCode).toBe(401);
    expect(codeOf(await send(live.bia, { ...BUG, platform: 'linux' }))).toEqual([
      400,
      'INVALID_BODY',
    ]);
  });

  // The guard already ends a suspended session; the service refuses it too (FEEDBACK_FORBIDDEN in
  // the unit spec) in case a session outlives the suspension.
  it('a suspended account is refused and nothing is kept', async () => {
    await live.connection.db
      .update(users)
      .set({ suspendedAt: new Date() })
      .where(eq(users.id, live.caio.id));

    expect((await send(live.caio)).statusCode).toBe(401);
    expect(await waitingOf()).toEqual([]);
  });

  it('the 6th entry in an hour is 429 with the wait', async () => {
    for (let sent = 0; sent < 5; sent += 1) expect((await send(live.bia)).statusCode).toBe(201);

    const refused = await send(live.bia);

    expect(codeOf(refused)).toEqual([429, 'RATE_LIMITED']);
    expect(refused.json().retryAfterSeconds).toBeGreaterThan(0);
  });

  it('the 11th waiting entry of an account is 409 FEEDBACK_OPEN_LIMIT', async () => {
    const rows = Array.from({ length: 10 }, () => ({
      senderId: live.bia.id,
      senderUsername: 'bia',
      kind: 'suggestion' as const,
      problem: 'p',
      idea: 'i',
      platform: 'browser' as const,
      appVersion: 'Chrome',
    }));
    const { feedbackEntries } = await import('../../src/modules/feedback/feedback-entries.po');
    await live.connection.db.insert(feedbackEntries).values(rows);

    expect(codeOf(await send(live.bia))).toEqual([409, 'FEEDBACK_OPEN_LIMIT']);
    expect((await send(live.caio)).statusCode).toBe(201);
  });
});

describe('the backoffice queue of the feedback', () => {
  it('only an admin reads the queue, publishes or archives', async () => {
    await send(live.bia);
    const [entry] = await waitingOf();
    const id = entry?.id ?? UNKNOWN_ID;

    expect(codeOf(await queue(live.bia))).toEqual([403, 'FORBIDDEN_ROLE']);
    expect(codeOf(await publish(live.bia, id))).toEqual([403, 'FORBIDDEN_ROLE']);
    expect(codeOf(await archive(live.bia, id))).toEqual([403, 'FORBIDDEN_ROLE']);
    expect((await queue(null)).statusCode).toBe(401);
    expect(live.tracker.created).toEqual([]);
  });

  it("publishing opens the issue with the admin's text, deletes the entry, queues its screenshots and mails the link", async () => {
    const shot = await live.shotOf(live.bia);
    await send(live.bia, { ...BUG, attachmentIds: [shot.id] });
    const [entry] = await waitingOf();

    const response = await publish(live.root, entry?.id ?? UNKNOWN_ID);

    expect(response.statusCode).toBe(200);
    expect(publishFeedbackResponseDto.parse(response.json())).toEqual({
      issueUrl: 'https://github.com/ByelBardini/lorkarium/issues/42',
      issueNumber: 42,
    });
    expect(live.tracker.created).toEqual([
      { title: PUBLISH.title, body: 'Revisado. Valeu @<!-- -->bia!', labels: ['bug', 'via-app'] },
    ]);
    expect(await waitingOf()).toEqual([]);
    expect(await queuedKeys()).toEqual([`feedback/${shot.id}`]);
    expect(live.mailer.to('bia@mesa.com').map((mail) => mail.subject)).toEqual([
      'Seu relato virou a issue #42',
    ]);
  });

  it('two admins publishing the same entry: one opens the issue and the other gets 404', async () => {
    await send(live.bia);
    const [entry] = await waitingOf();
    const id = entry?.id ?? UNKNOWN_ID;

    const answers = await Promise.all([publish(live.root, id), publish(live.root, id)]);

    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([200, 404]);
    expect(live.tracker.created).toHaveLength(1);
  });

  it('GitHub failing is 502 and the entry stays in the queue', async () => {
    await send(live.bia);
    const [entry] = await waitingOf();
    live.tracker.failAsUnavailable();

    expect(codeOf(await publish(live.root, entry?.id ?? UNKNOWN_ID))).toEqual([
      502,
      'ISSUE_TRACKER_UNAVAILABLE',
    ]);
    expect(await waitingOf()).toHaveLength(1);
  });

  it('archiving answers 204, deletes the entry and mails nobody; a second time is 404', async () => {
    const shot = await live.shotOf(live.bia);
    await send(live.bia, { ...BUG, attachmentIds: [shot.id] });
    const [entry] = await waitingOf();
    const id = entry?.id ?? UNKNOWN_ID;

    expect((await archive(live.root, id)).statusCode).toBe(204);
    expect(await waitingOf()).toEqual([]);
    expect(await queuedKeys()).toEqual([`feedback/${shot.id}`]);
    expect(live.mailer.sent).toEqual([]);
    expect(codeOf(await archive(live.root, id))).toEqual([404, 'FEEDBACK_NOT_FOUND']);
  });

  it('an empty title is 400 and nothing is published', async () => {
    await send(live.bia);
    const [entry] = await waitingOf();

    expect(
      codeOf(await publish(live.root, entry?.id ?? UNKNOWN_ID, { title: ' ', body: 'x' })),
    ).toEqual([400, 'INVALID_BODY']);
    expect(live.tracker.created).toEqual([]);
  });
});

describe('the feedback of a deleted account', () => {
  it('goes with the account, and every screenshot it sent, claimed or loose, enters the bucket queue', async () => {
    const claimed = await live.shotOf(live.bia);
    const loose = await live.shotOf(live.bia);
    const caios = await live.shotOf(live.caio);
    await send(live.bia, { ...BUG, attachmentIds: [claimed.id] });
    await send(live.caio, { ...BUG, attachmentIds: [caios.id] });

    const deleted = await live.http(live.root, {
      method: 'DELETE',
      url: `/api/admin/users/${live.bia.id}`,
    });

    expect(deleted.statusCode).toBe(204);
    expect((await waitingOf()).map((entry) => entry.sender.username)).toEqual(['caio']);
    expect(await queuedKeys()).toEqual([`feedback/${claimed.id}`, `feedback/${loose.id}`].sort());
  });
});

describe('the screenshots of the feedback', () => {
  it('a JPEG with GPS is kept as WebP without metadata under feedback/<id>, read only by the admin', async () => {
    const jpeg = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#808080' },
    })
      .withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 32/1 0/1' } })
      .jpeg()
      .toBuffer();
    const shot = await live.shotOf(live.bia, jpeg);
    await send(live.bia, { ...BUG, attachmentIds: [shot.id] });
    const [entry] = await waitingOf();
    const entryId = entry?.id ?? UNKNOWN_ID;

    const read = await readShot(live.root, entryId, shot.id);

    expect(shot.mimeType).toBe('image/webp');
    expect(read.statusCode).toBe(200);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect((await sharp(read.rawPayload).metadata()).exif).toBeUndefined();
    expect((await readShot(live.bia, entryId, shot.id)).statusCode).toBe(403);
  });

  it("an account cannot attach someone else's screenshot (404) and the entry is not kept", async () => {
    const theirs = await live.shotOf(live.caio);

    expect(codeOf(await send(live.bia, { ...BUG, attachmentIds: [theirs.id] }))).toEqual([
      404,
      'ATTACHMENT_NOT_FOUND',
    ]);
    expect(await waitingOf()).toEqual([]);
  });

  it('a screenshot of another entry is 404 by the admin route', async () => {
    const shot = await live.shotOf(live.bia);
    await send(live.bia, { ...BUG, attachmentIds: [shot.id] });
    await send(live.caio);
    const entries = await waitingOf();
    const caiosEntry = entries.find((entry) => entry.sender.username === 'caio');

    expect(codeOf(await readShot(live.root, caiosEntry?.id ?? UNKNOWN_ID, shot.id))).toEqual([
      404,
      'ATTACHMENT_NOT_FOUND',
    ]);
  });

  it('a GIF is 415, a broken PNG is 422, more than 5 MiB is 413 and no session is 401', async () => {
    expect(codeOf(await live.sendShot(live.bia, Buffer.from('GIF89a'), 'image/gif'))).toEqual([
      415,
      'UNSUPPORTED_IMAGE',
    ]);
    expect(codeOf(await live.sendShot(live.bia, Buffer.from('not a png')))).toEqual([
      422,
      'UNSUPPORTED_IMAGE',
    ]);
    expect(codeOf(await live.sendShot(live.bia, Buffer.alloc(5 * 1024 * 1024 + 1)))).toEqual([
      413,
      'ATTACHMENT_TOO_LARGE',
    ]);
    expect((await live.sendShot(null, Buffer.from('x'))).statusCode).toBe(401);
  });
});
