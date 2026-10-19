import type { CombatDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  KAEL_COMBATANT,
  KAEL_ID,
  eventAt,
  kael,
  lyra,
  soloCombatant,
  vharnBoard,
  vharnCombat,
  vharnState,
} from '../../support/table-session-fixtures';

const INIMIGOS = 'c9a8b7c6-d5e4-4f3a-8b2c-1d0e9f8a7b6c';
const GOBLINS = [
  lyra({ id: 'goblin-1', name: 'Goblin', col: 8, row: 5 }),
  lyra({ id: 'goblin-2', name: 'Goblin', col: 9, row: 5 }),
];

function groupCombat(overrides: Partial<CombatDto> = {}): CombatDto {
  return vharnCombat({
    round: 2,
    currentCombatantId: INIMIGOS,
    combatants: [
      {
        ...soloCombatant(INIMIGOS, 'goblin-1', 15, 0),
        name: 'Inimigos',
        tokenIds: ['goblin-1', 'goblin-2'],
      },
      soloCombatant(KAEL_COMBATANT, KAEL_ID, 12, 1),
    ],
    ...overrides,
  });
}

describe('play room: a grouped entry on turn', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    const router = createMemoryRouter(buildRoutes(deps), {
      initialEntries: [`/campaigns/${VHARN.id}/table`],
    });
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    deps.tableSessionApi.emit(
      { kind: 'state', state: vharnState() },
      { kind: 'status', status: 'live' },
    );
  });

  async function fighting(combat: CombatDto): Promise<void> {
    deps.tableSessionApi.emit({
      kind: 'board',
      state: vharnBoard({ tokens: [...GOBLINS, kael()], combat }),
    });
    await act(() => Promise.resolve());
  }

  it('the top bar reads "Rodada 2 · Vez de Inimigos"', async () => {
    await fighting(groupCombat());

    const header = screen.getByRole('region', { name: 'Topo da sala' });
    expect(within(header).getByText('Rodada 2 · Vez de Inimigos')).toBeInTheDocument();
  });

  it('both goblins of the entry on turn wear the ring, and Kael does not', async () => {
    await fighting(groupCombat());

    const views = deps.boardRenderers.latest().lastView?.tokens ?? [];
    expect(views.map(({ id, onTurn }) => [id, onTurn])).toEqual([
      ['goblin-1', true],
      ['goblin-2', true],
      [KAEL_ID, false],
    ]);
  });

  it('a turn that moves to Inimigos says "Vez de Inimigos." on the status line', async () => {
    await fighting(groupCombat({ currentCombatantId: KAEL_COMBATANT }));

    deps.tableSessionApi.emit({
      kind: 'boardEvent',
      event: eventAt(5, {
        type: 'combatTurnChanged',
        payload: { combat: groupCombat(), conditionChanges: [] },
      }),
    });

    expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
      'Vez de Inimigos.',
    );
  });
});
