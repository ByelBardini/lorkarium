import {
  apiErrorDto,
  campaignResponseDto,
  joinCampaignResponseDto,
  type CampaignDetailDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { assets } from '../../src/modules/assets/assets.po';
import { conditionDefinitions } from '../../src/modules/conditions/conditions.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { newAssetPo } from '../support/assets-factories';
import { atTable } from '../support/live-table';
import type { RealtimeClient } from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

describe('campaign settings HTTP edge', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const clients: RealtimeClient[] = [];
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let baseUrl: string;
  let anaUser: SignedInUser;
  let caioUser: SignedInUser;
  let biaUser: SignedInUser;
  let ana: string;
  let bia: string;
  let caio: string;
  let vharn: CampaignDetailDto;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    anaUser = await signUpAndLogin(app, connection.db, 'Ana');
    caioUser = await signUpAndLogin(app, connection.db, 'Caio');
    ana = anaUser.token;
    biaUser = await signUpAndLogin(app, connection.db, 'Bia');
    bia = biaUser.token;
    caio = caioUser.token;
    vharn = await createCampaign(ana, { name: 'Os Sinos de Vharn', password: 'sino' });
    await joinWith(bia, vharn.joinCode ?? '', 'sino');
    await call('PATCH', `/campaigns/${vharn.id}/members/${biaUser.id}`, ana, { role: 'player' });
    await openTable(anaUser, vharn);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await app.close();
  });

  // The settings need the master at the table in a live connection (CAMPAIGN_NOT_OPEN otherwise).
  async function openTable(user: SignedInUser, campaign: CampaignDetailDto): Promise<void> {
    await atTable(baseUrl, clients, user, { id: campaign.id });
  }

  function call(
    method: Method,
    url: string,
    token?: string,
    payload?: object,
  ): Promise<LightMyRequestResponse> {
    const cookies: Record<string, string> = token ? { lk_session: token } : {};
    return app.inject({ method, url: `/api${url}`, cookies, payload });
  }

  async function createCampaign(token: string, body: object): Promise<CampaignDetailDto> {
    const response = await call('POST', '/campaigns', token, body);
    return campaignResponseDto.parse(response.json()).campaign;
  }

  function joinWith(token: string, code: string, password?: string) {
    return call('POST', '/campaigns/join', token, { code, password });
  }

  function errorOf(response: LightMyRequestResponse): Readonly<{ status: number; code: string }> {
    return { status: response.statusCode, code: apiErrorDto.parse(response.json()).code };
  }

  describe('who may change the campaign', () => {
    it.each([
      ['PATCH', `/campaigns/${UNKNOWN_ID}`],
      ['POST', `/campaigns/${UNKNOWN_ID}/join-code`],
      ['DELETE', `/campaigns/${UNKNOWN_ID}`],
    ] as const)('%s %s without a session answers 401', async (method, url) => {
      const response = await call(method, url, undefined, { name: 'x' });
      expect(errorOf(response)).toEqual({ status: 401, code: 'UNAUTHENTICATED' });
    });

    it.each([
      ['PATCH', '', { name: 'Vharn' }],
      ['POST', '/join-code', undefined],
      ['DELETE', '', undefined],
    ] as const)('%s by a player answers 403 FORBIDDEN', async (method, suffix, body) => {
      const response = await call(method, `/campaigns/${vharn.id}${suffix}`, bia, body);
      expect(errorOf(response)).toEqual({ status: 403, code: 'FORBIDDEN' });
    });

    it.each([
      ['PATCH', '', { name: 'Vharn' }],
      ['POST', '/join-code', undefined],
      ['DELETE', '', undefined],
    ] as const)(
      '%s by someone outside the table answers 404 CAMPAIGN_NOT_FOUND (criterion 14)',
      async (method, suffix, body) => {
        const response = await call(method, `/campaigns/${vharn.id}${suffix}`, caio, body);
        expect(errorOf(response)).toEqual({ status: 404, code: 'CAMPAIGN_NOT_FOUND' });
      },
    );

    it.each([
      ['PATCH', '', { name: 'Vharn' }],
      ['POST', '/join-code', undefined],
      ['DELETE', '', undefined],
    ] as const)(
      '%s by the master without the table open answers 403 CAMPAIGN_NOT_OPEN',
      async (method, suffix, body) => {
        const closed = await createCampaign(ana, { name: 'Quelm da Ana' });
        const response = await call(method, `/campaigns/${closed.id}${suffix}`, ana, body);
        expect(response.statusCode).toBe(403);
        expect(apiErrorDto.parse(response.json())).toEqual({
          code: 'CAMPAIGN_NOT_OPEN',
          message: 'Open the campaign table to change its settings',
        });
        const detail = campaignResponseDto.parse(
          (await call('GET', `/campaigns/${closed.id}`, ana)).json(),
        );
        expect(detail.campaign).toMatchObject({ name: 'Quelm da Ana', joinCode: closed.joinCode });
      },
    );

    it('the master of another table cannot change this one', async () => {
      const quelm = await createCampaign(caio, { name: 'Quelm' });
      await openTable(caioUser, quelm);
      const response = await call('PATCH', `/campaigns/${vharn.id}`, caio, { name: 'Roubada' });
      expect(errorOf(response).status).toBe(404);
      const own = await call('PATCH', `/campaigns/${quelm.id}`, caio, { name: 'Quelm 2' });
      expect(own.statusCode).toBe(200);
    });
  });

  describe('PATCH /campaigns/:id', () => {
    it('saves the fields sent and answers the detail', async () => {
      const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, {
        ...{ name: ' Vharn ', status: 'ongoing', contentWarnings: ['gore', 'horror'] },
        ...{
          tags: ['Sandbox', 'sandbox', 'Mistério'],
          cover: { kind: 'drawn', drawing: 2, tone: 4 },
        },
      });
      expect(response.statusCode).toBe(200);
      expect(campaignResponseDto.parse(response.json()).campaign).toMatchObject({
        name: 'Vharn',
        status: 'ongoing',
        contentWarnings: ['gore', 'horror'],
        tags: ['Sandbox', 'Mistério'],
        cover: { kind: 'drawn', drawing: 2, tone: 4 },
        system: vharn.system,
      });
    });

    it('the player sees the saved fields in the detail', async () => {
      await call('PATCH', `/campaigns/${vharn.id}`, ana, { name: 'Vharn', status: 'finished' });
      const response = await call('GET', `/campaigns/${vharn.id}`, bia);
      expect(campaignResponseDto.parse(response.json()).campaign).toMatchObject({
        name: 'Vharn',
        status: 'finished',
      });
    });

    it.each([
      ['an empty body', {}],
      ['a status outside the enum', { status: 'Pausada' }],
      ['a forged owner', { ownerId: UNKNOWN_ID }],
    ])('%s answers 400 INVALID_BODY', async (_, body) => {
      const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, body);
      expect(errorOf(response)).toEqual({ status: 400, code: 'INVALID_BODY' });
    });

    it('a new password is the one the join asks from then on', async () => {
      await call('PATCH', `/campaigns/${vharn.id}`, ana, { password: 'torre' });
      expect(errorOf(await joinWith(caio, vharn.joinCode ?? '', 'sino')).code).toBe(
        'CAMPAIGN_PASSWORD_INVALID',
      );
      expect((await joinWith(caio, vharn.joinCode ?? '', 'torre')).statusCode).toBe(200);
    });

    it('a removed password lets anyone with the code in', async () => {
      const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, { password: null });
      expect(campaignResponseDto.parse(response.json()).campaign.hasPassword).toBe(false);
      expect((await joinWith(caio, vharn.joinCode ?? '')).statusCode).toBe(200);
    });

    it('an image cover sent to this table as a cover becomes the cover', async () => {
      const cover = await new AssetsDao(connection.db).insert(
        newAssetPo({ campaignId: vharn.id, purpose: 'cover' }),
      );
      const body = { cover: { kind: 'image', assetId: cover.id } };
      const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, body);
      expect(campaignResponseDto.parse(response.json()).campaign.cover).toEqual(body.cover);
    });

    it.each([
      ['an image of this table sent for a token', 'token', false],
      ['a cover of another table', 'cover', true],
    ] as const)('%s answers 400 INVALID_BODY', async (_, purpose, elsewhere) => {
      const quelm = await createCampaign(caio, { name: 'Quelm' });
      const campaignId = elsewhere ? quelm.id : vharn.id;
      const asset = await new AssetsDao(connection.db).insert(newAssetPo({ campaignId, purpose }));
      const body = { cover: { kind: 'image', assetId: asset.id } };
      const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, body);
      expect(errorOf(response)).toEqual({ status: 400, code: 'INVALID_BODY' });
    });
  });

  describe('the token settings of the players', () => {
    async function settingsOf(campaignId: string, token: string) {
      const response = await call('GET', `/campaigns/${campaignId}`, token);
      const { playersCreateTokens, playersDeleteTokens } = campaignResponseDto.parse(
        response.json(),
      ).campaign;
      return { playersCreateTokens, playersDeleteTokens };
    }

    it('a new table starts with both settings off', async () => {
      expect(vharn).toMatchObject({ playersCreateTokens: false, playersDeleteTokens: false });
    });

    it('the master at the table turns one on: 200, and the detail reread keeps the other off', async () => {
      const response = await call('PATCH', `/campaigns/${vharn.id}`, ana, {
        playersCreateTokens: true,
      });
      expect(response.statusCode).toBe(200);
      expect(await settingsOf(vharn.id, bia)).toEqual({
        playersCreateTokens: true,
        playersDeleteTokens: false,
      });
    });

    it('a setting turned off again is stored off', async () => {
      const on = { playersCreateTokens: true, playersDeleteTokens: true };
      await call('PATCH', `/campaigns/${vharn.id}`, ana, on);
      await call('PATCH', `/campaigns/${vharn.id}`, ana, { playersDeleteTokens: false });
      expect(await settingsOf(vharn.id, ana)).toEqual({
        playersCreateTokens: true,
        playersDeleteTokens: false,
      });
    });

    it('a player turning one on answers 403 FORBIDDEN and nothing changes', async () => {
      const response = await call('PATCH', `/campaigns/${vharn.id}`, bia, {
        playersDeleteTokens: true,
      });
      expect(errorOf(response)).toEqual({ status: 403, code: 'FORBIDDEN' });
      expect((await settingsOf(vharn.id, ana)).playersDeleteTokens).toBe(false);
    });

    it('the master without the table open answers 403 CAMPAIGN_NOT_OPEN and nothing changes', async () => {
      const closed = await createCampaign(ana, { name: 'Quelm da Ana' });
      const response = await call('PATCH', `/campaigns/${closed.id}`, ana, {
        playersCreateTokens: true,
      });
      expect(errorOf(response)).toEqual({ status: 403, code: 'CAMPAIGN_NOT_OPEN' });
      expect((await settingsOf(closed.id, ana)).playersCreateTokens).toBe(false);
    });

    it('turning them on in one table leaves another table off (isolation)', async () => {
      const quelm = await createCampaign(caio, { name: 'Quelm' });
      const on = { playersCreateTokens: true, playersDeleteTokens: true };
      await call('PATCH', `/campaigns/${vharn.id}`, ana, on);
      expect(await settingsOf(quelm.id, caio)).toEqual({
        playersCreateTokens: false,
        playersDeleteTokens: false,
      });
    });
  });

  describe('POST /campaigns/:id/join-code', () => {
    it('hands out another code; the old one no longer finds the table, members stay and the newcomer only watches', async () => {
      const response = await call('POST', `/campaigns/${vharn.id}/join-code`, ana);
      expect(response.statusCode).toBe(200);
      const { campaign } = campaignResponseDto.parse(response.json());
      expect(campaign.joinCode).not.toBe(vharn.joinCode);
      expect(errorOf(await joinWith(caio, vharn.joinCode ?? '', 'sino')).code).toBe(
        'CAMPAIGN_NOT_FOUND',
      );
      const joined = await joinWith(caio, campaign.joinCode ?? '', 'sino');
      expect(joinCampaignResponseDto.parse(joined.json()).campaign).toMatchObject({
        myRole: 'spectator',
        memberCount: 2,
      });
    });
  });

  describe('DELETE /campaigns/:id', () => {
    it('answers 204 and then the table is gone for everyone', async () => {
      const response = await call('DELETE', `/campaigns/${vharn.id}`, ana);
      expect(response.statusCode).toBe(204);
      for (const token of [ana, bia]) {
        const detail = await call('GET', `/campaigns/${vharn.id}`, token);
        expect(errorOf(detail)).toEqual({ status: 404, code: 'CAMPAIGN_NOT_FOUND' });
      }
      const listed = await call('GET', '/campaigns', bia);
      expect(listed.json()).toEqual({ campaigns: [] });
    });

    it('takes the scenes, the conditions and the assets of the table with it, and only them', async () => {
      const quelm = await createCampaign(caio, { name: 'Quelm' });
      const assetsDao = new AssetsDao(connection.db);
      await assetsDao.insert(newAssetPo({ campaignId: vharn.id, purpose: 'cover' }));
      await assetsDao.insert(newAssetPo({ campaignId: quelm.id, purpose: 'cover' }));
      await call('DELETE', `/campaigns/${vharn.id}`, ana);
      const { db } = connection;
      expect(await db.select().from(scenes).where(eq(scenes.campaignId, vharn.id))).toEqual([]);
      const vharnConditions = eq(conditionDefinitions.campaignId, vharn.id);
      expect(await db.select().from(conditionDefinitions).where(vharnConditions)).toEqual([]);
      expect(await db.select().from(assets).where(eq(assets.campaignId, vharn.id))).toEqual([]);
      expect(await db.select().from(scenes).where(eq(scenes.campaignId, quelm.id))).toHaveLength(2);
      expect(await db.select().from(assets).where(eq(assets.campaignId, quelm.id))).toHaveLength(1);
    });

    it('a second delete of the same table answers 404', async () => {
      await call('DELETE', `/campaigns/${vharn.id}`, ana);
      const again = await call('DELETE', `/campaigns/${vharn.id}`, ana);
      expect(errorOf(again)).toEqual({ status: 404, code: 'CAMPAIGN_NOT_FOUND' });
    });
  });

  describe('Bia, a co-master, at the settings', () => {
    beforeEach(async () => {
      await call('PATCH', `/campaigns/${vharn.id}/members/${biaUser.id}`, ana, { role: 'master' });
      await openTable(biaUser, vharn);
    });

    it('edits the campaign: 200 with the name saved', async () => {
      const response = await call('PATCH', `/campaigns/${vharn.id}`, bia, { name: 'Vharn da Bia' });
      expect(response.statusCode).toBe(200);
      expect(campaignResponseDto.parse(response.json()).campaign.name).toBe('Vharn da Bia');
    });

    it('hands out another join code: 200 with a code that is not the old one', async () => {
      const response = await call('POST', `/campaigns/${vharn.id}/join-code`, bia);
      expect(response.statusCode).toBe(200);
      const { joinCode } = campaignResponseDto.parse(response.json()).campaign;
      expect(joinCode).not.toBe(vharn.joinCode);
    });

    it('deleting is 403 FORBIDDEN and the campaign is still there', async () => {
      const response = await call('DELETE', `/campaigns/${vharn.id}`, bia);
      expect(errorOf(response)).toEqual({ status: 403, code: 'FORBIDDEN' });
      expect((await call('GET', `/campaigns/${vharn.id}`, ana)).statusCode).toBe(200);
    });
  });
});
