import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cell } from '@lorkarium/game-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { square } from '../../support/drawing-fixtures';
import { BIA_CONE_ID, biaCone } from '../../support/effect-area-fixtures';
import {
  BIA_AT_TABLE,
  LYRA_ID,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const NEW_AREA_ID = 'c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
const CONE = { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' } as const;

describe('play room: areas of effect', () => {
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
      {
        kind: 'board',
        state: vharnBoard({ tokens: [lyra()], drawings: [square()], effectAreas: [biaCone()] }),
      },
    );
    await act(() => Promise.resolve());
  });

  function renderer() {
    return deps.boardRenderers.latest();
  }

  describe('the area tool', () => {
    it('M turns on "Área de efeito (M)", opens the style panel and clears the selection', async () => {
      renderer().emit({ kind: 'tokenPicked', tokenId: LYRA_ID, additive: false });

      await userEvent.keyboard('m');

      expect(screen.getByRole('button', { name: 'Área de efeito (M)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('region', { name: 'Estilo da área' })).toBeInTheDocument();
      expect(renderer().lastView?.tokens.find(({ id }) => id === LYRA_ID)?.selected).toBe(false);
      expect(renderer().lastView?.effectAreaSketch).toMatchObject({
        style: { kind: 'circle', color: 'ember' },
      });
    });

    it('the master on the Objects layer is put back on Tokens by the area tool', async () => {
      await userEvent.keyboard('2');
      await userEvent.keyboard('m');

      expect(screen.getByRole('button', { name: 'Tokens (1)' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('an area released on the board sends one createEffectAreas with its shape', async () => {
      await userEvent.keyboard('m');

      renderer().emit({ kind: 'effectAreaSketched', shape: CONE });

      expect(deps.boardCommands.sentAs('createEffectAreas').map(({ fields }) => fields)).toEqual([
        { effectAreas: [CONE] },
      ]);
    });

    it('Ctrl+Z after creating an area deletes it, expecting the shape it was created with', async () => {
      deps.boardCommands.answerWith({ ok: true, version: 5, createdIds: [NEW_AREA_ID] });
      await userEvent.keyboard('m');
      renderer().emit({ kind: 'effectAreaSketched', shape: CONE });
      await waitFor(() => expect(deps.boardCommands.sentAs('createEffectAreas')).toHaveLength(1));
      await act(() => Promise.resolve());

      await userEvent.keyboard('{Control>}z{/Control}');

      await waitFor(() =>
        expect(deps.boardCommands.sentAs('deleteEffectAreas')[0]?.fields).toEqual({
          effectAreaIds: [NEW_AREA_ID],
          expect: [{ effectAreaId: NEW_AREA_ID, shape: CONE }],
        }),
      );
    });
  });

  describe('a player and the area she made', () => {
    beforeEach(async () => {
      const viewer = { userId: BIA_AT_TABLE.userId, role: 'player' } as const;
      deps.tableSessionApi.emit({
        kind: 'board',
        state: vharnBoard({ viewer, version: 5, tokens: [lyra()], effectAreas: [biaCone()] }),
      });
      await act(() => Promise.resolve());
    });

    it('her own cone can be taken on the board', () => {
      expect(renderer().lastView?.effectAreas[0]?.pickable).toBe(true);
    });

    it('with the area tool on, a click on her cone selects it and Delete deletes it', async () => {
      screen.getByRole('application').focus();
      await userEvent.keyboard('m');
      renderer().emit({ kind: 'effectAreaPicked', effectAreaId: BIA_CONE_ID, additive: false });

      expect(renderer().lastView?.effectAreas[0]?.selected).toBe(true);
      await userEvent.keyboard('{Delete}');

      expect(deps.boardCommands.sentAs('deleteEffectAreas')[0]?.fields).toMatchObject({
        effectAreaIds: [BIA_CONE_ID],
      });
    });

    it('Delete with her cone selected deletes it in one command', async () => {
      renderer().emit({ kind: 'effectAreaPicked', effectAreaId: BIA_CONE_ID, additive: false });
      screen.getByRole('application').focus();

      await userEvent.keyboard('{Delete}');

      expect(deps.boardCommands.sentAs('deleteEffectAreas')[0]?.fields).toMatchObject({
        effectAreaIds: [BIA_CONE_ID],
      });
    });
  });

  describe('selecting and deleting areas', () => {
    it('a click on her cone selects it on the board', () => {
      renderer().emit({ kind: 'effectAreaPicked', effectAreaId: BIA_CONE_ID, additive: false });

      expect(renderer().lastView?.effectAreas[0]?.selected).toBe(true);
    });

    it('Delete on the board deletes the selected area in one command', async () => {
      renderer().emit({ kind: 'effectAreaPicked', effectAreaId: BIA_CONE_ID, additive: false });
      screen.getByRole('application').focus();

      await userEvent.keyboard('{Delete}');

      expect(deps.boardCommands.sentAs('deleteEffectAreas')[0]?.fields).toMatchObject({
        effectAreaIds: [BIA_CONE_ID],
      });
    });

    it('dropping the cone with the square selected moves both, in one command each', async () => {
      renderer().emit({
        kind: 'drawingsDropped',
        anchorId: BIA_CONE_ID,
        drawingIds: [],
        effectAreaIds: [BIA_CONE_ID],
        dx: 1.4,
        dy: -0.6,
      });

      await waitFor(() =>
        expect(deps.boardCommands.sentAs('reshapeEffectAreas')[0]?.fields).toEqual({
          reshapes: [{ effectAreaId: BIA_CONE_ID, shape: { ...CONE, x: 7, y: 5 } }],
        }),
      );
    });
  });

  describe('copy and paste', () => {
    it('Ctrl+C with her cone selected copies it, and Ctrl+V under the cursor pastes it there', async () => {
      renderer().emit({ kind: 'effectAreaPicked', effectAreaId: BIA_CONE_ID, additive: false });

      await userEvent.keyboard('{Control>}c{/Control}');
      expect(screen.getByRole('status', { name: 'Status do tabuleiro' })).toHaveTextContent(
        '1 item copiado.',
      );
      renderer().emit({ kind: 'pointerHovered', cell: cell(10, 6) });
      await userEvent.keyboard('{Control>}v{/Control}');

      await waitFor(() =>
        expect(deps.boardCommands.sentAs('createEffectAreas')[0]?.fields).toEqual({
          effectAreas: [{ ...CONE, x: 10, y: 6 }],
        }),
      );
    });
  });

  it('the confirmed areas are drawn on the board and read in the summary', () => {
    expect(renderer().lastView?.effectAreas.map(({ id }) => id)).toEqual([BIA_CONE_ID]);
    expect(screen.getByRole('list', { name: 'Áreas na cena', hidden: true })).toHaveTextContent(
      'Cone diagonal, Brasa, 3 casas · 4,5 m, de Bia, coluna 6, linha 6',
    );
  });
});
