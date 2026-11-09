import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapPoint } from '@lorkarium/game-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VHARN, detailOf } from '../../support/campaigns-api-fake';
import {
  CAPITAL_REGION_ID,
  TAVERNA_REGION_ID,
  mapRegion,
  pinRegion,
} from '../../support/library-map-fixtures';
import {
  A,
  B,
  C,
  type Deps,
  calls,
  chooseTool,
  clickMap,
  draftVertices,
  editing,
  frame,
  frameTheMapIn1000By600,
  newRegion,
  onTheMap,
  pressKey,
  screenPointOf,
  viewOf,
} from '../../support/map-editor-harness';
import { ANA_AT_TABLE } from '../../support/table-session-fixtures';

describe('the map editor', () => {
  frameTheMapIn1000By600();
  afterEach(() => vi.restoreAllMocks());

  describe('who gets in', () => {
    it('a player sees no way into the editor, on the map or on the card', async () => {
      await onTheMap([mapRegion()], detailOf(VHARN, { myRole: 'player' }));
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    });

    it('a spectator neither', async () => {
      await onTheMap([], detailOf(VHARN, { myRole: 'spectator' }));
      expect(screen.queryByRole('button', { name: 'Editar mapa' })).not.toBeInTheDocument();
    });

    it('a master demoted in the middle of the edit loses it', async () => {
      const deps = await editing();
      await chooseTool('Polígono');
      clickMap(deps, A);
      const table = deps.openTables.getState().tables.find((open) => open.campaignId === VHARN.id);
      act(() => table?.presence.setState({ members: [{ ...ANA_AT_TABLE, role: 'player' }] }));
      expect(screen.queryByRole('toolbar', { name: 'Editor do mapa' })).not.toBeInTheDocument();
      expect(draftVertices()).toBe(0);
    });

    it('"Editar lugar" on the card opens the editor on that place', async () => {
      await onTheMap([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      await userEvent.click(screen.getByRole('button', { name: 'Editar lugar' }));
      expect(screen.getByRole('toolbar', { name: 'Editor do mapa' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Dados de Capital' })).toBeInTheDocument();
    });

    it('"Mostrar a todos" stays beside it on the card', async () => {
      await onTheMap([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      expect(screen.getByRole('button', { name: 'Mostrar a todos' })).toBeInTheDocument();
    });

    it('"Concluir" leaves the editor', async () => {
      await editing();
      await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
      expect(screen.getByRole('button', { name: 'Editar mapa' })).toBeInTheDocument();
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });

    it('a drawing left behind is not there on coming back', async () => {
      const deps = await editing();
      await chooseTool('Polígono');
      clickMap(deps, A);
      await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
      await userEvent.click(screen.getByRole('button', { name: 'Editar mapa' }));
      expect(draftVertices()).toBe(0);
      expect(screen.getByRole('button', { name: 'Polígono' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('without a connection', () => {
    function goOffline(deps: Deps): void {
      act(() => deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' }));
    }

    it('the way in is off', async () => {
      const deps = await onTheMap([mapRegion()]);
      goOffline(deps);
      expect(screen.getByRole('button', { name: 'Editar mapa' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      expect(screen.getByRole('button', { name: 'Editar lugar' })).toBeDisabled();
    });

    it('a drawing stops taking clicks and its keys', async () => {
      const deps = await editing();
      await chooseTool('Polígono');
      clickMap(deps, A);
      goOffline(deps);
      clickMap(deps, B);
      await pressKey('Escape');
      expect(draftVertices()).toBe(1);
    });

    it('the tools are off, and the form too', async () => {
      const deps = await editing([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      goOffline(deps);
      expect(screen.getByRole('button', { name: 'Polígono' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Pino' })).toBeDisabled();
      expect(screen.getByLabelText('Nome')).toBeDisabled();
    });

    it('no handle is offered', async () => {
      const deps = await editing([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      goOffline(deps);
      expect(document.querySelector('[data-map-handle]')).toBeNull();
    });
  });

  describe('drawing a polygon', () => {
    it('clicks make the vertices and the click on the first closes it, in one POST', async () => {
      const deps = await editing();
      deps.libraryMapsApi.answer('createRegion', { ok: true, value: newRegion() });
      await chooseTool('Polígono');
      [A, B, C].forEach((point) => clickMap(deps, point));
      expect(draftVertices()).toBe(3);
      clickMap(deps, A);
      await screen.findByRole('button', { name: 'Novo lugar' });
      expect(calls(deps, 'createRegion')).toHaveLength(1);
      const input = calls(deps, 'createRegion')[0]?.args[2] as { geometry: unknown };
      const { geometry } = input as { geometry: { points: MapPoint[] } };
      geometry.points.forEach((point, at) => {
        expect(point.x).toBeCloseTo([A, B, C][at]?.x ?? NaN);
        expect(point.y).toBeCloseTo([A, B, C][at]?.y ?? NaN);
      });
    });

    it('the new place is shown and its form opens, with the draft gone', async () => {
      const deps = await editing();
      deps.libraryMapsApi.answer('createRegion', { ok: true, value: newRegion() });
      await chooseTool('Polígono');
      [A, B, C].forEach((point) => clickMap(deps, point));
      await pressKey('Enter');
      expect(
        await screen.findByRole('region', { name: 'Dados de Novo lugar' }),
      ).toBeInTheDocument();
      expect(draftVertices()).toBe(0);
    });

    it('Enter over the focused tool closes the polygon and does not restart it', async () => {
      const deps = await editing();
      deps.libraryMapsApi.answer('createRegion', { ok: true, value: newRegion() });
      await chooseTool('Polígono');
      [A, B, C].forEach((point) => clickMap(deps, point));
      expect(screen.getByRole('button', { name: 'Polígono' })).toHaveFocus();
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      await act(async () => {
        screen.getByRole('button', { name: 'Polígono' }).dispatchEvent(enter);
        await Promise.resolve();
      });
      expect(enter.defaultPrevented).toBe(true);
      expect(calls(deps, 'createRegion')).toHaveLength(1);
    });

    it('Esc undoes the last vertex and then cancels', async () => {
      const deps = await editing();
      await chooseTool('Polígono');
      [A, B].forEach((point) => clickMap(deps, point));
      await pressKey('Escape');
      expect(draftVertices()).toBe(1);
      await pressKey('Escape');
      expect(draftVertices()).toBe(0);
      expect(screen.getByRole('button', { name: 'Polígono' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await pressKey('Escape');
      expect(screen.getByRole('button', { name: 'Polígono' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('a double click adds one vertex', async () => {
      const deps = await editing();
      await chooseTool('Polígono');
      clickMap(deps, A);
      clickMap(deps, A);
      fireEvent.doubleClick(frame(), screenPointOf(deps, A));
      expect(draftVertices()).toBe(1);
    });

    it('a click outside the image is ignored', async () => {
      await editing();
      await chooseTool('Polígono');
      // The map is framed in the middle of 1000 × 600 at half its size: 50 px of nothing above.
      fireEvent.click(frame(), { clientX: 500, clientY: 10 });
      expect(draftVertices()).toBe(0);
    });

    it('a click over a place adds a vertex, and does not open the place', async () => {
      const deps = await editing([mapRegion()]);
      await chooseTool('Polígono');
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }), screenPointOf(deps, A));
      expect(draftVertices()).toBe(1);
      expect(viewOf(deps).getState().selectedRegionId).toBeNull();
    });

    it('a drag still moves the map and adds no vertex', async () => {
      const deps = await editing();
      await chooseTool('Polígono');
      const before = viewOf(deps).getState().camera;
      fireEvent.pointerDown(frame(), { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 100, clientY: 160 });
      fireEvent.pointerUp(frame(), { pointerId: 1 });
      fireEvent.click(frame(), { clientX: 400, clientY: 300 });
      expect(viewOf(deps).getState().camera).not.toEqual(before);
      expect(draftVertices()).toBe(0);
    });

    it('"Enquadrar mapa" is no vertex', async () => {
      await editing();
      await chooseTool('Polígono');
      // Over the image: only being a button keeps this click from being a point of the map.
      fireEvent.click(screen.getByRole('button', { name: 'Enquadrar mapa' }), {
        clientX: 500,
        clientY: 300,
      });
      expect(draftVertices()).toBe(0);
    });

    it('Enter typed in the search of places is not the polygon', async () => {
      const deps = await editing([mapRegion()]);
      await chooseTool('Polígono');
      [A, B, C].forEach((point) => clickMap(deps, point));
      await userEvent.click(screen.getByRole('button', { name: 'Lugares neste mapa' }));
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar lugar' }), 'x{Enter}');
      expect(calls(deps, 'createRegion')).toEqual([]);
    });

    it('no key does anything once the drawing is over', async () => {
      const deps = await editing();
      await pressKey('Enter');
      await pressKey('Escape');
      expect(calls(deps, 'createRegion')).toEqual([]);
      expect(screen.getByRole('toolbar', { name: 'Editor do mapa' })).toBeInTheDocument();
    });

    it('choosing a tool puts the open form away', async () => {
      const deps = await editing([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      await chooseTool('Polígono');
      expect(screen.queryByRole('region', { name: 'Dados de Capital' })).not.toBeInTheDocument();
      expect(viewOf(deps).getState().selectedRegionId).toBeNull();
    });

    it('a place chosen in the list while drawing shows no form', async () => {
      const deps = await editing([mapRegion()]);
      await chooseTool('Polígono');
      act(() => viewOf(deps).getState().focusRegion(CAPITAL_REGION_ID));
      expect(screen.queryByRole('region', { name: 'Dados de Capital' })).not.toBeInTheDocument();
    });
  });

  describe('a pin', () => {
    it('is one click, one POST', async () => {
      const deps = await editing();
      deps.libraryMapsApi.answer('createRegion', {
        ok: true,
        value: pinRegion({ name: 'Novo lugar' }),
      });
      await chooseTool('Pino');
      clickMap(deps, C);
      await screen.findByRole('region', { name: 'Dados de Novo lugar' });
      expect(calls(deps, 'createRegion')).toHaveLength(1);
      expect(viewOf(deps).getState().selectedRegionId).toBe(TAVERNA_REGION_ID);
    });
  });

  describe('a shape the server does not take', () => {
    it('regions_full says it with the text of its own', async () => {
      const deps = await editing();
      deps.libraryMapsApi.answer('createRegion', {
        ok: false,
        failure: { kind: 'regions_full' },
      });
      await chooseTool('Pino');
      clickMap(deps, C);
      expect(await screen.findByRole('alert')).toHaveTextContent(/já chegou a 300 lugares/);
    });

    it('three points on a line send nothing and say so', async () => {
      const deps = await editing();
      await chooseTool('Polígono');
      [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
      ].forEach((point) => clickMap(deps, point));
      await pressKey('Enter');
      expect(screen.getByRole('alert')).toHaveTextContent(/não forma uma área/);
      expect(calls(deps, 'createRegion')).toEqual([]);
    });
  });
});
