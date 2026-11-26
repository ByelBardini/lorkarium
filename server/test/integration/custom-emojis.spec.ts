import {
  CUSTOM_EMOJI_MAX_BYTES,
  chatSentDto,
  customEmojiListDto,
  type CustomEmojiListDto,
} from '@lorkarium/contracts';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { customEmojis } from '../../src/modules/custom-emojis/custom-emoji.po';
import { setAccountPlan } from '../support/account-plans';
import { animatedGifOf, pngOf } from '../support/images';
import { envelope, eventPayload } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

beforeEach(async () => {
  await setAccountPlan(live.connection.db, live.ana.id, 'amigo_do_dono');
  await setAccountPlan(live.connection.db, live.bia.id, 'lenda');
  await setAccountPlan(live.connection.db, live.caio.id, 'apoiador');
});

const OWN_URL = '/api/account/custom-emojis';

function send(user: SignedInUser | null, name: string, body: Buffer, type = 'image/png') {
  return live.http(user, {
    method: 'POST',
    url: `${OWN_URL}?name=${name}`,
    headers: { 'content-type': type },
    payload: body,
  });
}

async function created(
  user: SignedInUser,
  name: string,
  body: Buffer,
): Promise<CustomEmojiListDto> {
  const response = await send(user, name, body, body[0] === 0x47 ? 'image/gif' : 'image/png');
  if (response.statusCode !== 201) throw new Error(`send of ${name} answered ${response.body}`);
  return customEmojiListDto.parse(response.json());
}

function idOf(list: CustomEmojiListDto, name: string): string {
  const found = list.emojis.find((emoji) => emoji.name === name);
  if (!found) throw new Error(`no emoji ${name} in ${JSON.stringify(list)}`);
  return found.id;
}

// Rows only (no picture): filling a ceiling over HTTP would trip the 10 sends a minute.
async function seedRows(user: SignedInUser, count: number): Promise<void> {
  const rows = Array.from({ length: count }, (_, at) => ({
    id: randomUUID(),
    ownerId: user.id,
    name: `nome${at}`,
    animated: false,
    createdAt: new Date(Date.UTC(2026, 10, 24, 12, at)),
  }));
  await live.connection.db.insert(customEmojis).values(rows);
}

async function pictureOf(user: SignedInUser, emojiId: string) {
  return live.http(user, { method: 'GET', url: `/api/custom-emojis/${emojiId}` });
}

async function pagesOf(body: Buffer): Promise<number> {
  return (await sharp(body, { animated: true }).metadata()).pages ?? 1;
}

describe('the custom emojis over HTTP', () => {
  it('a PNG becomes a 128 px WebP the account lists, oldest first', async () => {
    await created(live.caio, 'festa', await pngOf(400, 400));
    const list = await created(live.caio, 'bolo', await pngOf(64, 64));

    expect(list.limit).toBe(10);
    expect(list.emojis.map((emoji) => [emoji.name, emoji.active])).toEqual([
      ['festa', true],
      ['bolo', true],
    ]);
    const picture = await pictureOf(live.ana, idOf(list, 'festa'));
    expect(picture.headers['content-type']).toBe('image/webp');
    const { width, height } = await sharp(picture.rawPayload).metadata();
    expect([width, height]).toEqual([128, 128]);
  });

  it('a GIF of a Lenda stays animated, and goes still once she drops to Narrador', async () => {
    const list = await created(live.bia, 'danca', await animatedGifOf(3, 64));
    const emojiId = idOf(list, 'danca');
    expect(list.emojis[0]?.animated).toBe(true);
    expect(await pagesOf((await pictureOf(live.caio, emojiId)).rawPayload)).toBe(3);

    await setAccountPlan(live.connection.db, live.bia.id, 'narrador');

    expect(await pagesOf((await pictureOf(live.caio, emojiId)).rawPayload)).toBe(1);
  });

  it('a GIF of an Apoiador is kept still', async () => {
    const list = await created(live.caio, 'danca', await animatedGifOf(3, 64));

    expect(list.emojis[0]?.animated).toBe(false);
    expect(await pagesOf((await pictureOf(live.ana, idOf(list, 'danca'))).rawPayload)).toBe(1);
  });

  it('Grátis is refused with the plan, the 11th of an Apoiador too', async () => {
    await setAccountPlan(live.connection.db, live.caio.id, 'free');
    const free = await send(live.caio, 'festa', await pngOf(32, 32));
    expect(free.statusCode).toBe(403);
    expect(free.json()).toMatchObject({ code: 'PLAN_LIMIT', planLimit: { limit: 0 } });

    await setAccountPlan(live.connection.db, live.caio.id, 'apoiador');
    await seedRows(live.caio, 10);
    const eleventh = await send(live.caio, 'onze', await pngOf(32, 32));
    expect(eleventh.statusCode).toBe(403);
    expect(eleventh.json()).toMatchObject({ planLimit: { resource: 'customEmojis', limit: 10 } });
  });

  it('a name of the catalog, a bad name and a repeated one are refused', async () => {
    await created(live.caio, 'festa', await pngOf(32, 32));

    expect((await send(live.caio, 'doge', await pngOf(32, 32))).statusCode).toBe(400);
    expect((await send(live.caio, 'Com Espaco', await pngOf(32, 32))).statusCode).toBe(400);
    const repeated = await send(live.caio, 'festa', await pngOf(32, 32));
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json()).toMatchObject({ code: 'CUSTOM_EMOJI_NAME_TAKEN' });
  });

  it('two accounts may have the same name', async () => {
    await created(live.caio, 'festa', await pngOf(32, 32));

    expect((await send(live.bia, 'festa', await pngOf(32, 32))).statusCode).toBe(201);
  });

  it('above 2 MiB is a 413, an SVG a 415, and without a session a 401', async () => {
    const huge = Buffer.alloc(CUSTOM_EMOJI_MAX_BYTES + 1);
    expect((await send(live.caio, 'grande', huge)).statusCode).toBe(413);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect((await send(live.caio, 'svg', svg, 'image/svg+xml')).statusCode).toBe(415);
    expect((await send(null, 'festa', await pngOf(32, 32))).statusCode).toBe(401);
  });

  it('renames and removes its own, the picture leaves the bucket', async () => {
    const emojiId = idOf(await created(live.caio, 'festa', await pngOf(32, 32)), 'festa');
    const url = `${OWN_URL}/${emojiId}`;

    const renamed = await live.http(live.caio, { method: 'PATCH', url, payload: { name: 'bolo' } });
    expect(customEmojiListDto.parse(renamed.json()).emojis[0]?.name).toBe('bolo');
    const removed = await live.http(live.caio, { method: 'DELETE', url });
    expect(customEmojiListDto.parse(removed.json()).emojis).toEqual([]);
    expect((await pictureOf(live.ana, emojiId)).statusCode).toBe(404);
  });

  it('never renames nor removes the emoji of another account', async () => {
    const emojiId = idOf(await created(live.caio, 'festa', await pngOf(32, 32)), 'festa');
    const url = `${OWN_URL}/${emojiId}`;

    const rename = await live.http(live.bia, { method: 'PATCH', url, payload: { name: 'meu' } });
    const remove = await live.http(live.bia, { method: 'DELETE', url });

    expect([rename.statusCode, remove.statusCode]).toEqual([404, 404]);
    expect((await pictureOf(live.ana, emojiId)).statusCode).toBe(200);
  });

  it('dropped to a smaller plan, the newest are inactive and nothing is deleted', async () => {
    await seedRows(live.bia, 12);
    await setAccountPlan(live.connection.db, live.bia.id, 'apoiador');

    const list = customEmojiListDto.parse(
      (await live.http(live.bia, { method: 'GET', url: OWN_URL })).json(),
    );

    expect(list.emojis).toHaveLength(12);
    expect(list.emojis.filter((emoji) => !emoji.active).map((emoji) => emoji.name)).toEqual([
      'nome10',
      'nome11',
    ]);
  });

  it('the admin lists and removes the emojis of an account; a user cannot', async () => {
    await created(live.caio, 'festa', await pngOf(32, 32));
    await live.connection.db.execute(
      sql`UPDATE users SET role = 'admin' WHERE id = ${live.ana.id}`,
    );
    const adminUrl = `/api/admin/users/${live.caio.id}/custom-emojis`;

    const listed = await live.http(live.ana, { method: 'GET', url: adminUrl });
    const emojiId = idOf(customEmojiListDto.parse(listed.json()), 'festa');
    const byBia = await live.http(live.bia, { method: 'DELETE', url: `${adminUrl}/${emojiId}` });
    const byAna = await live.http(live.ana, { method: 'DELETE', url: `${adminUrl}/${emojiId}` });

    expect(byBia.statusCode).toBe(403);
    expect(customEmojiListDto.parse(byAna.json()).emojis).toEqual([]);
  });
});

describe('the custom emojis in a message', () => {
  async function atVharn(user: SignedInUser): Promise<RealtimeClient> {
    return live.atTable(user, live.vharn);
  }

  it('chat:sent carries the sender’s emoji to the table, not another account’s', async () => {
    const festa = idOf(await created(live.bia, 'festa', await pngOf(32, 32)), 'festa');
    await created(live.caio, 'bolo', await pngOf(32, 32));
    const bia = await atVharn(live.bia);
    const caio = recordEventsOf(await atVharn(live.caio));
    const message = {
      ...envelope(live.vharn.id),
      channel: { kind: 'table' as const, whisperTo: null },
      speaker: { kind: 'self' as const },
      replyTo: null,
      image: null,
      text: 'bora :festa: :bolo:',
    };

    await bia.timeout(4000).emitWithAck('chat:send', message);

    const heard = chatSentDto.parse(await eventPayload(caio, 'chat:sent'));
    expect(heard.customEmojis).toEqual([{ name: 'festa', emojiId: festa }]);
  });

  it('an emoji created right now is in the very next message', async () => {
    const bia = await atVharn(live.bia);
    const caio = recordEventsOf(await atVharn(live.caio));
    const message = (text: string) => ({
      ...envelope(live.vharn.id),
      channel: { kind: 'table' as const, whisperTo: null },
      speaker: { kind: 'self' as const },
      replyTo: null,
      image: null,
      text,
    });
    await bia.timeout(4000).emitWithAck('chat:send', message(':festa:'));
    const festa = idOf(await created(live.bia, 'festa', await pngOf(32, 32)), 'festa');

    await bia.timeout(4000).emitWithAck('chat:send', message(':festa: de novo'));

    const sent = () => caio.events.filter(({ name }) => name === 'chat:sent');
    await expect.poll(() => sent().length).toBe(2);
    const [before, after] = sent().map(({ payload }) => chatSentDto.parse(payload));
    expect(before?.customEmojis).toEqual([]);
    expect(after?.customEmojis).toEqual([{ name: 'festa', emojiId: festa }]);
  });
});
