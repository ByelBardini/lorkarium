import { beforeEach, describe, expect, it } from 'vitest';
import { HttpCustomEmojisApi } from '@/services/custom-emojis-api';
import { HttpTransportFake } from '../support/http-transport-fake';

const ROUTE = '/account/custom-emojis';
const EMOJI_ID = '0b6f8a7e-7d43-4a5e-9a1c-1f6f0c9b2d11';
const FESTA = {
  id: EMOJI_ID,
  name: 'festa',
  animated: false,
  active: true,
  createdAt: '2026-11-24T12:00:00.000Z',
};
const LIST = { emojis: [FESTA], limit: 10 };

function apiError(code: string, extra: object = {}): object {
  return { code, message: 'x', ...extra };
}

describe('HttpCustomEmojisApi', () => {
  let transport: HttpTransportFake;
  let api: HttpCustomEmojisApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpCustomEmojisApi(transport);
  });

  it('list gets the route and yields the emojis and the ceiling', async () => {
    transport.respondWith(200, LIST);

    expect(await api.list()).toEqual({ ok: true, value: LIST });
    expect(transport.requests).toEqual([{ method: 'GET', path: ROUTE, body: undefined }]);
  });

  it('create sends the picture with the name in the query', async () => {
    const picture = new Blob(['png']);
    transport.respondWith(201, LIST);

    expect(await api.create('festa', picture)).toEqual({ ok: true, value: LIST });
    expect(transport.requests).toEqual([
      { method: 'POST', path: `${ROUTE}?name=festa`, body: picture },
    ]);
  });

  it('rename patches the name and remove deletes by id', async () => {
    transport.respondWith(200, LIST).respondWith(200, { emojis: [], limit: 10 });

    await api.rename(EMOJI_ID, 'bolo');
    await api.remove(EMOJI_ID);

    expect(transport.requests).toEqual([
      { method: 'PATCH', path: `${ROUTE}/${EMOJI_ID}`, body: { name: 'bolo' } },
      { method: 'DELETE', path: `${ROUTE}/${EMOJI_ID}`, body: undefined },
    ]);
  });

  it.each([
    [409, 'CUSTOM_EMOJI_NAME_TAKEN', 'name_taken'],
    [413, 'CUSTOM_EMOJI_TOO_LARGE', 'too_large'],
    [415, 'UNSUPPORTED_IMAGE', 'unsupported_image'],
    [404, 'CUSTOM_EMOJI_NOT_FOUND', 'not_found'],
  ] as const)('a %s %s answers %s', async (status, code, kind) => {
    transport.respondWith(status, apiError(code));

    expect(await api.create('festa', new Blob(['x']))).toEqual({ ok: false, failure: { kind } });
  });

  it('a 403 PLAN_LIMIT carries the ceiling of the plan', async () => {
    const planLimit = { resource: 'customEmojis', limit: 10, plan: 'apoiador', reason: 'room' };
    transport.respondWith(403, apiError('PLAN_LIMIT', { planLimit }));

    expect(await api.create('festa', new Blob(['x']))).toEqual({
      ok: false,
      failure: { kind: 'plan_limit', planLimit },
    });
  });

  it('an answer outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { emojis: [{ ...FESTA, name: 'Com Espaco' }], limit: 10 });

    expect(await api.list()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
