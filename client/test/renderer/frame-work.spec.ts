import { describe, expect, it } from 'vitest';
import { FrameWork, type CameraChange } from '@/renderer/frame-work';

const NOTHING = { view: false, overlays: false, grid: false, zoom: false };
const ZOOM_SETTLED = { view: false, overlays: true, grid: true, zoom: true };
const PAN: CameraChange = { zoom: 1, gridBandLeft: false, atMs: 0 };

function zoomedTo(zoom: number, atMs: number): CameraChange {
  return { zoom, gridBandLeft: false, atMs };
}

describe('FrameWork', () => {
  it('two new views before the frame are one whole draw, and the next frame has nothing', () => {
    const work = new FrameWork();
    work.viewChanged();
    work.viewChanged();
    expect(work.take(0)).toEqual({ view: true, overlays: true, grid: true, zoom: false });
    expect(work.take(16)).toEqual(NOTHING);
  });

  it('a pan inside the grid band redraws nothing', () => {
    const work = new FrameWork();
    work.cameraChanged(PAN);
    expect(work.take(0)).toEqual(NOTHING);
  });

  it('a pan that leaves the band redraws the grid and the overlays cut to it', () => {
    const work = new FrameWork();
    work.cameraChanged({ ...PAN, gridBandLeft: true });
    expect(work.take(0)).toEqual({ view: false, overlays: true, grid: true, zoom: false });
  });

  it('a new view and a pan in the same frame are one draw', () => {
    const work = new FrameWork();
    work.viewChanged();
    work.cameraChanged({ ...PAN, gridBandLeft: true });
    expect(work.take(0)).toEqual({ view: true, overlays: true, grid: true, zoom: false });
    expect(work.pending()).toBe(false);
  });

  describe('the zoom waits for the gesture to settle', () => {
    it('50 ms into a small zoom nothing is redrawn, but the scaled world still renders', () => {
      const work = new FrameWork();
      work.renderDue();
      work.cameraChanged(zoomedTo(1.1, 0));
      expect(work.take(50)).toEqual(NOTHING);
      expect(work.renderDue()).toBe(true);
    });

    it('130 ms after the last zoom the overlays, the grid and the strips follow it', () => {
      const work = new FrameWork();
      work.cameraChanged(zoomedTo(1.1, 0));
      work.take(50);
      expect(work.take(130)).toEqual(ZOOM_SETTLED);
      expect(work.take(300)).toEqual(NOTHING);
    });

    it('the settled frame renders, since it redrew lines', () => {
      const work = new FrameWork();
      work.cameraChanged(zoomedTo(1.1, 0));
      work.take(50);
      work.renderDue();
      work.take(130);
      expect(work.renderDue()).toBe(true);
    });

    it('every wheel tick of the gesture pushes the settle back', () => {
      const work = new FrameWork();
      work.cameraChanged(zoomedTo(1.05, 0));
      work.cameraChanged(zoomedTo(1.1, 100));
      expect(work.take(150)).toEqual(NOTHING);
      expect(work.take(220)).toEqual(ZOOM_SETTLED);
    });

    it('a zoom from 1 to 1.3 within 10 ms settles at once', () => {
      const work = new FrameWork();
      work.cameraChanged(zoomedTo(1.3, 0));
      expect(work.take(10)).toEqual(ZOOM_SETTLED);
    });

    it('a new view mid-gesture does not wait: view, overlays and the zoom are drawn now', () => {
      const work = new FrameWork();
      work.cameraChanged(zoomedTo(1.1, 0));
      work.viewChanged();
      expect(work.take(10)).toEqual({ view: true, overlays: true, grid: true, zoom: true });
      expect(work.take(200)).toEqual(NOTHING);
    });

    it('stays pending while a zoom waits, so the flush comes back next frame', () => {
      const work = new FrameWork();
      work.cameraChanged(zoomedTo(1.1, 0));
      expect(work.pending()).toBe(true);
      work.take(50);
      expect(work.pending()).toBe(true);
      work.take(130);
      expect(work.pending()).toBe(false);
    });

    it('zooming back to the drawn zoom before it settles redraws nothing', () => {
      const work = new FrameWork();
      work.cameraChanged(zoomedTo(1.1, 0));
      work.cameraChanged(zoomedTo(1, 20));
      expect(work.take(200)).toEqual(NOTHING);
    });

    it('the band left mid-gesture draws the overlays at the current zoom, settling it', () => {
      const work = new FrameWork();
      work.cameraChanged({ zoom: 0.9, gridBandLeft: true, atMs: 0 });
      expect(work.take(10)).toEqual(ZOOM_SETTLED);
    });
  });

  // A full-canvas render per frame saturated the main thread under software WebGL (CI e2e).
  describe('render on demand', () => {
    it('a still board renders once, then never again', () => {
      const work = new FrameWork();
      expect(work.renderDue()).toBe(true);
      expect(work.renderDue()).toBe(false);
      work.take(0);
      expect(work.renderDue()).toBe(false);
    });

    it('a new view, a pan or a touch of the scene renders the next frame once', () => {
      const work = new FrameWork();
      work.renderDue();
      work.viewChanged();
      expect(work.renderDue()).toBe(true);
      work.cameraChanged(PAN);
      expect(work.renderDue()).toBe(true);
      work.sceneTouched();
      expect(work.renderDue()).toBe(true);
      expect(work.renderDue()).toBe(false);
    });

    it('a touching listener runs the listener and renders the next frame', () => {
      const work = new FrameWork();
      work.renderDue();
      const heard: string[] = [];
      work.touching((event: string) => heard.push(event))('pointermove');
      expect(heard).toEqual(['pointermove']);
      expect(work.renderDue()).toBe(true);
    });
  });
});
