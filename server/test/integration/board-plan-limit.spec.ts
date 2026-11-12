import {
  sheetTemplateResponseDto,
  sheetWriteResponseDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao, type NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import { setAccountPlan } from '../support/account-plans';
import { envelope, send, silence, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const FIRE = { kind: 'effect', radius: 3, effect: 'fire', color: null, opacity: 100 } as const;
const GOLD = { kind: 'color', radius: 2, color: 'gold', opacity: 60 } as const;
const ROUTE = {
  path: [
    [3, 4],
    [6, 4],
  ],
  repeat: 'bounce',
  speed: 1,
  turns: true,
  gait: 'glide',
};
const TORCH = { x: 5.5, y: 3, bright: 4, dim: 4 } as const;

function planRefusal(resource: string, limit: number, plan: UserPlan = 'free'): object {
  const planLimit = { resource, limit, plan };
  return { ok: false, error: expect.objectContaining({ code: 'PLAN_LIMIT', planLimit }) };
}

function barsOf(count: number): object[] {
  return Array.from({ length: count }, (_, index) => ({
    label: `Barra ${index + 1}`,
    current: 1,
    max: 1,
    color: 'gold',
    visibility: 'everyone',
  }));
}

function formsOf(count: number): object[] {
  return Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Forma ${index + 1}`,
    imageAssetId: null,
    width: 1,
    height: 1,
    frame: 'square',
  }));
}

function updateOf(table: Table, tokenId: string, overrides: object = {}): object {
  const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 };
  return { ...envelope(table.id), tokenId, ...fields, controllerIds: [], bars: [], ...overrides };
}

async function planOf(user: SignedInUser, plan: UserPlan): Promise<void> {
  await setAccountPlan(live.connection.db, user.id, plan);
}

async function createdBy(master: RealtimeClient, overrides: object = {}): Promise<string> {
  const events = recordEventsOf(master);
  const command = tokenCommandFor(live.vharn, live.bia.id, { bars: [], ...overrides });
  const ack = await send(master, 'token:create', command);
  if (!ack.ok) throw new Error(`token:create refused with ${ack.error.code}`);
  return (await createdTokenOf(events)).id;
}

async function groupSceneOf(table: Table): Promise<string> {
  const scene = await new ScenesDao(live.connection.db).findActiveOf(table.id);
  if (!scene) throw new Error(`table ${table.id} has no scene`);
  return scene.id;
}

// A token saved straight in the database with `bars` bars (from before the plan went down).
async function savedWithBars(table: Table, bars: number): Promise<string> {
  const sceneId = await groupSceneOf(table);
  const look = { sceneId, name: 'Ogro', initials: 'OG', side: 'enemy', col: 1, row: 1 } as const;
  const row: NewTokenRow = {
    token: { ...look, width: 1, height: 1 },
    bars: Array.from({ length: bars }, (_, position) => ({
      label: `Antiga ${position + 1}`,
      current: 1,
      max: 1,
      temp: 0,
      color: 'gold',
      visibility: 'everyone' as const,
    })),
    controllerIds: [],
  };
  return (await new TokensDao(live.connection.db).insert(row)).token.id;
}

// The refused command leaves no token event on the table, as heard by Caio.
async function expectNothingHeard(caio: ReturnType<typeof recordEventsOf>): Promise<void> {
  await silence();
  expect(caio.events.map(({ name }) => name).filter((name) => name.startsWith('token:'))).toEqual(
    [],
  );
}

describe('the board commands follow the plan of the table owner', () => {
  beforeEach(() => planOf(live.ana, 'free'));

  describe('bars and forms', () => {
    it('on a free table, token:create with 3 bars is PLAN_LIMIT tokenBars and no event goes out', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const caio = recordEventsOf(await live.atTable(live.caio, live.vharn));

      const command = tokenCommandFor(live.vharn, live.bia.id, { bars: barsOf(3) });
      expect(await send(ana, 'token:create', command)).toEqual(planRefusal('tokenBars', 2));

      await expectNothingHeard(caio);
      expect((await synced(ana, live.vharn)).tokens).toEqual([]);
    });

    it('token:update to 3 bars is refused the same way', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const lyraId = await createdBy(ana, { bars: barsOf(2) });

      const ack = await send(
        ana,
        'token:update',
        updateOf(live.vharn, lyraId, { bars: barsOf(3) }),
      );

      expect(ack).toEqual(planRefusal('tokenBars', 2));
    });

    it('a token with 5 bars from before the downgrade keeps them while only its name changes', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const ogroId = await savedWithBars(live.vharn, 5);

      const renamed = { name: 'Ogro velho', bars: barsOf(5) };
      const ack = await send(ana, 'token:update', updateOf(live.vharn, ogroId, renamed));

      expect(ack).toMatchObject({ ok: true });
      const [after] = (await synced(ana, live.vharn)).tokens;
      expect([after?.name, after?.bars.length]).toEqual(['Ogro velho', 5]);
    });

    it('3 forms on token:update are PLAN_LIMIT tokenForms', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const lyraId = await createdBy(ana);

      const ack = await send(
        ana,
        'token:update',
        updateOf(live.vharn, lyraId, { forms: formsOf(3) }),
      );

      expect(ack).toEqual(planRefusal('tokenForms', 2));
    });

    it('a paste of a copy with 3 bars is refused whole', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const copy = tokenCommandFor(live.vharn, live.bia.id, { bars: barsOf(3) }) as Record<
        string,
        unknown
      >;
      delete copy.actionId;
      delete copy.campaignId;

      const ack = await send(ana, 'token:createMany', {
        ...envelope(live.vharn.id),
        tokens: [copy],
      });

      expect(ack).toEqual(planRefusal('tokenBars', 2));
    });
  });

  describe('aura', () => {
    it('an effect aura on a new token, on token:update and on token:restyleMany is PLAN_LIMIT auraKind', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const lyraId = await createdBy(ana);
      const restyle = { ...envelope(live.vharn.id), tokenIds: [lyraId], style: { aura: FIRE } };
      const image = { kind: 'image', radius: 1, imageAssetId: crypto.randomUUID(), opacity: 100 };

      const created = await send(
        ana,
        'token:create',
        tokenCommandFor(live.vharn, live.bia.id, { aura: FIRE }),
      );
      const updated = await send(
        ana,
        'token:update',
        updateOf(live.vharn, lyraId, { aura: image }),
      );
      const restyled = await send(ana, 'token:restyleMany', restyle);

      const refused = planRefusal('auraKind', 0);
      expect([created, updated, restyled]).toEqual([refused, refused, refused]);
    });

    it('a color aura passes on the free table', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const lyraId = await createdBy(ana, { aura: GOLD });
      const restyle = { ...envelope(live.vharn.id), tokenIds: [lyraId], style: { aura: GOLD } };

      expect(await send(ana, 'token:restyleMany', restyle)).toMatchObject({ ok: true });
    });
  });

  describe('sight blockers and patrols', () => {
    it('turning blocksSight on is PLAN_LIMIT sightBlockers', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const lyraId = await createdBy(ana);

      const ack = await send(
        ana,
        'token:update',
        updateOf(live.vharn, lyraId, { blocksSight: true }),
      );

      expect(ack).toEqual(planRefusal('sightBlockers', 0));
    });

    it('starting a patrol is PLAN_LIMIT patrols; pausing one started on narrador passes', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const lyraId = await createdBy(ana);
      const active = (on: boolean) => ({
        ...envelope(live.vharn.id),
        tokenIds: [lyraId],
        active: on,
      });
      await send(ana, 'token:setPatrol', {
        ...envelope(live.vharn.id),
        tokenId: lyraId,
        patrol: ROUTE,
      });

      expect(await send(ana, 'token:setPatrolActiveMany', active(true))).toEqual(
        planRefusal('patrols', 0),
      );

      await planOf(live.ana, 'narrador');
      expect(await send(ana, 'token:setPatrolActiveMany', active(true))).toMatchObject({
        ok: true,
      });
      await planOf(live.ana, 'free');
      expect(await send(ana, 'token:setPatrolActiveMany', active(false))).toMatchObject({
        ok: true,
      });
    });
  });

  describe('lights', () => {
    it('the 16th light of the scene is PLAN_LIMIT lights; the 15 before it pass', async () => {
      const ana = await live.atTable(live.ana, live.vharn);
      const fifteen = Array.from({ length: 15 }, () => TORCH);
      const create = (lights: object[]) => ({ ...envelope(live.vharn.id), lights });

      expect(await send(ana, 'light:createMany', create(fifteen))).toMatchObject({ ok: true });
      expect(await send(ana, 'light:createMany', create([TORCH]))).toEqual(
        planRefusal('lights', 15),
      );
    });
  });

  describe('the sheet SDK', () => {
    it("the sheet creating a 3rd bar on Bia's character is 403 PLAN_LIMIT tokenBars", async () => {
      const sheetId = await sheetOfBia();
      const url = `/api/campaigns/${live.vharn.id}/sheets/${sheetId}/bars`;
      const create = (label: string) =>
        live.http(live.bia, { method: 'POST', url, payload: { bar: { label, max: 6 } } });

      expect((await create('Fôlego')).statusCode).toBe(201);
      expect((await create('Mana')).statusCode).toBe(201);
      const third = await create('Sorte');

      expect(third.statusCode).toBe(403);
      expect(third.json()).toMatchObject({
        code: 'PLAN_LIMIT',
        planLimit: { resource: 'tokenBars', limit: 2, plan: 'free' },
      });
    });
  });

  describe('amigo_do_dono and isolation', () => {
    it('an amigo_do_dono table takes 8 bars, an effect aura, a blocker and 16 lights as today', async () => {
      await planOf(live.ana, 'amigo_do_dono');
      const ana = await live.atTable(live.ana, live.vharn);
      const sixteen = Array.from({ length: 16 }, () => TORCH);
      const command = tokenCommandFor(live.vharn, live.bia.id, {
        bars: barsOf(8),
        aura: FIRE,
        blocksSight: true,
      });

      expect(await send(ana, 'token:create', command)).toMatchObject({ ok: true });
      const lights = { ...envelope(live.vharn.id), lights: sixteen };
      expect(await send(ana, 'light:createMany', lights)).toMatchObject({ ok: true });
    });

    it("a command on Quelm reads Caio's plan, not Ana's", async () => {
      await planOf(live.caio, 'amigo_do_dono');
      const ana = await live.atTable(live.ana, live.vharn);
      const caio = await live.atTable(live.caio, live.quelm);
      const onQuelm = tokenCommandFor(live.quelm, live.caio.id, { bars: barsOf(3) });
      const onVharn = tokenCommandFor(live.vharn, live.bia.id, { bars: barsOf(3) });

      expect(await send(caio, 'token:create', onQuelm)).toMatchObject({ ok: true });
      expect(await send(ana, 'token:create', onVharn)).toEqual(planRefusal('tokenBars', 2));
    });
  });
});

// A sheet of Bia's character on Vharn whose template declares character:bars.
async function sheetOfBia(): Promise<string> {
  const base = `/api/campaigns/${live.vharn.id}`;
  const code = { files: [{ path: 'index.html', content: '<p></p>' }] };
  const manifest = { permissions: ['character:bars'], bars: [] };
  const templatePayload = { name: 'Ficha de Lork', ...code, manifest };
  const template = await live.http(live.ana, {
    method: 'POST',
    url: `${base}/sheet-templates`,
    payload: templatePayload,
  });
  if (template.statusCode !== 201) throw new Error(`template answered ${template.body}`);
  const templateId = sheetTemplateResponseDto.parse(template.json()).template.id;
  const holder = { memberId: live.bia.id };
  const payload = { actionId: crypto.randomUUID(), templateId, name: 'Lork', holder };
  const sheet = await live.http(live.ana, { method: 'POST', url: `${base}/sheets`, payload });
  if (sheet.statusCode !== 201) throw new Error(`sheet answered ${sheet.body}`);
  await silence();
  return sheetWriteResponseDto.parse(sheet.json()).sheet.id;
}
