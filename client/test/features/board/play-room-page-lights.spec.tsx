import type { LightDto } from '@lorkarium/contracts';
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
  return openRoomWith(testDependencies(), asPlayer);
}

function pick(deps: TestDependencies, lightId: string, additive: boolean): void {
  act(() => deps.boardRenderers.latest().emit({ kind: 'lightPicked', lightId, additive }));
}

async function openRoomWith(
  deps: TestDependencies,
  asPlayer = false,
  lights: readonly LightDto[] = [corridorTorch(), brazier()],
): Promise<TestDependencies> {
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
      state: vharnBoard({ lights: [...lights], ...(viewer && { viewer }) }),
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

  it('bright until "9" m in the panel, dim until 12 m kept, and a click send createLights with 6 + 2 cells', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('l');
    const bright = screen.getByLabelText('Plena até (m)');
    await userEvent.clear(bright);
    await userEvent.type(bright, '9');

    deps.boardRenderers.latest().emit({ kind: 'lightPlaced', x: 5.5, y: 3 });

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
        { lights: [{ x: 5.5, y: 3, bright: 6, dim: 2, color: null, facing: 0, angle: 360 }] },
      ]),
    );
  });
});

describe('play room: the color of the next light', () => {
  it('Ana chooses "Infernal" in the panel, clicks the board and sends an infernal light, remembered', async () => {
    const deps = await openRoom();
    await userEvent.keyboard('l');

    await userEvent.click(screen.getByRole('radio', { name: 'Infernal' }));
    deps.boardRenderers.latest().emit({ kind: 'lightPlaced', x: 5.5, y: 3 });

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
        { lights: [{ x: 5.5, y: 3, bright: 4, dim: 4, color: 'infernal', facing: 0, angle: 360 }] },
      ]),
    );
    expect(deps.lightColorStorage.values.get('lorkarium.lightColor')).toBe('infernal');
  });

  it('a room opened with "Infernal" remembered shows it checked', async () => {
    const deps = testDependencies();
    deps.lightColor.getState().setColor('infernal');

    await openRoomWith(deps);
    await userEvent.keyboard('l');

    expect(screen.getByRole('radio', { name: 'Infernal' })).toHaveAttribute('aria-checked', 'true');
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

  it('picking the brazier (bright 2, dim 6) shows bright until "3" and dim until "12" m in the panel', async () => {
    await brazierPicked();

    const panel = screen.getByRole('region', { name: 'Luz' });
    expect(within(panel).getByLabelText('Plena até (m)')).toHaveValue('3');
    expect(within(panel).getByLabelText('Penumbra até (m)')).toHaveValue('12');
  });

  it('bright until "9" m with the brazier picked (dim until 12 m) sends one setLightRanges of 6 + 2 on leaving the field', async () => {
    const deps = await brazierPicked();
    const bright = screen.getByLabelText('Plena até (m)');
    await userEvent.clear(bright);
    await userEvent.type(bright, '9');
    await userEvent.tab();

    await waitFor(() => expect(deps.boardCommands.sentAs('setLightRanges')).toHaveLength(1));
    await waitFor(() =>
      expect(deps.boardCommands.sentAs('setLightRanges').at(-1)?.fields).toEqual({
        changes: [{ lightId: BRAZIER_ID, bright: 6, dim: 2, expect: { bright: 2, dim: 6 } }],
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
        { lights: [{ x: 12, y: 8, bright: 2, dim: 6, color: null, facing: 0, angle: 360 }] },
      ]),
    );
  });

  it('picking the neutral brazier checks "Neutra"', async () => {
    await brazierPicked();

    expect(screen.getByRole('radio', { name: 'Neutra' })).toHaveAttribute('aria-checked', 'true');
  });

  it('picking the brazier and a fire torch checks no color', async () => {
    const deps = await openRoomWith(testDependencies(), false, [
      corridorTorch({ color: 'fire' }),
      brazier(),
    ]);
    await userEvent.keyboard('l');
    pick(deps, CORRIDOR_TORCH_ID, false);
    pick(deps, BRAZIER_ID, true);

    const group = screen.getByRole('radiogroup', { name: 'Cor da luz' });
    expect(within(group).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
  });

  it('"Lua" with both picked sends one setLightColors of the two, and Ctrl+Z sends them back', async () => {
    const deps = await openRoomWith(testDependencies(), false, [
      corridorTorch({ color: 'fire' }),
      brazier(),
    ]);
    await userEvent.keyboard('l');
    pick(deps, CORRIDOR_TORCH_ID, false);
    pick(deps, BRAZIER_ID, true);

    await userEvent.click(screen.getByRole('radio', { name: 'Lua' }));
    await waitFor(() => expect(deps.boardCommands.sentAs('setLightColors')).toHaveLength(1));
    screen.getByRole('application').focus();
    await userEvent.keyboard('{Control>}z{/Control}');

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('setLightColors').map(({ fields }) => fields)).toEqual([
        {
          changes: [
            { lightId: CORRIDOR_TORCH_ID, color: 'moon', expect: { color: 'fire' } },
            { lightId: BRAZIER_ID, color: 'moon', expect: { color: null } },
          ],
        },
        {
          changes: [
            { lightId: CORRIDOR_TORCH_ID, color: 'fire', expect: { color: 'moon' } },
            { lightId: BRAZIER_ID, color: null, expect: { color: 'moon' } },
          ],
        },
      ]),
    );
  });

  it('"60" in "Abertura (°)" with both picked sends one setLightCones on leaving, and Ctrl+Z sends them back', async () => {
    const deps = await openRoomWith(testDependencies(), false, [corridorTorch(), brazier()]);
    await userEvent.keyboard('l');
    pick(deps, CORRIDOR_TORCH_ID, false);
    pick(deps, BRAZIER_ID, true);
    const field = screen.getByLabelText('Abertura (°)');

    await userEvent.clear(field);
    await userEvent.type(field, '60');
    await userEvent.tab();
    await waitFor(() => expect(deps.boardCommands.sentAs('setLightCones')).toHaveLength(1));
    screen.getByRole('application').focus();
    await userEvent.keyboard('{Control>}z{/Control}');

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('setLightCones').map(({ fields }) => fields)).toEqual([
        {
          changes: [
            { lightId: CORRIDOR_TORCH_ID, facing: 0, angle: 60, expect: { facing: 0, angle: 360 } },
            { lightId: BRAZIER_ID, facing: 0, angle: 60, expect: { facing: 0, angle: 360 } },
          ],
        },
        {
          changes: [
            { lightId: CORRIDOR_TORCH_ID, facing: 0, angle: 360, expect: { facing: 0, angle: 60 } },
            { lightId: BRAZIER_ID, facing: 0, angle: 360, expect: { facing: 0, angle: 60 } },
          ],
        },
      ]),
    );
  });

  it('changing the tool drops the lights picked', async () => {
    await brazierPicked();

    await userEvent.keyboard('v');
    await userEvent.keyboard('l');

    expect(screen.getByLabelText('Plena até (m)')).toHaveValue('6');
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

describe('play room: aiming a spotlight', () => {
  it('Ana picks the spotlight of 60°, the handle aims it at 180 in one setLightCones, and Ctrl+Z points it back', async () => {
    const deps = await openRoomWith(testDependencies(), false, [
      corridorTorch({ facing: 0, angle: 60 }),
    ]);
    await userEvent.keyboard('l');
    pick(deps, CORRIDOR_TORCH_ID, false);

    act(() =>
      deps.boardRenderers
        .latest()
        .emit({ kind: 'lightAimed', lightId: CORRIDOR_TORCH_ID, facing: 180 }),
    );
    await waitFor(() => expect(deps.boardCommands.sentAs('setLightCones')).toHaveLength(1));
    screen.getByRole('application').focus();
    await userEvent.keyboard('{Control>}z{/Control}');

    await waitFor(() =>
      expect(deps.boardCommands.sentAs('setLightCones').map(({ fields }) => fields)).toEqual([
        {
          changes: [
            {
              lightId: CORRIDOR_TORCH_ID,
              facing: 180,
              angle: 60,
              expect: { facing: 0, angle: 60 },
            },
          ],
        },
        {
          changes: [
            {
              lightId: CORRIDOR_TORCH_ID,
              facing: 0,
              angle: 60,
              expect: { facing: 180, angle: 60 },
            },
          ],
        },
      ]),
    );
  });
});
