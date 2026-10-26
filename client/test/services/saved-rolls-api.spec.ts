import { beforeEach, describe, expect, it } from 'vitest';
import { HttpSavedRollsApi } from '@/services/saved-rolls-api';
import { VHARN } from '../support/campaigns-api-fake';
import { ACERTO, ACERTO_ID, BENCAO } from '../support/dice-fixtures';
import { HttpTransportFake } from '../support/http-transport-fake';

const SAVED_ROLLS = `/campaigns/${VHARN.id}/saved-rolls`;
const ACERTO_PATH = `${SAVED_ROLLS}/${ACERTO_ID}`;

function apiError(code: string, extra: object = {}) {
  return { code, message: 'x', ...extra };
}

describe('HttpSavedRollsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpSavedRollsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpSavedRollsApi(transport);
  });

  it('list gets the saved rolls of the table and yields them in order', async () => {
    transport.respondWith(200, { savedRolls: [ACERTO, BENCAO] });
    expect(await api.list(VHARN.id)).toEqual({ ok: true, value: [ACERTO, BENCAO] });
    expect(transport.requests).toEqual([{ method: 'GET', path: SAVED_ROLLS, body: undefined }]);
  });

  it('create posts the name and the parts and yields the new saved roll', async () => {
    transport.respondWith(201, ACERTO);
    const input = { name: 'Acerto', parts: ACERTO.parts };
    expect(await api.create(VHARN.id, input)).toEqual({ ok: true, value: ACERTO });
    expect(transport.requests).toEqual([{ method: 'POST', path: SAVED_ROLLS, body: input }]);
  });

  it('update patches that saved roll with the changes alone', async () => {
    const renamed = { ...ACERTO, name: 'Acerto com espada' };
    transport.respondWith(200, renamed);
    const changes = { name: 'Acerto com espada' };
    expect(await api.update(VHARN.id, ACERTO_ID, changes)).toEqual({ ok: true, value: renamed });
    expect(transport.requests).toEqual([{ method: 'PATCH', path: ACERTO_PATH, body: changes }]);
  });

  it('remove deletes that saved roll and a 204 yields ok', async () => {
    transport.respondWith(204, null);
    expect(await api.remove(VHARN.id, ACERTO_ID)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([{ method: 'DELETE', path: ACERTO_PATH, body: undefined }]);
  });

  it.each([
    [409, 'SAVED_ROLL_NAME_TAKEN', 'name_taken'],
    [422, 'SAVED_ROLLS_LIMIT', 'limit'],
    [400, 'INVALID_DICE_EXPRESSION', 'invalid_expression'],
    [404, 'SAVED_ROLL_NOT_FOUND', 'not_found'],
    [404, 'CAMPAIGN_NOT_FOUND', 'not_found'],
    [403, 'FORBIDDEN', 'forbidden'],
    [400, 'INVALID_BODY', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [500, 'INTERNAL_ERROR', 'unexpected'],
  ])('a %i %s answers %s', async (status, code, kind) => {
    transport.respondWith(status, apiError(code));
    expect(await api.create(VHARN.id, { name: 'Acerto', parts: ACERTO.parts })).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('a 429 answers rate_limited with the seconds of Retry-After', async () => {
    transport.respondWith(429, apiError('RATE_LIMITED'), { 'retry-after': '12' });
    expect(await api.remove(VHARN.id, ACERTO_ID)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 12 },
    });
  });

  it('a network down answers offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.list(VHARN.id)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('a 2xx body outside the DTO answers unexpected', async () => {
    transport.respondWith(200, { savedRolls: [{ ...ACERTO, id: 'not-a-uuid' }] });
    expect(await api.list(VHARN.id)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
