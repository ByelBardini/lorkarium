import {
  apiErrorDto,
  savedTokenDto,
  savedTokensResponseDto,
  type SavedTokenDto,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

// Ana owns Vharn (Bia and Caio play there). Every account is born on Grátis.
const live = useTokenTable();

const ZOMBIE = {
  name: 'Zumbi',
  initials: 'ZB',
  side: 'enemy',
  width: 1,
  height: 1,
  bars: [],
};
const URL = () => `/api/campaigns/${live.vharn.id}/saved-tokens`;

function post(user: SignedInUser, name: string) {
  return live.http(user, { method: 'POST', url: URL(), payload: { name, token: ZOMBIE } });
}

async function saveMany(user: SignedInUser, count: number): Promise<SavedTokenDto[]> {
  const saved: SavedTokenDto[] = [];
  for (let index = 0; index < count; index += 1) {
    const response = await post(user, `Z${index + 1}`);
    if (response.statusCode !== 201) throw new Error(`save answered ${response.body}`);
    saved.push(savedTokenDto.parse(response.json()));
  }
  return saved;
}

async function lockedOf(user: SignedInUser): Promise<boolean[]> {
  const response = await live.http(user, { method: 'GET', url: URL() });
  return savedTokensResponseDto.parse(response.json()).savedTokens.map((entry) => entry.planLocked);
}

describe('the saved tokens against the plans', () => {
  it('at Ana’s Grátis table, Bia on Grátis is 403 PLAN_LIMIT savedTokens, limit 0', async () => {
    const response = await post(live.bia, 'Zumbi');

    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json()).planLimit).toMatchObject({
      resource: 'savedTokens',
      limit: 0,
      plan: 'free',
      holder: 'table',
    });
  });

  it('Bia on Apoiador at a Grátis table keeps 5 and the 6th is 403 holder account', async () => {
    await setAccountPlan(live.connection.db, live.bia.id, 'apoiador');
    await saveMany(live.bia, 5);

    const sixth = await post(live.bia, 'Z6');

    expect(sixth.statusCode).toBe(403);
    expect(apiErrorDto.parse(sixth.json()).planLimit).toMatchObject({
      resource: 'savedTokens',
      limit: 5,
      holder: 'account',
    });
  });

  it('Bia on Apoiador keeps 2 folders and the 3rd is 403 savedTokenFolders', async () => {
    await setAccountPlan(live.connection.db, live.bia.id, 'apoiador');
    const folders = `/api/campaigns/${live.vharn.id}/saved-token-folders`;
    for (const name of ['A', 'B'])
      await live.http(live.bia, { method: 'POST', url: folders, payload: { name } });

    const third = await live.http(live.bia, {
      method: 'POST',
      url: folders,
      payload: { name: 'C' },
    });

    expect(apiErrorDto.parse(third.json()).planLimit).toMatchObject({
      resource: 'savedTokenFolders',
      limit: 2,
    });
  });

  it('Ana down from Narrador: Bia’s 6th and 7th go read only, moving and deleting still pass', async () => {
    await setAccountPlan(live.connection.db, live.ana.id, 'narrador');
    await setAccountPlan(live.connection.db, live.bia.id, 'apoiador');
    const saved = await saveMany(live.bia, 7);
    await setAccountPlan(live.connection.db, live.ana.id, 'free');
    const sixth = saved[5]?.id ?? '';

    const renamed = await live.http(live.bia, {
      method: 'PATCH',
      url: `${URL()}/${sixth}`,
      payload: { name: 'Novo' },
    });
    const moved = await live.http(live.bia, {
      method: 'PATCH',
      url: `${URL()}/${sixth}`,
      payload: { folderId: null },
    });

    expect(renamed.statusCode).toBe(403);
    expect(apiErrorDto.parse(renamed.json()).planLimit?.reason).toBe('readOnly');
    expect(moved.statusCode).toBe(200);
    expect(await lockedOf(live.bia)).toEqual([false, false, false, false, false, true, true]);

    const deleted = await live.http(live.bia, {
      method: 'DELETE',
      url: `${URL()}/${saved[0]?.id}`,
    });
    expect(deleted.statusCode).toBe(204);
    expect(await lockedOf(live.bia)).toEqual([false, false, false, false, false, true]);
  });
});
