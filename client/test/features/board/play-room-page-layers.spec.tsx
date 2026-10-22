import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const CAIDO = {
  id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  name: 'Caído',
  tone: 'harm',
  icon: 'skull',
  look: null,
} as const;

describe('play room: layers', () => {
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
      { kind: 'board', state: vharnBoard({ tokens: [lyra(), kael()] }) },
    );
    await act(() => Promise.resolve());
  });

  it('with Objetos active (key 2), "Novo token" creates the token on the objects layer', async () => {
    await userEvent.keyboard('2');
    expect(screen.getByRole('button', { name: 'Objetos (2)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Novo token' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo token' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Baú');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar token' }));
    expect(deps.boardCommands.sentAs('createToken')).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ name: 'Baú', layer: 'objects' }),
      }),
    ]);
  });

  it('a marquee over Lyra and Kael says "2 selecionados" in the panel', () => {
    deps.boardRenderers
      .latest()
      .emit({ kind: 'tokensMarqueed', tokenIds: [LYRA_ID, KAEL_ID], additive: false });
    expect(screen.getByText('2 selecionados')).not.toBeNull();
  });

  it('a right click on Kael opens his menu and Fundo moves him there', async () => {
    deps.boardRenderers
      .latest()
      .emit({ kind: 'tokenMenuRequested', tokenId: KAEL_ID, x: 200, y: 120 });
    const menu = await screen.findByRole('menu', { name: 'Ações de Kael' });
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Fundo' }));
    expect(deps.boardCommands.sentAs('setTokenLayer').map(({ fields }) => fields)).toEqual([
      { tokenIds: [KAEL_ID], layer: 'background' },
    ]);
  });

  it('"Aplicar condição…" on Kael with Lyra and Kael selected puts "Caído" on both', async () => {
    deps.tableSessionApi.emit({
      kind: 'board',
      state: vharnBoard({ tokens: [lyra(), kael()], conditionDefinitions: [CAIDO] }),
    });
    const renderer = deps.boardRenderers.latest();
    renderer.emit({ kind: 'tokensMarqueed', tokenIds: [LYRA_ID, KAEL_ID], additive: false });
    renderer.emit({ kind: 'tokenMenuRequested', tokenId: KAEL_ID, x: 200, y: 120 });
    const menu = await screen.findByRole('menu', { name: 'Ações de Kael' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Aplicar condição…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aplicar condição' });
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Condição' }), 'Caído');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }));
    expect(deps.boardCommands.sentAs('applyConditions').map(({ fields }) => fields)).toEqual([
      { tokenIds: [LYRA_ID, KAEL_ID], conditionId: CAIDO.id, rounds: 0 },
    ]);
    expect(screen.queryByRole('dialog', { name: 'Aplicar condição' })).toBeNull();
  });

  it('the master is offered the layer menu on the board', () => {
    expect(deps.boardRenderers.latest().lastView?.layerMenu).toBe(true);
  });
});
