import { act, fireEvent, screen } from '@testing-library/react';
import { regionFocusPoint } from '@lorkarium/game-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapPointToScreen } from '@/lib/map-viewport';
import { ANA } from '../../support/auth-api-fake';
import { testDependencies } from '../../support/app-dependencies';
import {
  MUNDO_ID,
  libraryMapDetail,
  libraryMapSummary,
  mapRegion,
} from '../../support/library-map-fixtures';
import { masterLibrary } from '../../support/library-fixtures';
import { openMapTab, renderMapTab } from '../../support/map-tab';

const FRAME = { width: 1000, height: 600 };
const CARD = { width: 320, height: 160 };
const GAP = 16;
const IMAGE = libraryMapSummary().asset;

function fakeSizes(): void {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(FRAME.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(FRAME.height);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(CARD.width);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(CARD.height);
}

async function exploring() {
  const deps = testDependencies();
  deps.sessionStore.getState().signedIn(ANA);
  deps.openTables.getState().restore(ANA.id);
  deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ regions: [mapRegion()] }));
  deps.libraryApi.answer('list', { ok: true, value: masterLibrary() });
  openMapTab(deps);
  renderMapTab(deps);
  await screen.findByRole('img', { name: 'Mundo' });
  const view = deps.documentWorkspace.getState().maps[0]?.view;
  if (!view) throw new Error('no map tab is open; expected the one of VHARN');
  return view;
}

function clickCapitalAt(clientX: number, clientY: number): void {
  fireEvent.click(screen.getByRole('button', { name: 'Capital' }), { clientX, clientY });
}

function card(): HTMLElement {
  return screen.getByRole('region', { name: 'Capital' });
}

describe('the card of a region, where it opens', () => {
  beforeEach(fakeSizes);
  afterEach(() => vi.restoreAllMocks());

  it('opens beside the click, leaving the spot itself free for the second click', async () => {
    await exploring();
    clickCapitalAt(300, 200);
    expect(card()).toHaveStyle({ left: `${300 + GAP}px`, top: `${200 - CARD.height / 2}px` });
  });

  it('opens on the other side of the click when it would not fit', async () => {
    await exploring();
    clickCapitalAt(900, 200);
    expect(card()).toHaveStyle({ left: `${900 - GAP - CARD.width}px` });
  });

  it('stays inside the window on a click by its bottom edge', async () => {
    await exploring();
    clickCapitalAt(300, 590);
    expect(card()).toHaveStyle({ top: `${FRAME.height - CARD.height - 12}px` });
  });

  it('follows the spot when the map is dragged', async () => {
    const view = await exploring();
    clickCapitalAt(300, 200);
    const camera = view.getState().camera;
    if (!camera) throw new Error('the map was not framed');
    act(() => view.getState().setCamera({ ...camera, offsetX: camera.offsetX + 50 }));
    expect(card()).toHaveStyle({ left: `${350 + GAP}px` });
  });

  it('with no click to go by (the list of places), opens beside the region', async () => {
    const view = await exploring();
    act(() => view.getState().focusRegion(mapRegion().id));
    const camera = view.getState().camera;
    if (!camera) throw new Error('the map was not framed');
    const spot = mapPointToScreen(camera, IMAGE, regionFocusPoint(mapRegion().geometry));
    expect(card()).toHaveStyle({ left: `${spot.x + GAP}px` });
  });
});
