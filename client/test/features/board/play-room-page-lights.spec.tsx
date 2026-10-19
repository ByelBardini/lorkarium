import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  BRAZIER_ID,
  CORRIDOR_TORCH_ID,
  brazier,
  corridorTorch,
} from '../../support/light-fixtures';
import { BIA_AT_TABLE, vharnBoard, vharnState } from '../../support/table-session-fixtures';

async function openRoom(asPlayer = false): Promise<TestDependencies> {
  const deps = testDependencies();
  deps.authApi.answerMeWith(ANA);
  if (asPlayer) {
    deps.campaignsApi.answer('detail', {
      ok: true,
      value: detailOf({ ...VHARN, myRole: 'player' }),
    });
  }
  const router = createMemoryRouter(buildRoutes(deps), {
    initialEntries: [`/campaigns/${VHARN.id}/table`],
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
  const viewer = asPlayer ? { userId: BIA_AT_TABLE.userId, role: 'player' as const } : undefined;
  deps.tableSessionApi.emit(
    { kind: 'state', state: vharnState() },
    { kind: 'status', status: 'live' },
    {
      kind: 'board',
      state: vharnBoard({ lights: [corridorTorch(), brazier()], ...(viewer && { viewer }) }),
    },
  );
  await act(() => Promise.resolve());
  return deps;
}

describe('play room: the lights tool', () => {
  it('the master presses L: "Luzes (L)" turns on, the "Luz" panel opens and the line says how', async () => {
    await openRoom();

    await userEvent.keyboard('l');

    expect(screen.getByRole('button', { name: 'Luzes (L)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Luz' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
      'Clique para pôr uma luz; Shift encaixa na meia casa.',
    );
  });

  it('a player has no "Luzes" button, and L does nothing', async () => {
    await openRoom(true);

    await userEvent.keyboard('l');

    expect(screen.queryByRole('button', { name: 'Luzes (L)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Luz' })).not.toBeInTheDocument();
  });

  it('"9" m of bright light in the panel and a click send createLights with bright 6 cells', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('l');
    const bright = screen.getByLabelText('Plena (m)');
    await userEvent.clear(bright);
    await userEvent.type(bright, '9');

    deps.boardRenderers.latest().emit({ kind: 'lightPlaced', x: 5.5, y: 3 });

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
        { lights: [{ x: 5.5, y: 3, bright: 6, dim: 4 }] },
      ]),
    );
  });
});

describe('play room: editing map lights', () => {
  async function brazierPicked(): Promise<TestDependencies> {
    const deps = await openRoom();
    await userEvent.keyboard('l');
    act(() =>
      deps.boardRenderers
        .latest()
        .emit({ kind: 'lightPicked', lightId: BRAZIER_ID, additive: false }),
    );
    return deps;
  }

  it('picking the brazier (bright 2, dim 6) shows "3" and "9" m in the panel', async () => {
    await brazierPicked();

    const panel = screen.getByRole('region', { name: 'Luz' });
    expect(within(panel).getByLabelText('Plena (m)')).toHaveValue('3');
    expect(within(panel).getByLabelText('Penumbra (m)')).toHaveValue('9');
  });

  it('"9" m of bright light with the brazier picked sends one setLightRanges for it on leaving the field', async () => {
    const deps = await brazierPicked();
    const bright = screen.getByLabelText('Plena (m)');
    await userEvent.clear(bright);
    await userEvent.type(bright, '9');
    await userEvent.tab();

    await waitFor(() => expect(deps.boardCommands.sentAs('setLightRanges')).toHaveLength(1));
    await waitFor(() =>
      expect(deps.boardCommands.sentAs('setLightRanges').at(-1)?.fields).toEqual({
        changes: [{ lightId: BRAZIER_ID, bright: 6, dim: 6, expect: { bright: 2, dim: 6 } }],
      }),
    );
  });

  it('Delete sends deleteLights for the brazier, and Ctrl+Z puts it back', async () => {
    const deps = await brazierPicked();
    screen.getByRole('application').focus();

    await userEvent.keyboard('{Delete}');
    await waitFor(() => expect(deps.boardCommands.sentAs('deleteLights')).toHaveLength(1));
    await userEvent.keyboard('{Control>}z{/Control}');

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
        { lights: [{ x: 12, y: 8, bright: 2, dim: 6 }] },
      ]),
    );
  });

  it('changing the tool drops the lights picked', async () => {
    await brazierPicked();

    await userEvent.keyboard('v');
    await userEvent.keyboard('l');

    expect(screen.getByLabelText('Plena (m)')).toHaveValue('6');
  });
});

describe('play room: lighting and putting out map lights', () => {
  function menuOnTheTorch(deps: TestDependencies): void {
    act(() =>
      deps.boardRenderers
        .latest()
        .emit({ kind: 'lightMenuRequested', lightId: CORRIDOR_TORCH_ID, x: 200, y: 120 }),
    );
  }

  it('the menu of Ana on the lit torch has "Apagar", which puts it out', async () => {
    const deps = await openRoom();
    menuOnTheTorch(deps);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Apagar' }));

    expect(deps.boardCommands.sentAs('setLightsLit').map(({ fields }) => fields)).toEqual([
      { lightIds: [CORRIDOR_TORCH_ID], lit: false },
    ]);
  });

  it('"Excluir luz" in the menu deletes the torch', async () => {
    const deps = await openRoom();
    menuOnTheTorch(deps);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Excluir luz' }));

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('deleteLights').map(({ fields }) => fields)).toEqual([
        { lightIds: [CORRIDOR_TORCH_ID], expect: [{ lightId: CORRIDOR_TORCH_ID, x: 5, y: 5 }] },
      ]),
    );
  });

  it('a player gets no light menu', async () => {
    const deps = await openRoom(true);
    menuOnTheTorch(deps);

    expect(screen.queryByRole('menuitem', { name: 'Apagar' })).not.toBeInTheDocument();
  });

  it('"Apagar" in the panel puts out the brazier picked', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('l');
    act(() =>
      deps.boardRenderers
        .latest()
        .emit({ kind: 'lightPicked', lightId: BRAZIER_ID, additive: false }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));

    expect(deps.boardCommands.sentAs('setLightsLit').map(({ fields }) => fields)).toEqual([
      { lightIds: [BRAZIER_ID], lit: false },
    ]);
  });

  it('Ctrl+Z after putting out a torch undoes the action before, not the putting out', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('l');
    deps.boardCommands.answerWith({ ok: true, version: 2, createdIds: [BRAZIER_ID] });
    deps.boardRenderers.latest().emit({ kind: 'lightPlaced', x: 2, y: 2 });
    await waitFor(() => expect(deps.boardCommands.sentAs('createLights')).toHaveLength(1));
    menuOnTheTorch(deps);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Apagar' }));
    screen.getByRole('application').focus();

    await userEvent.keyboard('{Control>}z{/Control}');

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('deleteLights').map(({ fields }) => fields)).toEqual([
        { lightIds: [BRAZIER_ID], expect: [{ lightId: BRAZIER_ID, x: 2, y: 2 }] },
      ]),
    );
    expect(deps.boardCommands.sentAs('setLightsLit')).toHaveLength(1);
  });
});
