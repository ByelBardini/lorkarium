import { PLAN_LIMITS, type SavedRollDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SavedRollsList } from '@/features/dice/saved-rolls-list';
import { useSavedRolls } from '@/features/dice/use-saved-rolls';
import { AccountPlanContext } from '@/features/plans/use-plan-limits';
import type { AccountLimits } from '@/stores/session-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { ACERTO, BENCAO } from '../../support/dice-fixtures';
import { CREATED_FOLDER_ID, SavedRollsApiFake } from '../../support/saved-rolls-api-fake';
import { onTablePlan } from '../../support/table-plan';

const ROLL_LOCKED =
  'Esta rolagem salva passou do limite do plano Grátis (3) e está só leitura: rolar, mover para pasta e excluir seguem livres. Apague uma rolagem mais antiga ou suba de plano.';

let api: SavedRollsApiFake;

beforeEach(() => {
  api = new SavedRollsApiFake();
  api.folders.set(VHARN.id, [{ id: CREATED_FOLDER_ID, name: 'Combate' }]);
});

function ListHarness() {
  const saved = useSavedRolls(VHARN.id, api);
  return (
    <SavedRollsList
      saved={saved}
      onRoll={() => {}}
      rollDisabled={false}
      onAddToTray={() => {}}
      fitsInTray={() => true}
    />
  );
}

async function showRolls(
  rolls: readonly SavedRollDto[],
  account: AccountLimits | null = null,
): Promise<HTMLElement> {
  api.rolls.set(VHARN.id, rolls);
  render(
    <AccountPlanContext value={account}>
      {onTablePlan(PLAN_LIMITS.free, <ListHarness />)}
    </AccountPlanContext>,
  );
  await screen.findByRole('button', { name: 'Rolar Bênção' });
  return screen.getByRole('list', { name: 'Rolagens salvas' });
}

function tagOf(list: HTMLElement, name: string): HTMLElement {
  const tag = within(list)
    .getByRole('button', { name: `Rolar ${name}` })
    .closest('li');
  if (!tag) throw new Error(`no tag for ${name}: expected an <li> around its button`);
  return tag;
}

describe('SavedRollsList of a roll past the plan ceiling', () => {
  it('a planLocked roll carries the lock named "Só leitura" with the sentence in its tooltip', async () => {
    const list = await showRolls([ACERTO, { ...BENCAO, planLocked: true }]);
    const lock = within(tagOf(list, 'Bênção')).getByRole('img', { name: 'Só leitura' });
    expect(lock.parentElement).toHaveAttribute('title', ROLL_LOCKED);
  });

  it('for an Apoiador at a Grátis table the lock names her own plan and its 15', async () => {
    const apoiador: AccountLimits = {
      plan: 'apoiador',
      limits: PLAN_LIMITS.apoiador,
      customization: true,
    };
    const list = await showRolls([ACERTO, { ...BENCAO, planLocked: true }], apoiador);
    const lock = within(tagOf(list, 'Bênção')).getByRole('img', { name: 'Só leitura' });
    expect(lock.parentElement).toHaveAttribute(
      'title',
      'Esta rolagem salva passou do limite do plano Apoiador (15) e está só leitura: rolar, mover para pasta e excluir seguem livres. Apague uma rolagem mais antiga ou suba de plano.',
    );
  });

  it('rolling, adding, moving and deleting the locked roll stay on', async () => {
    const list = await showRolls([ACERTO, { ...BENCAO, planLocked: true }]);
    for (const name of [
      'Rolar Bênção',
      'Adicionar Bênção à rolagem',
      'Mover Bênção',
      'Apagar Bênção',
    ])
      expect(within(list).getByRole('button', { name })).toBeEnabled();
  });

  it('without planLocked no roll shows the lock', async () => {
    const list = await showRolls([ACERTO, BENCAO]);
    expect(within(list).queryByRole('img', { name: 'Só leitura' })).toBeNull();
  });
});
