import {
  apiErrorDto,
  savedRollDto,
  savedRollFolderDto,
  savedRollsResponseDto,
  type SavedRollDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import { joinAsPlayer, secondTableOf } from '../support/plan-lock-tables';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();
const ATTACK = [{ label: null, expression: '1d20+5' }];

function anaOn(plan: UserPlan): Promise<void> {
  return setAccountPlan(live.connection.db, live.ana.id, plan);
}

function rollsUrl(table: Table): string {
  return `/api/campaigns/${table.id}/saved-rolls`;
}

// `count` rolls of `user` at `table`, each saved through the HTTP edge with Ana on
// `amigo_do_dono`, so the creation order is the order of the names.
async function rollsBornAbovePlan(
  user: SignedInUser,
  table: Table,
  count: number,
): Promise<SavedRollDto[]> {
  await anaOn('amigo_do_dono');
  const saved: SavedRollDto[] = [];
  for (let index = 1; index <= count; index += 1) {
    const payload = { name: `Rolagem ${index}`, parts: ATTACK };
    const response = await live.http(user, { method: 'POST', url: rollsUrl(table), payload });
    expect(response.statusCode, response.body).toBe(201);
    saved.push(savedRollDto.parse(response.json()));
  }
  return saved;
}

function rollAt(rolls: readonly SavedRollDto[], index: number): SavedRollDto {
  const roll = rolls[index];
  if (!roll) throw new Error(`No saved roll ${index}; there are ${rolls.length}`);
  return roll;
}

function edit(user: SignedInUser, table: Table, roll: SavedRollDto, payload: object) {
  const url = `${rollsUrl(table)}/${roll.id}`;
  return live.http(user, { method: 'PATCH', url, payload });
}

async function listOf(user: SignedInUser, table: Table): Promise<SavedRollDto[]> {
  const response = await live.http(user, { method: 'GET', url: rollsUrl(table) });
  expect(response.statusCode, response.body).toBe(200);
  return savedRollsResponseDto.parse(response.json()).savedRolls;
}

function locksOf(rolls: readonly SavedRollDto[]): boolean[] {
  return rolls.map(({ planLocked }) => planLocked);
}

function expectReadOnly(response: { statusCode: number; body: string; json: () => unknown }): void {
  expect(response.statusCode, response.body).toBe(403);
  expect(apiErrorDto.parse(response.json())).toMatchObject({
    code: 'PLAN_LIMIT',
    planLimit: { resource: 'savedRolls', reason: 'readOnly', limit: 3, plan: 'free' },
  });
}

describe('saved rolls past the plan of a table that went down are read only', () => {
  it('at Ana’s free Vharn, Bia renames her 3rd of 5 rolls with 200 and the 4th is 403 PLAN_LIMIT readOnly', async () => {
    const rolls = await rollsBornAbovePlan(live.bia, live.vharn, 5);
    await anaOn('free');

    const third = await edit(live.bia, live.vharn, rollAt(rolls, 2), { name: 'Terceira' });
    const fourth = await edit(live.bia, live.vharn, rollAt(rolls, 3), { name: 'Quarta' });

    expect(third.statusCode, third.body).toBe(200);
    expectReadOnly(fourth);
    expect(rollAt(await listOf(live.bia, live.vharn), 3).name).toBe('Rolagem 4');
  });

  it('a new formula on the 5th roll is refused, and moving it into a folder passes', async () => {
    const rolls = await rollsBornAbovePlan(live.bia, live.vharn, 5);
    const folderUrl = `/api/campaigns/${live.vharn.id}/saved-roll-folders`;
    const created = await live.http(live.bia, {
      method: 'POST',
      url: folderUrl,
      payload: { name: 'Magias' },
    });
    const folder = savedRollFolderDto.parse(created.json());
    await anaOn('free');

    const parts = [{ label: null, expression: '2d6' }];
    const formula = await edit(live.bia, live.vharn, rollAt(rolls, 4), { parts });
    const moved = await edit(live.bia, live.vharn, rollAt(rolls, 4), { folderId: folder.id });

    expectReadOnly(formula);
    expect(moved.statusCode, moved.body).toBe(200);
    expect(savedRollDto.parse(moved.json())).toMatchObject({
      folderId: folder.id,
      planLocked: true,
    });
  });

  it('the list carries planLocked only from the 4th roll on', async () => {
    await rollsBornAbovePlan(live.bia, live.vharn, 5);
    await anaOn('free');

    expect(locksOf(await listOf(live.bia, live.vharn))).toEqual([false, false, false, true, true]);
  });

  it('deleting the 2nd roll is 204, and then the old 4th renames with 200', async () => {
    const rolls = await rollsBornAbovePlan(live.bia, live.vharn, 5);
    await anaOn('free');

    const url = `${rollsUrl(live.vharn)}/${rollAt(rolls, 1).id}`;
    const deleted = await live.http(live.bia, { method: 'DELETE', url });
    const oldFourth = await edit(live.bia, live.vharn, rollAt(rolls, 3), { name: 'Agora livre' });

    expect(deleted.statusCode, deleted.body).toBe(204);
    expect(oldFourth.statusCode, oldFourth.body).toBe(200);
    expect(locksOf(await listOf(live.bia, live.vharn))).toEqual([false, false, false, true]);
  });

  it('the rank is per member: Caio’s 3rd roll, newer than Bia’s 5, renames with 200', async () => {
    await rollsBornAbovePlan(live.bia, live.vharn, 5);
    const caios = await rollsBornAbovePlan(live.caio, live.vharn, 3);
    await anaOn('free');

    const third = await edit(live.caio, live.vharn, rollAt(caios, 2), { name: 'Terceira do Caio' });

    expect(third.statusCode, third.body).toBe(200);
    expect(locksOf(await listOf(live.caio, live.vharn))).toEqual([false, false, false]);
  });

  it('Bia’s rolls at Ana’s Vharn do not count at Ana’s other table Ermo, both on free', async () => {
    await rollsBornAbovePlan(live.bia, live.vharn, 5);
    const ermo = await secondTableOf(live, live.ana, 'Ermo');
    await joinAsPlayer(live, live.bia, ermo);
    const atErmo = await rollsBornAbovePlan(live.bia, ermo, 3);
    await anaOn('free');

    const third = await edit(live.bia, ermo, rollAt(atErmo, 2), { name: 'Terceira de Ermo' });

    expect(third.statusCode, third.body).toBe(200);
    expect(locksOf(await listOf(live.bia, ermo))).toEqual([false, false, false]);
  });
});
