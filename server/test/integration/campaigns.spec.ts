import {
  apiErrorDto,
  campaignResponseDto,
  joinCampaignResponseDto,
  listCampaignsResponseDto,
  type CampaignDetailDto,
} from '@lorkarium/contracts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { signUpAndLogin } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

type Method = 'GET' | 'POST';

describe('campaigns HTTP edge', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: string;
  let bia: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  function call(
    method: Method,
    url: string,
    token?: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> {
    const cookies: Record<string, string> = token ? { lk_session: token } : {};
    return app.inject({ method, url: `/api${url}`, cookies, payload });
  }

  async function createCampaign(token: string, body: object = {}): Promise<CampaignDetailDto> {
    const response = await call('POST', '/campaigns', token, {
      name: 'Os Sinos de Vharn',
      ...body,
    });
    return campaignResponseDto.parse(response.json()).campaign;
  }

  async function listedNames(token: string): Promise<string[]> {
    const response = await call('GET', '/campaigns', token);
    return listCampaignsResponseDto.parse(response.json()).campaigns.map((c) => c.name);
  }

  function errorCodeOf(response: LightMyRequestResponse): string {
    return apiErrorDto.parse(response.json()).code;
  }

  async function freshAppWithAnaAndBia(): Promise<void> {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    ana = (await signUpAndLogin(app, connection.db, 'Ana')).token;
    bia = (await signUpAndLogin(app, connection.db, 'Bia')).token;
  }

  describe('list, create and detail', () => {
    beforeEach(freshAppWithAnaAndBia);

    afterAll(() => app.close());

    it.each([
      ['GET', '/campaigns'],
      ['POST', '/campaigns'],
      ['GET', `/campaigns/${UNKNOWN_ID}`],
      ['POST', '/campaigns/join'],
      ['POST', `/campaigns/${UNKNOWN_ID}/enter`],
    ] as const)(
      '%s %s without a session cookie answers 401 UNAUTHENTICATED',
      async (method, url) => {
        const response = await call(method, url, undefined, {});
        expect(response.statusCode).toBe(401);
        expect(errorCodeOf(response)).toBe('UNAUTHENTICATED');
      },
    );

    it('POST creates the campaign as master with an 8-symbol join code', async () => {
      const response = await call('POST', '/campaigns', ana, { name: ' Vharn ', system: 'D&D 5e' });
      expect(response.statusCode).toBe(201);
      const { campaign } = campaignResponseDto.parse(response.json());
      expect(campaign).toMatchObject({ name: 'Vharn', myRole: 'master', masterName: 'Ana' });
      expect(campaign.joinCode).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    });

    it.each([
      ['a blank name', { name: '  ' }],
      ['a forged ownerId', { name: 'Vharn', ownerId: UNKNOWN_ID }],
    ])('POST with %s answers 400 INVALID_BODY', async (_, body) => {
      const response = await call('POST', '/campaigns', ana, body);
      expect(response.statusCode).toBe(400);
      expect(errorCodeOf(response)).toBe('INVALID_BODY');
    });

    it('each user lists only their own campaigns', async () => {
      await createCampaign(ana, { name: 'Mesa da Ana' });
      await createCampaign(bia, { name: 'Mesa da Bia' });
      expect(await listedNames(ana)).toEqual(['Mesa da Ana']);
    });

    it('the detail of a campaign of someone else answers 404 CAMPAIGN_NOT_FOUND (criterion 14)', async () => {
      const biasCampaign = await createCampaign(bia);
      const response = await call('GET', `/campaigns/${biasCampaign.id}`, ana);
      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe('CAMPAIGN_NOT_FOUND');
    });

    it('the detail of an id that does not exist answers the same 404', async () => {
      const response = await call('GET', `/campaigns/${UNKNOWN_ID}`, ana);
      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe('CAMPAIGN_NOT_FOUND');
    });

    it('the master gets the detail with the join code', async () => {
      const created = await createCampaign(ana);
      const response = await call('GET', `/campaigns/${created.id}`, ana);
      expect(campaignResponseDto.parse(response.json()).campaign.joinCode).toBe(created.joinCode);
    });

    it('an id that is not a uuid answers 400', async () => {
      const response = await call('GET', '/campaigns/not-a-uuid', ana);
      expect(response.statusCode).toBe(400);
      expect(errorCodeOf(response)).toBe('INVALID_PARAMS');
    });

    it('no answer carries the password or its hash', async () => {
      const created = await createCampaign(ana, { password: 'sino-secreto' });
      const bodies = [
        JSON.stringify(created),
        (await call('GET', `/campaigns/${created.id}`, ana)).body,
        (await call('GET', '/campaigns', ana)).body,
      ].join('\n');
      expect(bodies).not.toMatch(/sino-secreto|argon2|passwordHash|"password"/);
      expect(created.hasPassword).toBe(true);
    });
  });

  describe('join by code and enter the table', () => {
    let protectedCode: string;
    let protectedId: string;

    beforeAll(async () => {
      await freshAppWithAnaAndBia();
      const created = await createCampaign(bia, { name: 'Pântano', password: 'sino' });
      protectedCode = created.joinCode ?? '';
      protectedId = created.id;
    });

    afterAll(() => app.close());

    it('an unknown code answers 404 CAMPAIGN_NOT_FOUND', async () => {
      const response = await call('POST', '/campaigns/join', ana, { code: 'ZZZZ2345' });
      expect(response.statusCode).toBe(404);
      expect(errorCodeOf(response)).toBe('CAMPAIGN_NOT_FOUND');
    });

    it('a malformed code answers 400 INVALID_BODY', async () => {
      const response = await call('POST', '/campaigns/join', ana, { code: 'abc' });
      expect(response.statusCode).toBe(400);
      expect(errorCodeOf(response)).toBe('INVALID_BODY');
    });

    it('enter on a campaign the user is not in answers 404 and the code stays unused', async () => {
      const response = await call('POST', `/campaigns/${protectedId}/enter`, ana);
      expect(response.statusCode).toBe(404);
      expect(await listedNames(ana)).toEqual([]);
    });

    it.each([
      ['no password', {}, 'CAMPAIGN_PASSWORD_REQUIRED'],
      ['a wrong password', { password: 'errada' }, 'CAMPAIGN_PASSWORD_INVALID'],
    ])('%s for a protected campaign answers 403 %s', async (_, extra, code) => {
      const response = await call('POST', '/campaigns/join', ana, {
        code: protectedCode,
        ...extra,
      });
      expect(response.statusCode).toBe(403);
      expect(errorCodeOf(response)).toBe(code);
    });

    it('the right password lets Ana in as player and the campaign appears in her list', async () => {
      const code = `${protectedCode.slice(0, 4).toLowerCase()}-${protectedCode.slice(4)}`;
      const response = await call('POST', '/campaigns/join', ana, { code, password: 'sino' });
      expect(response.statusCode).toBe(200);
      const { campaign } = joinCampaignResponseDto.parse(response.json());
      expect(campaign).toMatchObject({ id: protectedId, myRole: 'player', memberCount: 2 });
      expect(await listedNames(ana)).toEqual(['Pântano']);
    });

    it('joining again answers 200 with the same summary and no duplicate', async () => {
      const response = await call('POST', '/campaigns/join', ana, { code: protectedCode });
      expect(response.statusCode).toBe(200);
      const { campaign } = joinCampaignResponseDto.parse(response.json());
      expect(campaign).toMatchObject({ myRole: 'player', memberCount: 2 });
    });

    it('enter by a member answers 204 and puts the campaign on top with its last entry', async () => {
      await createCampaign(ana, { name: 'Mesa nova da Ana' });
      const response = await call('POST', `/campaigns/${protectedId}/enter`, ana);
      expect(response.statusCode).toBe(204);
      const listed = listCampaignsResponseDto.parse((await call('GET', '/campaigns', ana)).json());
      expect(listed.campaigns[0]).toMatchObject({ name: 'Pântano' });
      expect(listed.campaigns[0]?.lastEnteredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('the 11th join attempt in a minute answers 429 RATE_LIMITED with Retry-After', async () => {
      const attempts: LightMyRequestResponse[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        attempts.push(await call('POST', '/campaigns/join', bia, { code: 'ZZZZ2345' }));
      }
      const last = attempts.at(-1);
      expect(last?.statusCode).toBe(429);
      expect(last && apiErrorDto.parse(last.json())).toMatchObject({ code: 'RATE_LIMITED' });
      expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});
