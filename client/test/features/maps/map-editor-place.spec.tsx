import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapPoint } from '@lorkarium/game-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapPolygonPoints } from '@/lib/map-viewport';
import {
  CAPITAL_REGION_ID,
  MUNDO_ID,
  REINO_ID,
  libraryMapDetail,
  libraryMapSummary,
  mapRegion,
  pinRegion,
} from '../../support/library-map-fixtures';
import { masterLibrary } from '../../support/library-fixtures';
import {
  CAPITAL_POINTS,
  type Deps,
  IMAGE,
  OFFLINE,
  calls,
  dragHandle,
  editing,
  frame,
  frameTheMapIn1000By600,
  handle,
  onTheMap,
  polygonOf,
  pressKey,
  viewOf,
} from '../../support/map-editor-harness';

describe('the map editor on a chosen place', () => {
  frameTheMapIn1000By600();
  afterEach(() => vi.restoreAllMocks());

  describe('moving a handle', () => {
    const MOVED_TO = { x: 0.05, y: 0.15 };

    async function selectedCapital(): Promise<Deps> {
      const deps = await editing([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      return deps;
    }

    function shownPoints(first: MapPoint): string {
      return mapPolygonPoints([first, CAPITAL_POINTS[1]!, CAPITAL_POINTS[2]!], IMAGE);
    }

    it('there is one handle per vertex of the selected place', async () => {
      await selectedCapital();
      expect(document.querySelectorAll('[data-map-handle]')).toHaveLength(3);
    });

    it('only the selected place has handles', async () => {
      await editing([mapRegion()]);
      expect(document.querySelector('[data-map-handle]')).toBeNull();
    });

    it('a pin has one', async () => {
      await editing([pinRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Taverna' }));
      expect(document.querySelectorAll('[data-map-handle]')).toHaveLength(1);
    });

    it('outside the editor there are none', async () => {
      await onTheMap([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      expect(document.querySelector('[data-map-handle]')).toBeNull();
    });

    it('the shape follows the hand before anything is sent', async () => {
      const deps = await selectedCapital();
      dragHandle(deps, 0, MOVED_TO);
      const [x, y] = polygonOf(CAPITAL_REGION_ID)?.split(' ')[0]?.split(',').map(Number) ?? [];
      expect(x).toBeCloseTo(MOVED_TO.x * IMAGE.width);
      expect(y).toBeCloseTo(MOVED_TO.y * IMAGE.height);
      expect(calls(deps, 'updateRegion')).toEqual([]);
    });

    it('letting go sends one PATCH and the confirmed shape stays', async () => {
      const deps = await selectedCapital();
      const confirmed = mapRegion({
        geometry: {
          shape: 'polygon',
          points: [MOVED_TO, CAPITAL_POINTS[1]!, CAPITAL_POINTS[2]!],
        },
      });
      deps.libraryMapsApi.answer('updateRegion', { ok: true, value: confirmed });
      dragHandle(deps, 0, MOVED_TO);
      fireEvent.pointerUp(handle(0), { pointerId: 1 });
      await waitFor(() => expect(calls(deps, 'updateRegion')).toHaveLength(1));
      await waitFor(() =>
        expect(viewOf(deps).getState().map?.regions[0]?.geometry).toEqual(confirmed.geometry),
      );
      expect(polygonOf(CAPITAL_REGION_ID)).toBe(shownPoints(MOVED_TO));
    });

    it('a refusal puts the confirmed shape back and says why', async () => {
      const deps = await selectedCapital();
      deps.libraryMapsApi.answer('updateRegion', OFFLINE);
      dragHandle(deps, 0, MOVED_TO);
      fireEvent.pointerUp(handle(0), { pointerId: 1 });
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(polygonOf(CAPITAL_REGION_ID)).toBe(shownPoints(CAPITAL_POINTS[0]!));
    });

    it('a press on a handle does not move the map', async () => {
      const deps = await selectedCapital();
      const before = viewOf(deps).getState().camera;
      dragHandle(deps, 0, MOVED_TO);
      fireEvent.pointerMove(frame(), { pointerId: 1, clientX: 900, clientY: 500 });
      expect(viewOf(deps).getState().camera).toEqual(before);
    });

    it('the click that ends a drag does not close the place', async () => {
      const deps = await selectedCapital();
      deps.libraryMapsApi.answer('updateRegion', OFFLINE);
      fireEvent.click(handle(0));
      expect(viewOf(deps).getState().selectedRegionId).toBe(CAPITAL_REGION_ID);
    });

    it('a lost press puts the shape back and sends nothing', async () => {
      const deps = await selectedCapital();
      dragHandle(deps, 0, MOVED_TO);
      fireEvent.pointerCancel(handle(0), { pointerId: 1 });
      expect(polygonOf(CAPITAL_REGION_ID)).toBe(shownPoints(CAPITAL_POINTS[0]!));
      expect(calls(deps, 'updateRegion')).toEqual([]);
    });

    it('Esc in the middle of a drag puts the shape back', async () => {
      const deps = await selectedCapital();
      dragHandle(deps, 0, MOVED_TO);
      await pressKey('Escape');
      expect(polygonOf(CAPITAL_REGION_ID)).toBe(shownPoints(CAPITAL_POINTS[0]!));
      expect(viewOf(deps).getState().selectedRegionId).toBe(CAPITAL_REGION_ID);
    });
  });

  describe('the data of a place', () => {
    async function formOfCapital(): Promise<Deps> {
      const deps = await editing([mapRegion()]);
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      return deps;
    }

    it('in the editor a click shows the form instead of the card', async () => {
      await formOfCapital();
      expect(screen.getByRole('region', { name: 'Dados de Capital' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fechar cartão' })).not.toBeInTheDocument();
    });

    it('a double click does not open what the place links to', async () => {
      const deps = await editing([
        mapRegion({ link: { state: 'open', kind: 'map', id: REINO_ID, name: 'Reino' } }),
      ]);
      deps.libraryMapsApi.maps.set(REINO_ID, libraryMapDetail({ id: REINO_ID, name: 'Reino' }));
      const reads = deps.libraryMapsApi.detailCalls();
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Capital' }));
      await act(() => Promise.resolve());
      expect(deps.libraryMapsApi.detailCalls()).toBe(reads);
      expect(deps.libraryApi.calls.filter((call) => call.method === 'list')).toHaveLength(1);
      expect(viewOf(deps).getState().mapId).toBe(MUNDO_ID);
    });

    it('what the server confirms reaches the map', async () => {
      const deps = await formOfCapital();
      deps.libraryMapsApi.answer('updateRegion', {
        ok: true,
        value: mapRegion({ name: 'Cidadela' }),
      });
      const name = screen.getByLabelText('Nome');
      await userEvent.clear(name);
      await userEvent.type(name, 'Cidadela');
      await userEvent.tab();
      expect(await screen.findByRole('button', { name: 'Cidadela' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Dados de Cidadela' })).toBeInTheDocument();
    });

    it('an excluded place leaves the map and takes the form with it', async () => {
      const deps = await formOfCapital();
      deps.libraryMapsApi.answer('removeRegion', { ok: true, value: null });
      await userEvent.click(screen.getByRole('button', { name: 'Excluir lugar' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Capital' })).not.toBeInTheDocument(),
      );
      expect(viewOf(deps).getState().selectedRegionId).toBeNull();
    });

    it('Esc inside a field does not close the form', async () => {
      await formOfCapital();
      const name = screen.getByLabelText('Nome');
      await userEvent.click(name);
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('region', { name: 'Dados de Capital' })).toBeInTheDocument();
    });

    it('the link picker lists what the library has', async () => {
      const deps = await editing([mapRegion()]);
      deps.libraryApi.answer('list', {
        ok: true,
        value: masterLibrary({
          maps: [libraryMapSummary({ id: REINO_ID, name: 'Reino' })],
        }),
      });
      await userEvent.click(screen.getByRole('button', { name: 'Concluir' }));
      await userEvent.click(screen.getByRole('button', { name: 'Editar mapa' }));
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      expect(await screen.findByRole('button', { name: 'Mapa: Reino' })).toBeInTheDocument();
    });

    it('a library that cannot be read says so', async () => {
      const deps = await onTheMap([mapRegion()]);
      deps.libraryApi.answer('list', OFFLINE);
      await userEvent.click(screen.getByRole('button', { name: 'Editar mapa' }));
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/biblioteca/);
    });
  });
});
