import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { mapWorkspaceKey } from '@/stores/document-workspace-store';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { DesktopWindowFake } from '../../support/desktop-window-fake';
import { documentFixture } from '../../support/documents-fixtures';
import {
  MUNDO_ID,
  REINO_ID,
  libraryMapDetail,
  libraryMapSummary,
} from '../../support/library-map-fixtures';
import { libraryChanged, sceneActivated } from '../../support/scene-tab-fixtures';

const TABLE_PATH = `/campaigns/${VHARN.id}/table`;
const HOME_TITLE = 'Abrir o mapa principal';
const MAP_KEY = mapWorkspaceKey(VHARN.id);
const MAIN_MAP = { ok: true, value: libraryMapSummary({ isMain: true }) } as const;
const NO_MAIN_MAP = { ok: true, value: null } as const;

describe('the home of the table', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
    deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ isMain: true }));
    deps.libraryMapsApi.answer('main', MAIN_MAP);
  });

  async function enterRoom(
    routeDeps: TestDependencies = deps,
  ): Promise<ReturnType<typeof createMemoryRouter>> {
    const router = createMemoryRouter(buildRoutes(routeDeps), { initialEntries: [TABLE_PATH] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('region', { name: 'Topo da sala' });
    await waitFor(() => expect(mainReads()).toBeGreaterThan(0));
    await settle();
    return router;
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  const mainReads = (): number =>
    deps.libraryMapsApi.calls.filter(({ method }) => method === 'main').length;
  const activeKey = (): string | null =>
    deps.documentWorkspace.getState().activeByCampaign[VHARN.id] ?? null;
  const openMaps = (): number => deps.documentWorkspace.getState().maps.length;
  const homeButton = (): HTMLElement => screen.getByRole('button', { name: HOME_TITLE });
  const queryHomeButton = (): HTMLElement | null =>
    screen.queryByRole('button', { name: HOME_TITLE });
  const backToBoard = (): void => {
    act(() => deps.documentWorkspace.getState().activate(VHARN.id, null));
  };
  const openDocument = (): string =>
    deps.documentWorkspace
      .getState()
      .open({ campaign: detailOf(VHARN), document: documentFixture() });

  it('the first entry opens the main map', async () => {
    await enterRoom();
    expect(deps.libraryMapsApi.calls).toContainEqual({ method: 'main', args: [VHARN.id] });
    expect(activeKey()).toBe(MAP_KEY);
    expect(deps.documentWorkspace.getState().maps[0]?.mapName).toBe('Mundo');
  });

  it('the name of the table goes back to the main map', async () => {
    await enterRoom();
    backToBoard();
    await userEvent.click(homeButton());
    expect(activeKey()).toBe(MAP_KEY);
    expect(openMaps()).toBe(1);
  });

  it('the way home is an icon button that says what it does, on its tooltip', async () => {
    await enterRoom();
    const button = homeButton();
    expect(button).toHaveAttribute('title', `${HOME_TITLE} (Shift+M)`);
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Shift+M');
    expect(button.querySelector('svg.lucide-map')).toHaveAttribute('aria-hidden', 'true');
    expect(button).not.toHaveTextContent(VHARN.name);
  });

  it('the name of the table stays text, as the heading of the room', async () => {
    await enterRoom();
    const heading = screen.getByRole('heading', { level: 1, name: VHARN.name });
    expect(heading).not.toContainElement(homeButton());
    expect(within(heading).queryByRole('button')).not.toBeInTheDocument();
  });

  it('Shift+M goes back to the main map, even from a document on screen', async () => {
    await enterRoom();
    openDocument();
    fireEvent.keyDown(document.body, { key: 'M', shiftKey: true });
    expect(activeKey()).toBe(MAP_KEY);
    expect(openMaps()).toBe(1);
  });

  it('the button is the current place while the main map is on screen', async () => {
    await enterRoom();
    expect(homeButton()).toHaveAttribute('aria-current', 'page');
  });

  it('the button stops being current when the room goes back to a grid', async () => {
    await enterRoom();
    backToBoard();
    expect(homeButton()).not.toHaveAttribute('aria-current');
  });

  it('the main map takes no place among the tabs', async () => {
    await enterRoom();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).not.toContain('Mundo');
  });

  it('in the window title bar the name is clickable, not a place to drag from', async () => {
    await enterRoom({ ...deps, desktopWindow: new DesktopWindowFake() });
    const bar = screen.getByRole('banner', { name: 'Barra da janela' });
    const button = await within(bar).findByRole('button', { name: HOME_TITLE });
    expect(button.closest('[data-app-region]')).toHaveAttribute('data-app-region', 'no-drag');
  });

  it('the arrival leaves no trace for a reload, which opens the main map again', async () => {
    await enterRoom();
    const remembered = [...deps.tabStorage.values.keys()].filter((key) => key.includes('mapHome'));
    expect(remembered).toEqual([]);
  });

  it('coming back to a table still open does not take the room off what it showed', async () => {
    const router = await enterRoom();
    backToBoard();
    await act(() => router.navigate('/'));
    await act(() => router.navigate(TABLE_PATH));
    await screen.findByRole('region', { name: 'Topo da sala' });
    await settle();
    expect(activeKey()).toBeNull();
  });

  it('leaving the table and entering again opens the main map again', async () => {
    const router = await enterRoom();
    backToBoard();
    await userEvent.click(screen.getByRole('button', { name: 'Sair da mesa' }));
    await waitFor(() => expect(deps.openTables.getState().tables).toEqual([]));
    expect(activeKey()).toBeNull();
    await act(() => router.navigate(TABLE_PATH));
    await waitFor(() => expect(activeKey()).toBe(MAP_KEY));
  });

  it('a table with no main map keeps a plain title and opens nothing', async () => {
    deps.libraryMapsApi.answer('main', NO_MAIN_MAP);
    await enterRoom();
    expect(screen.getByRole('heading', { level: 1, name: VHARN.name })).toBeInTheDocument();
    expect(queryHomeButton()).not.toBeInTheDocument();
    expect(openMaps()).toBe(0);
  });

  it('a main map marked during the session turns the name into a button, opening nothing', async () => {
    deps.libraryMapsApi.answer('main', NO_MAIN_MAP);
    await enterRoom();
    deps.libraryMapsApi.answer('main', MAIN_MAP);
    act(() => deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() }));
    expect(await screen.findByRole('button', { name: HOME_TITLE })).toBeInTheDocument();
    expect(openMaps()).toBe(0);
  });

  it('a main map unmarked during the session turns the name back into text', async () => {
    await enterRoom();
    deps.libraryMapsApi.answer('main', NO_MAIN_MAP);
    act(() => deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() }));
    await waitFor(() => expect(queryHomeButton()).not.toBeInTheDocument());
  });

  it('something already open at the arrival is not taken off the screen', async () => {
    const opened = openDocument();
    await enterRoom();
    expect(activeKey()).toBe(opened);
    expect(openMaps()).toBe(0);
  });

  it('a map tab left open from before starts over at the main map on arrival', async () => {
    deps.libraryMapsApi.maps.set(REINO_ID, libraryMapDetail({ id: REINO_ID, name: 'Reino' }));
    deps.documentWorkspace
      .getState()
      .openMap({ campaign: detailOf(VHARN), mapId: REINO_ID, mapName: 'Reino' });
    await enterRoom();
    expect(deps.documentWorkspace.getState().maps[0]?.mapName).toBe('Mundo');
  });

  it('taking the group to a grid leaves the map tab for the group grid', async () => {
    await enterRoom();
    act(() => deps.tableSessionApi.emit({ kind: 'sceneActivated', event: sceneActivated() }));
    await waitFor(() => expect(activeKey()).toBeNull());
    expect(openMaps()).toBe(1);
  });

  it('taking the group to a grid leaves an open document on screen', async () => {
    await enterRoom();
    let opened = '';
    act(() => {
      opened = openDocument();
    });
    act(() => deps.tableSessionApi.emit({ kind: 'sceneActivated', event: sceneActivated() }));
    await settle();
    expect(activeKey()).toBe(opened);
  });

  it('a failed read leaves the name as text and the room usable', async () => {
    deps.libraryMapsApi.answer('main', { ok: false, failure: { kind: 'offline' } });
    await enterRoom();
    expect(screen.getByRole('heading', { level: 1, name: VHARN.name })).toBeInTheDocument();
    expect(queryHomeButton()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair da mesa' })).toBeInTheDocument();
    expect(openMaps()).toBe(0);
  });

  it('a read that fails at the arrival does not pop the map open later', async () => {
    deps.libraryMapsApi.answer('main', { ok: false, failure: { kind: 'offline' } });
    await enterRoom();
    deps.libraryMapsApi.answer('main', MAIN_MAP);
    act(() => deps.tableSessionApi.emit({ kind: 'libraryChanged', event: libraryChanged() }));
    expect(await screen.findByRole('button', { name: HOME_TITLE })).toBeInTheDocument();
    expect(openMaps()).toBe(0);
  });
});
