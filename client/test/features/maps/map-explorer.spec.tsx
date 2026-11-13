import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentSummaryDto, MapRegionDto } from '@lorkarium/contracts';
import { regionFocusPoint } from '@lorkarium/game-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapPointToScreen } from '@/lib/map-viewport';
import type { Camera } from '@/renderer/camera';
import { ANA } from '../../support/auth-api-fake';
import { testDependencies } from '../../support/app-dependencies';
import { VHARN } from '../../support/campaigns-api-fake';
import { documentFixture, DOCUMENT_ID, ITEMS_TAB_ID } from '../../support/documents-fixtures';
import {
  MUNDO_ID,
  REINO_ID,
  libraryMapDetail,
  mapRegion,
  pinRegion,
} from '../../support/library-map-fixtures';
import { OSSUARIO, PORTRAIT, masterLibrary } from '../../support/library-fixtures';
import { openMapTab, renderMapTab } from '../../support/map-tab';

const WIDTH = 1000;
const HEIGHT = 600;
const OFFLINE = { ok: false, failure: { kind: 'offline' } } as const;

function diaryOf(): DocumentSummaryDto {
  const { id, folderId, visibility, version, updatedAt, canEdit, canManage, preview } =
    documentFixture({ id: DOCUMENT_ID });
  const summary = { id, folderId, visibility, version, updatedAt, canEdit, canManage, preview };
  return { ...summary, name: 'Diário' };
}

const LINK_TO = {
  document: { state: 'open', kind: 'document', id: DOCUMENT_ID, name: 'Diário' },
  scene: { state: 'open', kind: 'scene', id: OSSUARIO.id, name: OSSUARIO.name },
  image: { state: 'open', kind: 'image', id: PORTRAIT.id, name: PORTRAIT.name },
  map: { state: 'open', kind: 'map', id: REINO_ID, name: 'Reino' },
} as const;

function fullLibrary() {
  return masterLibrary({ documents: [diaryOf()], images: [PORTRAIT] });
}

function reinoBackToMundo() {
  return libraryMapDetail({
    id: REINO_ID,
    name: 'Reino',
    version: 1,
    regions: [
      mapRegion({
        name: 'Portal',
        link: { state: 'open', kind: 'map', id: MUNDO_ID, name: 'Mundo' },
      }),
    ],
  });
}

async function exploring(regions: readonly MapRegionDto[] = [mapRegion()]) {
  const deps = testDependencies();
  deps.sessionStore.getState().signedIn(ANA);
  deps.openTables.getState().restore(ANA.id);
  deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ regions: [...regions] }));
  deps.libraryMapsApi.maps.set(REINO_ID, reinoBackToMundo());
  deps.libraryApi.answer('list', { ok: true, value: fullLibrary() });
  openMapTab(deps);
  renderMapTab(deps);
  await screen.findByRole('img', { name: 'Mundo' });
  return deps;
}

function capital(): HTMLElement {
  return screen.getByRole('button', { name: 'Capital' });
}

function viewOf(deps: Awaited<ReturnType<typeof exploring>>) {
  const view = deps.documentWorkspace.getState().maps[0]?.view;
  if (!view) throw new Error('no map tab is open; expected the one of VHARN');
  return view;
}

function tabsOf(deps: Awaited<ReturnType<typeof exploring>>) {
  const table = deps.openTables.getState().tables.find((open) => open.campaignId === VHARN.id);
  if (!table) throw new Error(`table ${VHARN.id} is not open`);
  return table.tabs;
}

async function doubleClickCapital(): Promise<void> {
  fireEvent.doubleClick(capital());
  await act(async () => {
    await Promise.resolve();
  });
}

describe('exploring a map', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('the card', () => {
    it('a click opens the card with the name and the description', async () => {
      await exploring();
      fireEvent.click(capital());
      const card = screen.getByRole('region', { name: 'Capital' });
      expect(card).toHaveTextContent('Onde o rei mora.');
    });

    it('a drag does not open the card', async () => {
      await exploring();
      const frame = screen.getByRole('img', { name: 'Mundo' }).parentElement?.parentElement;
      fireEvent.pointerDown(frame as HTMLElement, {
        button: 0,
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      fireEvent.pointerMove(frame as HTMLElement, { pointerId: 1, clientX: 160, clientY: 100 });
      fireEvent.pointerUp(frame as HTMLElement, { pointerId: 1 });
      fireEvent.click(capital());
      expect(screen.queryByRole('region', { name: 'Capital' })).not.toBeInTheDocument();
    });

    it('Esc closes the card and gives the focus back to the region', async () => {
      await exploring();
      const region = capital();
      fireEvent.click(region);
      fireEvent.keyDown(screen.getByRole('button', { name: 'Fechar cartão' }), { key: 'Escape' });
      expect(screen.queryByRole('region', { name: 'Capital' })).not.toBeInTheDocument();
      expect(region).toHaveFocus();
    });

    it('a region erased by a reread takes its card away', async () => {
      const deps = await exploring();
      fireEvent.click(capital());
      deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ version: 9, regions: [] }));
      await act(() => viewOf(deps).getState().load());
      expect(screen.queryByRole('region', { name: 'Capital' })).not.toBeInTheDocument();
    });
  });

  describe('opening what a region links to', () => {
    it('a double click on a document opens its tab', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.document })]);
      await doubleClickCapital();
      await waitFor(() =>
        expect(deps.documentWorkspace.getState().entries[0]?.document.id).toBe(DOCUMENT_ID),
      );
      expect(deps.documentWorkspace.getState().activeByCampaign[VHARN.id]).toBe(
        deps.documentWorkspace.getState().entries[0]?.key,
      );
    });

    it('a double click on a link to a tab shows that tab of the document', async () => {
      const link = { ...LINK_TO.document, tabId: ITEMS_TAB_ID, tabName: 'Itens' };
      const deps = await exploring([mapRegion({ link })]);
      await doubleClickCapital();
      await waitFor(() => {
        const { entries, activeTabByDocument } = deps.documentWorkspace.getState();
        expect(activeTabByDocument[entries[0]?.key ?? '']).toBe(ITEMS_TAB_ID);
      });
    });

    it('a double click on a grid opens a personal tab and never moves the group', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.scene })]);
      await doubleClickCapital();
      await waitFor(() => expect(tabsOf(deps).getState().visibleKey).toBe(OSSUARIO.id));
      expect(deps.documentWorkspace.getState().activeByCampaign[VHARN.id]).toBeNull();
      expect(deps.sceneActivation.activated).toEqual([]);
    });

    it('a double click on an image opens the viewer', async () => {
      await exploring([mapRegion({ link: LINK_TO.image })]);
      await doubleClickCapital();
      expect(await screen.findByRole('dialog', { name: 'Retrato' })).toBeInTheDocument();
    });

    it('closing the viewer goes back to the map', async () => {
      await exploring([mapRegion({ link: LINK_TO.image })]);
      await doubleClickCapital();
      await screen.findByRole('dialog', { name: 'Retrato' });
      await userEvent.click(screen.getByRole('button', { name: 'Fechar imagem' }));
      expect(screen.queryByRole('dialog', { name: 'Retrato' })).not.toBeInTheDocument();
    });

    it('a double click on a map moves the same tab, and the trail shows the way', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.map })]);
      await doubleClickCapital();
      await screen.findByRole('img', { name: 'Reino' });
      expect(deps.documentWorkspace.getState().maps).toHaveLength(1);
      expect(deps.documentWorkspace.getState().maps[0]?.mapName).toBe('Reino');
      expect(screen.getByRole('list')).toHaveTextContent(/Mundo\s*›\s*Reino/);
    });

    it('"Voltar" comes back along the trail', async () => {
      await exploring([mapRegion({ link: LINK_TO.map })]);
      await doubleClickCapital();
      await screen.findByRole('img', { name: 'Reino' });
      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
      expect(await screen.findByRole('img', { name: 'Mundo' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('a click on a step of the trail comes back to it', async () => {
      await exploring([mapRegion({ link: LINK_TO.map })]);
      await doubleClickCapital();
      await screen.findByRole('img', { name: 'Reino' });
      await userEvent.click(screen.getByRole('button', { name: 'Mundo' }));
      expect(await screen.findByRole('img', { name: 'Mundo' })).toBeInTheDocument();
    });

    it('a cycle A → B → A does not get stuck', async () => {
      await exploring([mapRegion({ link: LINK_TO.map })]);
      await doubleClickCapital();
      await screen.findByRole('img', { name: 'Reino' });
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Portal' }));
      expect(await screen.findByRole('img', { name: 'Mundo' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('opening a map by the library restarts the trail', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.map })]);
      await doubleClickCapital();
      await screen.findByRole('img', { name: 'Reino' });
      act(() => openMapTab(deps, MUNDO_ID, 'Mundo'));
      expect(await screen.findByRole('img', { name: 'Mundo' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('"Abrir" in the card does the same as the double click', async () => {
      await exploring([mapRegion({ link: LINK_TO.image })]);
      fireEvent.click(capital());
      await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
      expect(await screen.findByRole('dialog', { name: 'Retrato' })).toBeInTheDocument();
    });

    it('Enter on the region does the same as the double click', async () => {
      await exploring([mapRegion({ link: LINK_TO.image })]);
      fireEvent.keyDown(capital(), { key: 'Enter' });
      expect(await screen.findByRole('dialog', { name: 'Retrato' })).toBeInTheDocument();
    });
  });

  describe('nothing to open', () => {
    it('a locked link says it was not revealed, and the double click does nothing', async () => {
      const deps = await exploring([mapRegion({ link: { state: 'locked' } })]);
      fireEvent.click(capital());
      await doubleClickCapital();
      expect(screen.getByText('O mestre ainda não revelou isto')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
      expect(deps.libraryApi.calls.filter((call) => call.method === 'list')).toEqual([]);
      expect(deps.documentWorkspace.getState().entries).toEqual([]);
    });

    it('a region with no link is only the card', async () => {
      const deps = await exploring([mapRegion({ link: null })]);
      fireEvent.click(capital());
      await doubleClickCapital();
      expect(screen.getByRole('region', { name: 'Capital' })).toBeInTheDocument();
      expect(deps.libraryApi.calls.filter((call) => call.method === 'list')).toEqual([]);
    });
  });

  describe('a target revoked after the map was read', () => {
    it('a document out of reach warns, opens nothing and reads the map again', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.document })]);
      deps.libraryApi.answer('list', { ok: true, value: masterLibrary() });
      const reads = deps.libraryMapsApi.detailCalls();
      await doubleClickCapital();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não dá mais para abrir o que está em Capital.',
      );
      expect(deps.documentWorkspace.getState().entries).toEqual([]);
      expect(deps.libraryMapsApi.detailCalls()).toBe(reads + 1);
    });

    it('the warning does not name what was there', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.document })]);
      deps.libraryApi.answer('list', { ok: true, value: masterLibrary() });
      await doubleClickCapital();
      expect(await screen.findByRole('alert')).not.toHaveTextContent('Diário');
    });

    it('a grid out of reach warns and opens no tab', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.scene })]);
      deps.libraryApi.answer('list', { ok: true, value: masterLibrary({ scenes: [] }) });
      await doubleClickCapital();
      await screen.findByRole('alert');
      expect(tabsOf(deps).getState().tabs).toHaveLength(1);
    });

    it('an image out of reach warns and shows no viewer', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.image })]);
      deps.libraryApi.answer('list', { ok: true, value: masterLibrary({ images: [] }) });
      await doubleClickCapital();
      await screen.findByRole('alert');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('a map out of reach warns, and the tab stays on the map it was', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.map })]);
      deps.libraryMapsApi.maps.delete(REINO_ID);
      await doubleClickCapital();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não dá mais para abrir o que está em Capital.',
      );
      expect(screen.getByRole('img', { name: 'Mundo' })).toBeInTheDocument();
      expect(deps.documentWorkspace.getState().maps).toHaveLength(1);
    });

    it('a library that cannot be read says so, not that it was revoked', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.document })]);
      deps.libraryApi.answer('list', OFFLINE);
      await doubleClickCapital();
      expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para abrir agora.');
    });

    it('the warning can be dismissed', async () => {
      const deps = await exploring([mapRegion({ link: LINK_TO.document })]);
      deps.libraryApi.answer('list', { ok: true, value: masterLibrary() });
      await doubleClickCapital();
      await screen.findByRole('alert');
      await userEvent.click(screen.getByRole('button', { name: 'Entendi' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('places in this map', () => {
    it('choosing a place centers it and opens its card', async () => {
      const deps = await exploring([mapRegion(), pinRegion()]);
      await userEvent.click(screen.getByRole('button', { name: 'Lugares neste mapa' }));
      const list = screen.getByRole('list');
      await userEvent.click(
        [...list.querySelectorAll('button')].find(
          (place) => place.textContent === 'Taverna',
        ) as HTMLElement,
      );
      expect(screen.getByRole('region', { name: 'Taverna' })).toBeInTheDocument();
      const center = regionFocusPoint(pinRegion().geometry);
      const screenPoint = mapPointToScreen(
        viewOf(deps).getState().camera as Camera,
        { width: 2000, height: 1000 },
        center,
      );
      expect(screenPoint.x).toBeCloseTo(WIDTH / 2);
      expect(screenPoint.y).toBeCloseTo(HEIGHT / 2);
    });
  });
});
