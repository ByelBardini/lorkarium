import {
  tokenCreatedDto,
  type TokenDto,
  type TokenFormDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { setAccountPlan } from '../support/account-plans';
import { barInputsOf, barsOf, formsOf, planRefusal, updateOf } from '../support/board-plan';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import { tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const TORCH = { x: 5.5, y: 3, bright: 4, dim: 4 } as const;
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

async function planOf(plan: UserPlan): Promise<void> {
  await setAccountPlan(live.connection.db, live.ana.id, plan);
}

// Ana creates on an amigo_do_dono table (no plan limit), then the table goes down to free.
async function bornAboveThePlan<T>(make: (ana: RealtimeClient) => Promise<T>): Promise<T> {
  await planOf('amigo_do_dono');
  const made = await make(await live.atTable(live.ana, live.vharn));
  await planOf('free');
  return made;
}

async function tokenOf(ana: RealtimeClient, overrides: Record<string, unknown>): Promise<TokenDto> {
  const events = recordEventsOf(ana);
  const ack = await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id, overrides));
  if (!ack.ok) throw new Error(`token:create refused with ${ack.error.code}`);
  return tokenCreatedDto.parse(await eventPayload(events, 'token:created')).token;
}

async function lightsOf(ana: RealtimeClient, count: number, sceneId?: string): Promise<string[]> {
  const lights = Array.from({ length: count }, () => TORCH);
  const ack = await send(ana, 'light:createMany', { ...envelope(live.vharn.id), sceneId, lights });
  if (!ack.ok) throw new Error(`light:createMany refused with ${ack.error.code}`);
  return ack.createdIds ?? [];
}

// A setup step that must be confirmed.
async function accepted(client: RealtimeClient, event: string, payload: object): Promise<void> {
  const ack = await send(client, event, payload);
  if (!ack.ok) throw new Error(`${event} refused with ${ack.error.code}`);
}

// The forms as the server saved them (their ids are the server's), in position order.
async function storedFormsOf(ana: RealtimeClient, tokenId: string): Promise<TokenFormDto[]> {
  const token = (await synced(ana, live.vharn)).tokens.find(({ id }) => id === tokenId);
  return (token?.forms ?? []).map(({ id, name, imageAssetId, width, height, frame }) => ({
    ...{ id, name, imageAssetId, width, height, frame },
  }));
}

function moveOf(lightId: string, sceneId?: string): object {
  return { ...envelope(live.vharn.id), sceneId, moves: [{ lightId, x: 7, y: 2 }] };
}

// A grid more for Vharn, born now (after the group grid and the ones before it).
async function newGridOfVharn(name: string): Promise<string> {
  const scenes = new ScenesDao(live.connection.db);
  return (await scenes.insert({ campaignId: live.vharn.id, name, folderId: null })).id;
}

describe('past the plan of the table, the settings are read only and the play goes on', () => {
  describe('bars (the group is the token, the rank is the position)', () => {
    it('on a free table with 3 bars, adjusting the 3rd passes and a new max on the 2nd is readOnly', async () => {
      const lyra = await bornAboveThePlan((ana) => tokenOf(ana, { bars: barsOf(3) }));
      const ana = await live.atTable(live.ana, live.vharn);
      const third = lyra.bars[2]?.id ?? '';
      const adjust = { ...envelope(live.vharn.id), tokenId: lyra.id, barId: third };

      const adjusted = await send(ana, 'token:adjustBar', {
        ...adjust,
        change: { op: 'set', value: 0 },
      });
      const bars = barInputsOf(lyra).map((bar, index) => (index === 1 ? { ...bar, max: 9 } : bar));
      const raised = await send(ana, 'token:update', updateOf(live.vharn, lyra.id, { bars }));

      expect(adjusted).toMatchObject({ ok: true });
      expect(raised).toEqual(planRefusal('tokenBars', 1, 'free', 'readOnly'));
      const [after] = (await synced(ana, live.vharn)).tokens;
      expect(after?.bars.map(({ max, current }) => [max, current])).toEqual([
        [1, 1],
        [1, 1],
        [1, 0],
      ]);
    });

    it('a new label on the 2nd bar is readOnly; deleting the 1st passes and frees the next', async () => {
      const lyra = await bornAboveThePlan((ana) => tokenOf(ana, { bars: barsOf(3) }));
      const ana = await live.atTable(live.ana, live.vharn);
      const [first, second, third] = barInputsOf(lyra);
      const renamed = { bars: [first, { ...second, label: 'Mana' }, third] };

      const refused = await send(ana, 'token:update', updateOf(live.vharn, lyra.id, renamed));
      const shrunk = { bars: [{ ...second, label: 'Mana' }, third] };
      const deleted = await send(ana, 'token:update', updateOf(live.vharn, lyra.id, shrunk));

      expect(refused).toEqual(planRefusal('tokenBars', 1, 'free', 'readOnly'));
      expect(deleted).toMatchObject({ ok: true });
    });
  });

  describe('forms (the group is the token, the rank is the position)', () => {
    it('a new image on the 3rd form of a free table is readOnly; switching to it passes', async () => {
      const lyra = await bornAboveThePlan(async (ana) => {
        const token = await tokenOf(ana, { bars: [] });
        await accepted(ana, 'token:update', updateOf(live.vharn, token.id, { forms: formsOf(3) }));
        return token;
      });
      const ana = await live.atTable(live.ana, live.vharn);
      const forms = await storedFormsOf(ana, lyra.id);
      const image = await live.sendImage(live.ana, live.vharn);
      const repainted = forms.map((form, index) =>
        index === 2 ? { ...form, imageAssetId: image.id } : form,
      );
      const swapped = forms.map((form, index) =>
        index === 2 ? { ...form, id: crypto.randomUUID() } : form,
      );
      const update = (sent: object[]) => updateOf(live.vharn, lyra.id, { forms: sent });

      const refused = await send(ana, 'token:update', update(repainted));
      const renewed = await send(ana, 'token:update', update(swapped));
      const switched = await send(ana, 'token:setForm', {
        ...envelope(live.vharn.id),
        tokenId: lyra.id,
        formId: forms[2]?.id,
      });

      expect(refused).toEqual(planRefusal('tokenForms', 2, 'free', 'readOnly'));
      expect(renewed).toEqual(planRefusal('tokenForms', 2));
      expect(switched).toMatchObject({ ok: true });
    });
  });

  describe('lights (the group is the grid, the rank is the creation order)', () => {
    it('moving the 11th light of the grid is readOnly; putting it out passes', async () => {
      const ids = await bornAboveThePlan((ana) => lightsOf(ana, 11));
      const ana = await live.atTable(live.ana, live.vharn);
      const eleventh = ids[10] ?? '';

      const moved = await send(ana, 'light:moveMany', moveOf(eleventh));
      const putOut = { ...envelope(live.vharn.id), lightIds: [eleventh], lit: false };
      const out = await send(ana, 'light:setLitMany', putOut);
      const tenth = await send(ana, 'light:moveMany', moveOf(ids[9] ?? ''));

      expect(moved).toEqual(planRefusal('lights', 10, 'free', 'readOnly'));
      expect([out, tenth]).toMatchObject([{ ok: true }, { ok: true }]);
      const synced11th = (await synced(ana, live.vharn)).lights.find(({ id }) => id === eleventh);
      expect(synced11th).toMatchObject({ x: 5.5, lit: false });
    });

    it('the 11 lights of the group grid do not count on another grid: its light moves', async () => {
      const cripta = await newGridOfVharn('Cripta');
      const [candle] = await bornAboveThePlan(async (ana) => {
        await lightsOf(ana, 11);
        return lightsOf(ana, 1, cripta);
      });
      const ana = await live.atTable(live.ana, live.vharn);

      expect(await send(ana, 'light:moveMany', moveOf(candle ?? '', cripta))).toMatchObject({
        ok: true,
      });
    });

    it('on the 4th grid of a free table a light change is readOnly scenes; putting it out passes', async () => {
      const grids = [];
      for (const name of ['Cripta', 'Torre', 'Porto']) grids.push(await newGridOfVharn(name));
      const [torre, porto] = [grids[1] ?? '', grids[2] ?? ''];
      const [beacon, lamp] = await bornAboveThePlan(async (ana) => [
        ...(await lightsOf(ana, 1, torre)),
        ...(await lightsOf(ana, 1, porto)),
      ]);
      const ana = await live.atTable(live.ana, live.vharn);

      const onTheThird = await send(ana, 'light:moveMany', moveOf(beacon ?? '', torre));
      const moved = await send(ana, 'light:moveMany', moveOf(lamp ?? '', porto));
      const created = await send(ana, 'light:createMany', {
        ...envelope(live.vharn.id),
        sceneId: porto,
        lights: [TORCH],
      });
      const putOut = { ...envelope(live.vharn.id), sceneId: porto, lightIds: [lamp], lit: false };

      expect(onTheThird).toMatchObject({ ok: true });
      expect([moved, created]).toEqual([
        planRefusal('scenes', 3, 'free', 'readOnly'),
        planRefusal('scenes', 3, 'free', 'readOnly'),
      ]);
      expect(await send(ana, 'light:setLitMany', putOut)).toMatchObject({ ok: true });
    });
  });

  describe('patrols and sight blockers (only lowering passes)', () => {
    it('a running patrol past the plan pauses; a new route on it is readOnly; starting again is room', async () => {
      const lyra = await bornAboveThePlan(async (ana) => {
        const token = await tokenOf(ana, { bars: [] });
        const patrol = { ...envelope(live.vharn.id), tokenId: token.id, patrol: ROUTE };
        await accepted(ana, 'token:setPatrol', patrol);
        const start = { ...envelope(live.vharn.id), tokenIds: [token.id], active: true };
        await accepted(ana, 'token:setPatrolActiveMany', start);
        return token;
      });
      const ana = await live.atTable(live.ana, live.vharn);
      const at = { ...envelope(live.vharn.id), tokenId: lyra.id };
      const active = (on: boolean) => ({
        ...envelope(live.vharn.id),
        tokenIds: [lyra.id],
        active: on,
      });

      const rerouted = await send(ana, 'token:setPatrol', {
        ...at,
        patrol: { ...ROUTE, speed: 2 },
      });
      const paused = await send(ana, 'token:setPatrolActiveMany', active(false));
      const restarted = await send(ana, 'token:setPatrolActiveMany', active(true));

      expect(rerouted).toEqual(planRefusal('patrols', 0, 'free', 'readOnly'));
      expect(paused).toMatchObject({ ok: true });
      expect(restarted).toEqual(planRefusal('patrols', 0));
    });

    it('a sight blocker past the plan turns off; turning it on again is room', async () => {
      const ogro = await bornAboveThePlan((ana) => tokenOf(ana, { bars: [], blocksSight: true }));
      const ana = await live.atTable(live.ana, live.vharn);
      const blocking = (on: boolean) => updateOf(live.vharn, ogro.id, { blocksSight: on });

      expect(await send(ana, 'token:update', blocking(false))).toMatchObject({ ok: true });
      expect(await send(ana, 'token:update', blocking(true))).toEqual(
        planRefusal('sightBlockers', 0),
      );
    });
  });
});
