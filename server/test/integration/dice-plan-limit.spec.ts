import {
  apiErrorDto,
  diceRollAckDto,
  diceRolledDto,
  savedRollNameKey,
  type DiceRollAckDto,
  type DiceRolledDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SavedRollsDao } from '../../src/modules/saved-rolls/saved-rolls.dao';
import { setAccountPlan } from '../support/account-plans';
import { envelope, eventPayload } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const ATTACK = [{ label: null, expression: '1d20+5' }];

type Emit = (event: string, payload: object) => Promise<unknown>;

async function roll(
  client: RealtimeClient,
  table: Table,
  expression: string,
): Promise<DiceRollAckDto> {
  const timed = client.timeout(4000);
  const emit = timed.emitWithAck as Emit;
  const parts = [{ label: null, expression }];
  const payload = { ...envelope(table.id), label: null, parts, visibility: 'public', aspect: 1 };
  return diceRollAckDto.parse(await emit.call(timed, 'dice:roll', payload));
}

async function rolledAt(table: Table, expression: string): Promise<DiceRolledDto> {
  const bia = await live.atTable(live.bia, table);
  const heard = recordEventsOf(bia);
  await roll(bia, table, expression);
  return diceRolledDto.parse(await eventPayload(heard, 'dice:rolled'));
}

function modeledDiceOf(rolled: DiceRolledDto): number {
  return rolled.parts[0]?.dice.filter((die) => die.model !== undefined).length ?? 0;
}

async function keepRollsOf(user: SignedInUser, table: Table, count: number): Promise<void> {
  const rolls = new SavedRollsDao(live.connection.db);
  for (let index = 1; index <= count; index += 1) {
    const name = `Rolagem ${index}`;
    const row = { name, nameKey: savedRollNameKey(name), parts: ATTACK };
    await rolls.insert({ campaignId: table.id, userId: user.id, ...row });
  }
}

function saveRoll(user: SignedInUser, table: Table, name: string) {
  const url = `/api/campaigns/${table.id}/saved-rolls`;
  return live.http(user, { method: 'POST', url, payload: { name, parts: ATTACK } });
}

function saveFolder(user: SignedInUser, table: Table, name: string) {
  const url = `/api/campaigns/${table.id}/saved-roll-folders`;
  return live.http(user, { method: 'POST', url, payload: { name } });
}

describe("dice with physics hold to the table owner's plan", () => {
  it('at Ana’s free table, 10d6 throws 8 models and draws 2 dice, and the total sums all 10', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');

    const rolled = await rolledAt(live.vharn, '10d6');

    expect(rolled.throw?.models).toHaveLength(8);
    expect(modeledDiceOf(rolled)).toBe(8);
    const dice = rolled.parts[0]?.dice ?? [];
    expect(dice).toHaveLength(10);
    expect(rolled.total).toBe(dice.reduce((sum, die) => sum + die.value, 0));
  });

  it('at Ana’s narrador table, 16d6 throws 15 models', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');

    const rolled = await rolledAt(live.vharn, '16d6');

    expect(rolled.throw?.models).toHaveLength(15);
  });

  it('at Ana’s lenda table, 20d6 throws 20 models', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'lenda');

    const rolled = await rolledAt(live.vharn, '20d6');

    expect(rolled.throw?.models).toHaveLength(20);
  });

  it('a plan changed in the backoffice counts on the next roll of the same connection', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');
    const bia = await live.atTable(live.bia, live.vharn);
    const heard = recordEventsOf(bia);
    await roll(bia, live.vharn, '12d6');
    await setAccountPlan(live.connection.db, live.ana.id, 'free');

    await roll(bia, live.vharn, '12d6');

    const rolls = heard.events.filter(({ name }) => name === 'dice:rolled');
    const models = rolls.map(({ payload }) => diceRolledDto.parse(payload).throw?.models.length);
    expect(models).toEqual([12, 8]);
  });
});

describe("saved rolls and folders of a Grátis member hold to the table owner's plan", () => {
  it('at Ana’s free table, Bia’s 4th saved roll is 403 PLAN_LIMIT savedRolls, limit 3', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    await keepRollsOf(live.bia, live.vharn, 3);

    const response = await saveRoll(live.bia, live.vharn, 'Quarta');

    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json())).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource: 'savedRolls', limit: 3, plan: 'free' },
    });
  });

  it('at Ana’s free table, Bia’s first folder is 403 PLAN_LIMIT savedRollFolders, limit 0', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');

    const response = await saveFolder(live.bia, live.vharn, 'Magias');

    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).planLimit).toEqual({
      resource: 'savedRollFolders',
      limit: 0,
      plan: 'free',
      reason: 'room',
      holder: 'table',
    });
  });

  it('at Ana’s narrador table, Bia’s 16th is PLAN_LIMIT with limit 15, and a folder is created', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');
    await keepRollsOf(live.bia, live.vharn, 15);

    const roll16 = await saveRoll(live.bia, live.vharn, 'Décima sexta');
    const folder = await saveFolder(live.bia, live.vharn, 'Magias');

    expect(apiErrorDto.parse(roll16.json()).planLimit).toMatchObject({ limit: 15 });
    expect(folder.statusCode).toBe(201);
  });

  it('Bia’s 3 rolls at the free Vharn do not count at Caio’s free Quelm', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    await setAccountPlan(live.connection.db, live.caio.id, 'free');
    await live.joinAsSpectator(live.bia, live.quelm);
    const promote = `/api/campaigns/${live.quelm.id}/members/${live.bia.id}`;
    await live.http(live.caio, { method: 'PATCH', url: promote, payload: { role: 'player' } });
    await keepRollsOf(live.bia, live.vharn, 3);

    const response = await saveRoll(live.bia, live.quelm, 'Na Quelm');

    expect(response.statusCode).toBe(201);
  });
});
