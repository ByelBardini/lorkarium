import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANA } from '../../support/auth-api-fake';
import { testDependencies } from '../../support/app-dependencies';
import {
  MUNDO_ID,
  libraryMapDetail,
  mapChanged,
  mapRegion,
} from '../../support/library-map-fixtures';
import { openMapTab, renderMapTab } from '../../support/map-tab';
import { libraryChanged } from '../../support/scene-tab-fixtures';
import { vharnState } from '../../support/table-session-fixtures';

async function mapTab() {
  const deps = testDependencies();
  deps.sessionStore.getState().signedIn(ANA);
  deps.openTables.getState().restore(ANA.id);
  deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ regions: [mapRegion()] }));
  openMapTab(deps);
  renderMapTab(deps);
  await screen.findByRole('img', { name: 'Mundo' });
  await act(async () => deps.tableSessionApi.emit({ kind: 'status', status: 'live' }));
  return deps;
}

async function settle(): Promise<void> {
  await act(() => Promise.resolve());
}

describe('WorkspaceMap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the map inside the room tab', async () => {
    await mapTab();
    expect(screen.getByTestId('room-tab')).toContainElement(
      screen.getByRole('img', { name: 'Mundo' }),
    );
  });

  it('library:changed reads the map again', async () => {
    const deps = await mapTab();
    const before = deps.libraryMapsApi.detailCalls();
    act(() => deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() }));
    await settle();
    expect(deps.libraryMapsApi.detailCalls()).toBe(before + 1);
  });

  it('library:mapChanged brings the new regions to the screen', async () => {
    const deps = await mapTab();
    deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ version: 4, regions: [] }));
    act(() => deps.tableSessionApi.emit({ kind: 'mapChanged', event: mapChanged() }));
    await waitFor(() =>
      expect(deps.documentWorkspace.getState().maps[0]?.view.getState().map?.regions).toEqual([]),
    );
  });

  it('a rename reaches the tab title', async () => {
    const deps = await mapTab();
    deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ version: 4, name: 'Novo Mundo' }));
    act(() => deps.tableSessionApi.emit({ kind: 'mapChanged', event: mapChanged() }));
    await waitFor(() =>
      expect(deps.documentWorkspace.getState().maps[0]?.mapName).toBe('Novo Mundo'),
    );
  });

  it('losing access closes the tab with a notice and takes the image away', async () => {
    const deps = await mapTab();
    deps.libraryMapsApi.maps.delete(MUNDO_ID);
    act(() => deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O mapa Mundo foi fechado: ele foi excluído ou você não pode mais vê-lo.',
    );
    expect(screen.queryByRole('img', { name: 'Mundo' })).not.toBeInTheDocument();
    expect(deps.documentWorkspace.getState().maps).toEqual([]);
  });

  it('coming back from a dropped connection reads the map again', async () => {
    const deps = await mapTab();
    const before = deps.libraryMapsApi.detailCalls();
    act(() => deps.tableSessionApi.emit({ kind: 'status', status: 'reconnecting' }));
    await settle();
    expect(deps.libraryMapsApi.detailCalls()).toBe(before);
    act(() => deps.tableSessionApi.emit({ kind: 'status', status: 'live' }));
    await settle();
    expect(deps.libraryMapsApi.detailCalls()).toBe(before + 1);
  });

  it('the reader changing role reads the map again', async () => {
    const deps = await mapTab();
    const [ana, ...others] = vharnState().members;
    if (!ana) throw new Error('vharnState() has no members; expected Ana first');
    const asAna = { ...ana, userId: ANA.id };
    act(() =>
      deps.tableSessionApi.emit({
        kind: 'state',
        state: vharnState({ members: [asAna, ...others] }),
      }),
    );
    await settle();
    const before = deps.libraryMapsApi.detailCalls();
    const demoted = { ...asAna, role: 'player' as const };
    act(() =>
      deps.tableSessionApi.emit({
        kind: 'state',
        state: vharnState({ version: 2, members: [demoted, ...others] }),
      }),
    );
    await settle();
    expect(deps.libraryMapsApi.detailCalls()).toBe(before + 1);
  });

  it('a map that cannot be read offers "Tentar de novo"', async () => {
    const deps = testDependencies();
    deps.sessionStore.getState().signedIn(ANA);
    deps.openTables.getState().restore(ANA.id);
    deps.libraryMapsApi.detailFailure = { ok: false, failure: { kind: 'offline' } };
    openMapTab(deps);
    renderMapTab(deps);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para abrir o mapa.');
    deps.libraryMapsApi.detailFailure = null;
    deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail());
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('img', { name: 'Mundo' })).toBeInTheDocument();
  });
});
