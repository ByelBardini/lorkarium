import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { LibraryMapRegionShownDto } from '@lorkarium/contracts';
import { buildRoutes } from '@/app/router';
import { mapWorkspaceKey } from '@/stores/document-workspace-store';
import type { MapViewState } from '@/stores/map-view-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  CAPITAL_REGION_ID,
  FLORESTA_REGION_ID,
  MUNDO_ID,
  REINO_ID,
  TAVERNA_REGION_ID,
  forestRegion,
  libraryMapDetail,
  mapRegion,
  mapRegionShown,
  pinRegion,
} from '../../support/library-map-fixtures';

const TABLE_PATH = `/campaigns/${VHARN.id}/table`;
const MAP_KEY = mapWorkspaceKey(VHARN.id);
const WIDTH = 1000;
const HEIGHT = 600;

describe('a region shown to the room', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT);
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    deps.libraryMapsApi.answer('main', { ok: true, value: null });
    deps.libraryMapsApi.maps.set(
      MUNDO_ID,
      libraryMapDetail({ regions: [mapRegion(), forestRegion()] }),
    );
    deps.libraryMapsApi.maps.set(
      REINO_ID,
      libraryMapDetail({ id: REINO_ID, name: 'Reino', regions: [pinRegion()] }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  async function enterRoom(): Promise<ReturnType<typeof createMemoryRouter>> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: [TABLE_PATH] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('region', { name: 'Topo da sala' });
    await settle();
    return router;
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function navigate(
    router: ReturnType<typeof createMemoryRouter>,
    path: string,
  ): Promise<void> {
    await act(async () => {
      await router.navigate(path);
    });
    await settle();
  }

  function show(overrides: Partial<LibraryMapRegionShownDto> = {}): void {
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'mapRegionShown',
      event: mapRegionShown(overrides),
    });
  }

  const activeKey = (): string | null =>
    deps.documentWorkspace.getState().activeByCampaign[VHARN.id] ?? null;
  const openMaps = (): number => deps.documentWorkspace.getState().maps.length;

  function view(): StoreApi<MapViewState> {
    const entry = deps.documentWorkspace.getState().maps[0];
    if (!entry) throw new Error(`no map tab is open; expected the one of ${VHARN.id}`);
    return entry.view;
  }

  it('opens the map on the region, centered and highlighted', async () => {
    await enterRoom();
    show();
    expect(await screen.findByRole('region', { name: 'Capital' })).toBeInTheDocument();
    expect(activeKey()).toBe(MAP_KEY);
    expect(view().getState()).toMatchObject({
      mapId: MUNDO_ID,
      selectedRegionId: CAPITAL_REGION_ID,
      focusRegionId: null,
    });
    expect(view().getState().camera).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Capital' })).toHaveAttribute('data-selected');
  });

  it('the tab takes the name of the map as soon as it is read', async () => {
    await enterRoom();
    show();
    await waitFor(() => expect(deps.documentWorkspace.getState().maps[0]?.mapName).toBe('Mundo'));
  });

  it('reaches whoever is in focus mode, where the top bar is gone', async () => {
    await enterRoom();
    act(() => deps.roomLayout.getState().toggleFocus());
    show();
    expect(activeKey()).toBe(MAP_KEY);
    expect(await screen.findByRole('region', { name: 'Capital' })).toBeInTheDocument();
  });

  it('a new presentation replaces the one before, on the same map', async () => {
    await enterRoom();
    show();
    await screen.findByRole('region', { name: 'Capital' });
    show({ regionId: FLORESTA_REGION_ID });
    expect(await screen.findByRole('region', { name: 'Floresta' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Capital' })).not.toBeInTheDocument();
    expect(view().getState().selectedRegionId).toBe(FLORESTA_REGION_ID);
  });

  it('a new presentation on another map moves the tab there', async () => {
    await enterRoom();
    show();
    show({ mapId: REINO_ID, regionId: TAVERNA_REGION_ID });
    expect(await screen.findByRole('region', { name: 'Taverna' })).toBeInTheDocument();
    expect(openMaps()).toBe(1);
    expect(view().getState()).toMatchObject({
      mapId: REINO_ID,
      selectedRegionId: TAVERNA_REGION_ID,
    });
  });

  it('a region gone before the map opened leaves just the map', async () => {
    await enterRoom();
    show({ regionId: TAVERNA_REGION_ID });
    expect(await screen.findByRole('img', { name: 'Mundo' })).toBeInTheDocument();
    await waitFor(() => expect(view().getState().focusRegionId).toBeNull());
    expect(view().getState().selectedRegionId).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fechar cartão' })).not.toBeInTheDocument();
  });

  it('outside the room it is ignored, and does not come back on return', async () => {
    const router = await enterRoom();
    await navigate(router, '/');
    show();
    expect(openMaps()).toBe(0);
    await navigate(router, TABLE_PATH);
    await screen.findByRole('region', { name: 'Topo da sala' });
    await settle();
    expect(openMaps()).toBe(0);
    expect(activeKey()).toBeNull();
  });

  it('under a page that covers the room it is ignored, and does not come back on return', async () => {
    const router = await enterRoom();
    await navigate(router, `${TABLE_PATH}/settings`);
    show();
    expect(openMaps()).toBe(0);
    await navigate(router, TABLE_PATH);
    await settle();
    expect(openMaps()).toBe(0);
  });

  it('back in the room, the next one is shown', async () => {
    const router = await enterRoom();
    await navigate(router, '/');
    show();
    await navigate(router, TABLE_PATH);
    await screen.findByRole('region', { name: 'Topo da sala' });
    await settle();
    show({ regionId: FLORESTA_REGION_ID });
    expect(await screen.findByRole('region', { name: 'Floresta' })).toBeInTheDocument();
  });
});
