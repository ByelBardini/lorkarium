import type { BoardStateDto, ConditionDefinitionDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  BIA_AT_TABLE,
  KAEL_ID,
  activeCondition,
  eventAt,
  kael,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const ENVENENADO: ConditionDefinitionDto = {
  id: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b',
  name: 'Envenenado',
  tone: 'harm',
  icon: 'skull',
  color: null,
  look: null,
  description: 'Desvantagem em ataques.',
  maxStacks: null,
};

type Seat = 'master' | 'player' | 'spectator';

async function openRoom(
  seat: Seat = 'master',
  overrides: Partial<BoardStateDto> = {},
): Promise<TestDependencies> {
  const deps = testDependencies();
  deps.authApi.answerMeWith(ANA);
  if (seat !== 'master') {
    deps.campaignsApi.answer('detail', { ok: true, value: detailOf({ ...VHARN, myRole: seat }) });
  }
  const router = createMemoryRouter(buildRoutes(deps), {
    initialEntries: [`/campaigns/${VHARN.id}/table`],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  const viewer = seat === 'master' ? {} : { viewer: { userId: BIA_AT_TABLE.userId, role: seat } };
  deps.tableSessionApi.emit(
    { kind: 'state', state: vharnState() },
    { kind: 'status', status: 'live' },
    {
      kind: 'board',
      state: vharnBoard({
        tokens: [kael({ canControl: false })],
        conditionDefinitions: [ENVENENADO],
        ...viewer,
        ...overrides,
      }),
    },
  );
  await act(() => Promise.resolve());
  return deps;
}

function panel(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Aplicar condição' });
}

function roundsField(): HTMLElement {
  const open = panel();
  if (!open) throw new Error('Expected the "Aplicar condição" panel open, found none');
  return within(open).getByLabelText('Rodadas');
}

function statusLine(): HTMLElement {
  return screen.getByRole('status', { name: 'Status do tabuleiro' });
}

function stamp(deps: TestDependencies, removes = false): void {
  act(() =>
    deps.boardRenderers.latest().emit({ kind: 'conditionStamped', tokenId: KAEL_ID, removes }),
  );
}

async function pickPoisonFor2Rounds(): Promise<void> {
  await userEvent.click(screen.getByRole('option', { name: 'Envenenado' }));
  await userEvent.type(roundsField(), '2');
}

describe('play room: the condition tool', () => {
  it('C turns "Condição (C)" on and opens the "Aplicar condição" panel', async () => {
    await openRoom();
    await userEvent.keyboard('c');
    expect(screen.getByRole('button', { name: 'Condição (C)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(panel()).toBeInTheDocument();
    expect(statusLine()).toHaveTextContent('Escolha uma condição no painel.');
  });

  it('a player picks Envenenado + 2 and a click on Kael (not theirs) sends one condition:apply', async () => {
    const deps = await openRoom('player');
    await userEvent.keyboard('c');
    await pickPoisonFor2Rounds();
    expect(statusLine()).toHaveTextContent(
      'Clique num token para aplicar Envenenado (2 rodadas); Shift+clique tira.',
    );
    stamp(deps);
    await act(() => Promise.resolve());
    expect(deps.boardCommands.sentAs('applyCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, conditionId: ENVENENADO.id, rounds: 2 },
    ]);
  });

  it('Shift+click on Kael with Envenenado sends condition:remove with the active one', async () => {
    const poisoned = activeCondition({
      id: 'ac-1',
      conditionId: ENVENENADO.id,
      name: 'Envenenado',
    });
    const deps = await openRoom('master', { tokens: [kael({ conditions: [poisoned] })] });
    await userEvent.keyboard('c');
    await pickPoisonFor2Rounds();
    stamp(deps, true);
    await act(() => Promise.resolve());
    expect(deps.boardCommands.sentAs('removeCondition').map(({ fields }) => fields)).toEqual([
      { tokenId: KAEL_ID, activeConditionId: 'ac-1' },
    ]);
    expect(deps.boardCommands.sentAs('applyCondition')).toEqual([]);
  });

  it('rounds "abc" mark the field and a click sends nothing', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('c');
    await userEvent.click(screen.getByRole('option', { name: 'Envenenado' }));
    await userEvent.type(roundsField(), 'abc');
    stamp(deps);
    await act(() => Promise.resolve());
    expect(roundsField()).toHaveAttribute('aria-invalid', 'true');
    expect(deps.boardCommands.sent).toEqual([]);
    expect(statusLine()).toHaveTextContent('Rodadas vão de 0 a 99.');
  });

  it('with no condition picked a click sends nothing and says "Escolha uma condição."', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('c');
    stamp(deps);
    expect(deps.boardCommands.sent).toEqual([]);
    expect(statusLine()).toHaveTextContent('Escolha uma condição.');
  });

  it('switching tools and back keeps the pick and the rounds', async () => {
    await openRoom();
    await userEvent.keyboard('c');
    await pickPoisonFor2Rounds();
    await userEvent.click(screen.getByRole('button', { name: 'Selecionar (V)' }));
    expect(panel()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Condição (C)' }));
    expect(screen.getByRole('option', { name: 'Envenenado' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(roundsField()).toHaveValue('2');
  });

  it('the picked condition deleted from the list is unpicked', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('c');
    await userEvent.click(screen.getByRole('option', { name: 'Envenenado' }));
    deps.tableSessionApi.emit({
      kind: 'boardEvent',
      event: eventAt(5, {
        type: 'conditionDefinitionDeleted',
        payload: { conditionId: ENVENENADO.id },
      }),
    });
    await act(() => Promise.resolve());
    stamp(deps);
    expect(deps.boardCommands.sent).toEqual([]);
    expect(panel()).toHaveTextContent('A mesa não tem condições.');
  });

  it('focus mode hides the panel and the tool stays on', async () => {
    await openRoom();
    await userEvent.keyboard('c');
    await userEvent.keyboard('f');
    expect(panel()).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(panel()).toBeInTheDocument();
  });

  it('a spectator has no "Condição (C)" and C opens nothing', async () => {
    await openRoom('spectator');
    await userEvent.keyboard('c');
    expect(screen.queryByRole('button', { name: 'Condição (C)' })).toBeNull();
    expect(panel()).toBeNull();
    expect(screen.getByRole('button', { name: 'Selecionar (V)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
