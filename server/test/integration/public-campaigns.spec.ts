import {
  apiErrorDto,
  campaignResponseDto,
  joinCampaignResponseDto,
  listCampaignsResponseDto,
  listPublicCampaignsResponseDto,
  type CampaignDetailDto,
  type PublicCampaignDto,
} from '@lorkarium/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { signUpAndLogin } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('public campaigns HTTP edge ("Explorar mesas")', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: string;
  let bia: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  // A fresh app per test: the join limiter keeps its counts in memory.
  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    ana = (await signUpAndLogin(app, connection.db, 'Ana')).token;
    bia = (await signUpAndLogin(app, connection.db, 'Bia')).token;
  });

  afterEach(() => app.close());

  function call(
    method: 'GET' | 'POST',
    url: string,
    token?: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> {
    const cookies: Record<string, string> = token ? { lk_session: token } : {};
    return app.inject({ method, url: `/api${url}`, cookies, payload });
  }

  async function createCampaign(token: string, body: object): Promise<CampaignDetailDto> {
    const response = await call('POST', '/campaigns', token, { name: 'Vharn', ...body });
    return campaignResponseDto.parse(response.json()).campaign;
  }

  async function publicList(token: string): Promise<PublicCampaignDto[]> {
    const response = await call('GET', '/campaigns/public', token);
    expect(response.statusCode).toBe(200);
    return listPublicCampaignsResponseDto.parse(response.json()).campaigns;
  }

  function errorCodeOf(response: LightMyRequestResponse): string {
    return apiErrorDto.parse(response.json()).code;
  }

  it.each([
    ['GET', '/campaigns/public'],
    ['POST', `/campaigns/${UNKNOWN_ID}/join`],
  ] as const)('%s %s without a session cookie answers 401', async (method, url) => {
    const response = await call(method, url, undefined, {});
    expect(response.statusCode).toBe(401);
  });

  it('lists every public campaign, newest first, and never a private one', async () => {
    await createCampaign(ana, { name: 'Vharn', visibility: 'public' });
    await createCampaign(ana, { name: 'Oculta', visibility: 'private' });
    await createCampaign(ana, { name: 'Quelm', visibility: 'public', status: 'finished' });

    const listed = await publicList(bia);

    expect(listed.map(({ name }) => name)).toEqual(['Quelm', 'Vharn']);
    expect(listed[0]).toMatchObject({ masterName: 'Ana', memberCount: 1, myRole: null });
  });

  it('carries the reader role in a campaign they are in, and whether it asks a password', async () => {
    await createCampaign(ana, { name: 'Vharn', visibility: 'public', password: 'sino' });

    const [forAna] = await publicList(ana);
    const [forBia] = await publicList(bia);

    expect(forAna).toMatchObject({ myRole: 'master', hasPassword: true });
    expect(forBia).toMatchObject({ myRole: null, hasPassword: true });
    expect(JSON.stringify(forBia)).not.toMatch(/argon|joinCode/i);
  });

  it('joining a public campaign without the code makes the reader a spectator, now in their list', async () => {
    const vharn = await createCampaign(ana, { visibility: 'public' });

    const response = await call('POST', `/campaigns/${vharn.id}/join`, bia, {});

    expect(response.statusCode).toBe(200);
    expect(joinCampaignResponseDto.parse(response.json()).campaign).toMatchObject({
      id: vharn.id,
      myRole: 'spectator',
    });
    const mine = await call('GET', '/campaigns', bia);
    expect(listCampaignsResponseDto.parse(mine.json()).campaigns.map(({ id }) => id)).toEqual([
      vharn.id,
    ]);
    expect((await publicList(bia))[0]?.myRole).toBe('spectator');
  });

  it('a private campaign answers 404 by id, the same as an unknown one, and takes no one in', async () => {
    const oculta = await createCampaign(ana, { visibility: 'private' });

    for (const id of [oculta.id, UNKNOWN_ID]) {
      const response = await call('POST', `/campaigns/${id}/join`, bia, {});
      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe('CAMPAIGN_NOT_FOUND');
    }
    const mine = await call('GET', '/campaigns', bia);
    expect(listCampaignsResponseDto.parse(mine.json()).campaigns).toEqual([]);
  });

  it('a protected public campaign asks for its password and refuses a wrong one', async () => {
    const vharn = await createCampaign(ana, { visibility: 'public', password: 'sino' });
    const url = `/campaigns/${vharn.id}/join`;

    const missing = await call('POST', url, bia, {});
    const wrong = await call('POST', url, bia, { password: 'errada' });
    const right = await call('POST', url, bia, { password: 'sino' });

    expect([missing.statusCode, errorCodeOf(missing)]).toEqual([403, 'CAMPAIGN_PASSWORD_REQUIRED']);
    expect([wrong.statusCode, errorCodeOf(wrong)]).toEqual([403, 'CAMPAIGN_PASSWORD_INVALID']);
    expect(right.statusCode).toBe(200);
  });

  it('an id that is not a uuid answers 400 and a stray field in the body 400 INVALID_BODY', async () => {
    const vharn = await createCampaign(ana, { visibility: 'public' });

    const badId = await call('POST', '/campaigns/vharn/join', bia, {});
    const stray = await call('POST', `/campaigns/${vharn.id}/join`, bia, { code: 'VHRN7K2Q' });

    expect([badId.statusCode, errorCodeOf(badId)]).toEqual([400, 'INVALID_PARAMS']);
    expect([stray.statusCode, errorCodeOf(stray)]).toEqual([400, 'INVALID_BODY']);
  });

  it('guessing a password is limited like the code: the 11th try in a minute answers 429', async () => {
    const vharn = await createCampaign(ana, { visibility: 'public', password: 'sino' });
    const url = `/campaigns/${vharn.id}/join`;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await call('POST', url, bia, { password: 'errada' });
    }
    const limited = await call('POST', url, bia, { password: 'sino' });

    expect([limited.statusCode, errorCodeOf(limited)]).toEqual([429, 'RATE_LIMITED']);
  });
});
