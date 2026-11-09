import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LibraryMapDetailDto, MapRegionDto } from '@lorkarium/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { regionFocusPoint } from '@lorkarium/game-core';
import { MapCanvas } from '@/features/maps/map-canvas';
import { mapPointToScreen } from '@/lib/map-viewport';
import type { Camera } from '@/renderer/camera';
import { createMapViewStore } from '@/stores/map-view-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { LibraryMapsApiFake } from '../../support/library-maps-api-fake';
import {
  CAPITAL_REGION_ID,
  FLORESTA_REGION_ID,
  MUNDO_ID,
  TAVERNA_REGION_ID,
  forestRegion,
  libraryMapDetail,
  mapRegion,
  pinRegion,
} from '../../support/library-map-fixtures';

const WIDTH = 1000;
const HEIGHT = 600;
const OPEN_LINK = {
  state: 'open',
  kind: 'document',
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Diário',
} as const;

function fakeFrameSize(): () => void {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT);
  return () => vi.restoreAllMocks();
}

function renderCanvas(
  map: LibraryMapDetailDto = libraryMapDetail({ regions: [mapRegion()] }),
  onSelectRegion: (region: MapRegionDto) => void = () => undefined,
) {
  const api = new LibraryMapsApiFake();
  const view = createMapViewStore({ api, campaignId: VHARN.id, mapId: MUNDO_ID });
  const { container } = render(<MapCanvas map={map} view={view} onSelectRegion={onSelectRegion} />);
  const image = screen.getByRole<HTMLImageElement>('img', { name: map.name });
  const frame = image.parentElement?.parentElement as HTMLElement;
  return { view, container, frame, image };
}

function regionOf(container: HTMLElement, id: string): SVGGElement {
  return container.querySelector(`[data-region-id="${id}"]`) as SVGGElement;
}

function drag(frame: HTMLElement, to: Readonly<{ x: number; y: number }>): void {
  fireEvent.pointerDown(frame, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(frame, { pointerId: 1, clientX: 100 + to.x, clientY: 100 + to.y });
  fireEvent.pointerUp(frame, { pointerId: 1 });
}

describe('MapCanvas', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = fakeFrameSize();
  });
  afterEach(() => restore());

  it('frames the map as it arrives, inside the window', () => {
    const { view } = renderCanvas();
    const camera = view.getState().camera;
    expect(camera).not.toBeNull();
    expect(2000 * (camera?.zoom ?? 0)).toBeLessThanOrEqual(WIDTH);
  });

  it('keeps the camera the view already has (the room came back to the tab)', () => {
    const api = new LibraryMapsApiFake();
    const view = createMapViewStore({ api, campaignId: VHARN.id, mapId: MUNDO_ID });
    const camera = { offsetX: 7, offsetY: 9, zoom: 2 };
    view.getState().setCamera(camera);
    render(<MapCanvas map={libraryMapDetail()} view={view} />);
    expect(view.getState().camera).toEqual(camera);
    expect(screen.getByRole('img', { name: 'Mundo' })).toHaveStyle({
      transform: 'translate(7px, 9px) scale(2)',
    });
  });

  it('draws the regions in paint order: biggest polygon first, pins last', () => {
    const map = libraryMapDetail({ regions: [pinRegion(), mapRegion(), forestRegion()] });
    const { container } = renderCanvas(map);
    const drawn = [...container.querySelectorAll('[data-region-id]')].map((region) =>
      region.getAttribute('data-region-id'),
    );
    expect(drawn).toEqual([FLORESTA_REGION_ID, CAPITAL_REGION_ID, TAVERNA_REGION_ID]);
  });

  it('draws a polygon in the pixels of the image and in its color', () => {
    const { container } = renderCanvas();
    const region = regionOf(container, CAPITAL_REGION_ID);
    expect(region.querySelector('polygon')).toHaveAttribute('points', '200,100 400,100 400,200');
    expect(region).toHaveAttribute('fill', '#aa3300');
  });

  it('a pin keeps its size on screen whatever the zoom', () => {
    const { view, container } = renderCanvas(libraryMapDetail({ regions: [pinRegion()] }));
    act(() => view.getState().setCamera({ offsetX: 0, offsetY: 0, zoom: 2 }));
    const near = Number(container.querySelector('circle')?.getAttribute('r'));
    act(() => view.getState().setCamera({ offsetX: 0, offsetY: 0, zoom: 0.5 }));
    const far = Number(container.querySelector('circle')?.getAttribute('r'));
    expect(far).toBe(near * 4);
  });

  it('marks a hidden region, which only a master receives', () => {
    const { container } = renderCanvas(
      libraryMapDetail({ regions: [mapRegion({ hidden: true })] }),
    );
    expect(regionOf(container, CAPITAL_REGION_ID)).toHaveAttribute('data-hidden', 'true');
  });

  it('a drag past the threshold moves the map', () => {
    const { view, frame } = renderCanvas();
    const before = view.getState().camera;
    drag(frame, { x: 30, y: 0 });
    expect(view.getState().camera?.offsetX).toBe((before?.offsetX ?? 0) + 30);
  });

  it('a press that barely moves does not move the map', () => {
    const { view, frame } = renderCanvas();
    const before = view.getState().camera;
    drag(frame, { x: 2, y: 1 });
    expect(view.getState().camera).toEqual(before);
  });

  it('a right button press does not move the map', () => {
    const { view, frame } = renderCanvas();
    const before = view.getState().camera;
    fireEvent.pointerDown(frame, { button: 2, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 50, clientY: 0 });
    expect(view.getState().camera).toEqual(before);
  });

  it('a click selects the region', () => {
    const onSelect = vi.fn();
    const { container } = renderCanvas(undefined, onSelect);
    fireEvent.click(regionOf(container, CAPITAL_REGION_ID));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(mapRegion(), expect.anything());
  });

  it('a drag past the threshold does not turn into a click on the region', () => {
    const onSelect = vi.fn();
    const { container, frame } = renderCanvas(undefined, onSelect);
    drag(frame, { x: 30, y: 0 });
    fireEvent.click(regionOf(container, CAPITAL_REGION_ID));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('after a drag, the next simple click selects again', () => {
    const onSelect = vi.fn();
    const { container, frame } = renderCanvas(undefined, onSelect);
    drag(frame, { x: 30, y: 0 });
    drag(frame, { x: 0, y: 0 });
    fireEvent.click(regionOf(container, CAPITAL_REGION_ID));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  describe('regions for the keyboard and the reader', () => {
    function renderOpening(map = libraryMapDetail({ regions: [mapRegion({ link: OPEN_LINK })] })) {
      const onSelect = vi.fn();
      const onOpen = vi.fn();
      const api = new LibraryMapsApiFake();
      const view = createMapViewStore({ api, campaignId: VHARN.id, mapId: MUNDO_ID });
      const { container } = render(
        <MapCanvas map={map} view={view} onSelectRegion={onSelect} onOpenRegion={onOpen} />,
      );
      const image = screen.getByRole('img', { name: map.name });
      return { view, container, onSelect, onOpen, frame: image.parentElement?.parentElement };
    }

    it('a region is a focusable button named after itself', () => {
      renderOpening();
      const region = screen.getByRole('button', { name: 'Capital' });
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region).toHaveAttribute('data-region-id', CAPITAL_REGION_ID);
    });

    it('the drawing is no longer hidden from assistive technology', () => {
      const { container } = renderOpening();
      expect(container.querySelector('svg')).not.toHaveAttribute('aria-hidden');
      expect(screen.getByRole('group', { name: 'Regiões do mapa' })).toBeInTheDocument();
    });

    it('a hidden region says so in its name', () => {
      renderOpening(libraryMapDetail({ regions: [mapRegion({ hidden: true })] }));
      expect(screen.getByRole('button', { name: 'Capital (oculta)' })).toBeInTheDocument();
    });

    it('Enter opens a region with an open link', () => {
      const { onOpen, onSelect } = renderOpening();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Capital' }), { key: 'Enter' });
      expect(onOpen).toHaveBeenCalledOnce();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('a click on a region says the point of the map under the pointer', () => {
      const { view, onSelect } = renderOpening();
      act(() => view.getState().setCamera({ offsetX: 0, offsetY: 0, zoom: 0.5 }));
      fireEvent.click(screen.getByRole('button', { name: 'Capital' }), {
        clientX: 100,
        clientY: 50,
      });
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.anything(), { x: 0.1, y: 0.1 });
    });

    it('the keyboard has no pointer to say', () => {
      const { onSelect } = renderOpening();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Capital' }), { key: ' ' });
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(expect.anything(), null);
    });

    it('Enter on a region with nothing to open shows its card', () => {
      const { onOpen, onSelect } = renderOpening(
        libraryMapDetail({ regions: [mapRegion({ link: { state: 'locked' } })] }),
      );
      fireEvent.keyDown(screen.getByRole('button', { name: 'Capital' }), { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('Space shows the card, without opening and without scrolling the page', () => {
      const { onOpen, onSelect } = renderOpening();
      const notPrevented = fireEvent.keyDown(screen.getByRole('button', { name: 'Capital' }), {
        key: ' ',
      });
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onOpen).not.toHaveBeenCalled();
      expect(notPrevented).toBe(false);
    });

    it('the keyboard still works right after a drag', () => {
      const { onSelect, frame } = renderOpening();
      drag(frame as HTMLElement, { x: 30, y: 0 });
      fireEvent.keyDown(screen.getByRole('button', { name: 'Capital' }), { key: ' ' });
      expect(onSelect).toHaveBeenCalledOnce();
    });

    it('a double click opens', () => {
      const { onOpen } = renderOpening();
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Capital' }));
      expect(onOpen).toHaveBeenCalledExactlyOnceWith(mapRegion({ link: OPEN_LINK }));
    });

    it('a double click that ends a drag opens nothing', () => {
      const { onOpen, frame } = renderOpening();
      drag(frame as HTMLElement, { x: 30, y: 0 });
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Capital' }));
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('marks the region selected in the view', () => {
      const { view } = renderOpening();
      act(() => view.getState().selectRegion(CAPITAL_REGION_ID));
      expect(screen.getByRole('button', { name: 'Capital' })).toHaveAttribute(
        'data-selected',
        'true',
      );
    });
  });

  describe('selection and focus over the frame', () => {
    it('a click on the empty map lets go of the selection', () => {
      const { view, image } = renderCanvas();
      act(() => view.getState().selectRegion(CAPITAL_REGION_ID));
      fireEvent.click(image);
      expect(view.getState().selectedRegionId).toBeNull();
    });

    it('a click on a region keeps the selection to whoever handles it', () => {
      const { view, container } = renderCanvas();
      act(() => view.getState().selectRegion(CAPITAL_REGION_ID));
      fireEvent.click(regionOf(container, CAPITAL_REGION_ID));
      expect(view.getState().selectedRegionId).toBe(CAPITAL_REGION_ID);
    });

    it('the click that ends a drag lets nothing go', () => {
      const { view, frame, image } = renderCanvas();
      act(() => view.getState().selectRegion(CAPITAL_REGION_ID));
      drag(frame, { x: 30, y: 0 });
      fireEvent.click(image);
      expect(view.getState().selectedRegionId).toBe(CAPITAL_REGION_ID);
    });

    it('a region asked to be focused comes to the middle of the window', () => {
      const { view } = renderCanvas();
      act(() => view.getState().focusRegion(CAPITAL_REGION_ID));
      const { camera, focusRegionId } = view.getState();
      expect(focusRegionId).toBeNull();
      const center = regionFocusPoint(mapRegion().geometry);
      const screenPoint = mapPointToScreen(camera as Camera, { width: 2000, height: 1000 }, center);
      expect(screenPoint.x).toBeCloseTo(WIDTH / 2);
      expect(screenPoint.y).toBeCloseTo(HEIGHT / 2);
    });

    it('a focus asked for before the map arrived lands when it does', () => {
      const api = new LibraryMapsApiFake();
      const view = createMapViewStore({ api, campaignId: VHARN.id, mapId: MUNDO_ID });
      view.getState().focusRegion(CAPITAL_REGION_ID);
      render(<MapCanvas map={libraryMapDetail({ regions: [mapRegion()] })} view={view} />);
      expect(view.getState().focusRegionId).toBeNull();
      expect(view.getState().camera?.zoom).toBeGreaterThan(0.5);
    });

    it('a frame out of the layout keeps the focus waiting and the camera where it is', () => {
      const { view } = renderCanvas();
      const framed = view.getState().camera;
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0);
      act(() => view.getState().focusRegion(CAPITAL_REGION_ID));
      expect(view.getState()).toMatchObject({ camera: framed, focusRegionId: CAPITAL_REGION_ID });
    });

    it('a focus on a region that is not there leaves the framing alone', () => {
      const { view } = renderCanvas(libraryMapDetail({ regions: [] }));
      const framed = view.getState().camera;
      act(() => view.getState().focusRegion(CAPITAL_REGION_ID));
      expect(view.getState()).toMatchObject({
        camera: framed,
        focusRegionId: null,
        selectedRegionId: null,
      });
    });
  });

  it('Ctrl + wheel zooms and holds back the zoom of the page', () => {
    const { view, frame } = renderCanvas();
    const before = view.getState().camera?.zoom ?? 0;
    const notPrevented = fireEvent.wheel(frame, { deltaY: -200, ctrlKey: true });
    expect(view.getState().camera?.zoom).toBeGreaterThan(before);
    expect(notPrevented).toBe(false);
  });

  it('"Enquadrar mapa" brings the whole map back', async () => {
    const { view, frame } = renderCanvas();
    const framed = view.getState().camera;
    drag(frame, { x: 30, y: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Enquadrar mapa' }));
    expect(view.getState().camera).toEqual(framed);
  });

  it('an image that fails offers "Tentar de novo", and it asks for the image again', async () => {
    const { image } = renderCanvas();
    const firstSrc = image.getAttribute('src');
    fireEvent.error(image);
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu para carregar a imagem do mapa.');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    const retried = screen.getByRole('img', { name: 'Mundo' });
    expect(retried.getAttribute('src')).not.toBe(firstSrc);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('after "Tentar de novo" the wheel still moves the map', async () => {
    const { view, image, frame } = renderCanvas();
    fireEvent.error(image);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    const before = view.getState().camera?.zoom ?? 0;
    fireEvent.wheel(frame, { deltaY: -200, ctrlKey: true });
    expect(view.getState().camera?.zoom).toBeGreaterThan(before);
  });
});
