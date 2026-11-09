import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CampaignDetailDto, MapRegionDto } from '@lorkarium/contracts';
import type { MapPoint } from '@lorkarium/game-core';
import { beforeEach, vi } from 'vitest';
import { mapPointToScreen } from '@/lib/map-viewport';
import type { Camera } from '@/renderer/camera';
import { ANA } from './auth-api-fake';
import { testDependencies } from './app-dependencies';
import { VHARN, detailOf } from './campaigns-api-fake';
import { MUNDO_ID, REINO_ID, libraryMapDetail, mapRegion } from './library-map-fixtures';
import { masterLibrary } from './library-fixtures';
import { renderMapTab } from './map-tab';

const WIDTH = 1000;
const HEIGHT = 600;
export const IMAGE = { width: 2000, height: 1000 };
export const A: MapPoint = { x: 0.3, y: 0.3 };
export const B: MapPoint = { x: 0.6, y: 0.3 };
export const C: MapPoint = { x: 0.6, y: 0.7 };
export const OFFLINE = { ok: false, failure: { kind: 'offline' } } as const;
export const CAPITAL_POINTS = [
  { x: 0.1, y: 0.1 },
  { x: 0.2, y: 0.1 },
  { x: 0.2, y: 0.2 },
];

export type Deps = ReturnType<typeof testDependencies>;

export async function onTheMap(
  regions: readonly MapRegionDto[] = [],
  campaign: CampaignDetailDto = detailOf(VHARN),
): Promise<Deps> {
  const deps = testDependencies();
  deps.sessionStore.getState().signedIn(ANA);
  deps.openTables.getState().restore(ANA.id);
  deps.libraryMapsApi.maps.set(MUNDO_ID, libraryMapDetail({ regions: [...regions] }));
  deps.libraryApi.answer('list', { ok: true, value: masterLibrary() });
  deps.documentWorkspace.getState().openMap({ campaign, mapId: MUNDO_ID, mapName: 'Mundo' });
  renderMapTab(deps);
  await screen.findByRole('img', { name: 'Mundo' });
  await act(async () => deps.tableSessionApi.emit({ kind: 'status', status: 'live' }));
  return deps;
}

export async function editing(regions: readonly MapRegionDto[] = []): Promise<Deps> {
  const deps = await onTheMap(regions);
  await userEvent.click(screen.getByRole('button', { name: 'Editar mapa' }));
  return deps;
}

export function viewOf(deps: Deps) {
  const view = deps.documentWorkspace.getState().maps[0]?.view;
  if (!view) throw new Error('no map tab is open; expected the one of VHARN');
  return view;
}

export function frame(): HTMLElement {
  return screen.getByRole('img', { name: 'Mundo' }).parentElement?.parentElement as HTMLElement;
}

export function screenPointOf(
  deps: Deps,
  point: MapPoint,
): Readonly<{ clientX: number; clientY: number }> {
  const at = mapPointToScreen(viewOf(deps).getState().camera as Camera, IMAGE, point);
  return { clientX: at.x, clientY: at.y };
}

export function clickMap(deps: Deps, point: MapPoint): void {
  fireEvent.click(frame(), screenPointOf(deps, point));
}

export function polygonOf(regionId: string): string | null | undefined {
  return document.querySelector(`[data-region-id="${regionId}"] polygon`)?.getAttribute('points');
}

export function handle(index: number): Element {
  const found = document.querySelector(`[data-map-handle="${index}"]`);
  if (!found) throw new Error(`no handle ${index}; expected one per vertex of the selected region`);
  return found;
}

export function dragHandle(deps: Deps, index: number, to: MapPoint): void {
  fireEvent.pointerDown(handle(index), { button: 0, pointerId: 1, ...screenPointOf(deps, A) });
  fireEvent.pointerMove(handle(index), { pointerId: 1, ...screenPointOf(deps, to) });
}

export function calls(deps: Deps, method: 'createRegion' | 'updateRegion') {
  return deps.libraryMapsApi.calls.filter((call) => call.method === method);
}

export async function chooseTool(name: 'Polígono' | 'Pino'): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name }));
}

export async function pressKey(key: string): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document.body, { key });
    await Promise.resolve();
  });
}

export function newRegion(overrides: Partial<MapRegionDto> = {}): MapRegionDto {
  return mapRegion({ id: REINO_ID, name: 'Novo lugar', description: '', ...overrides });
}

export function draftVertices(): number {
  return document.querySelectorAll('[data-map-draft-vertex]').length;
}

/** The size the canvas needs to frame the map, which jsdom does not measure. */
export function frameTheMapIn1000By600(): void {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT);
  });
}
