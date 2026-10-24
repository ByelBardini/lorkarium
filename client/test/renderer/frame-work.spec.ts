import { describe, expect, it } from 'vitest';
import { FrameWork } from '@/renderer/frame-work';

const NOTHING = { view: false, overlays: false, grid: false };
const PAN = { zoomChanged: false, gridBandLeft: false };

describe('FrameWork', () => {
  it('two new views before the frame are one whole draw, and the next frame has nothing', () => {
    const work = new FrameWork();
    work.viewChanged();
    work.viewChanged();
    expect(work.take()).toEqual({ view: true, overlays: true, grid: true });
    expect(work.take()).toEqual(NOTHING);
  });

  it('a pan inside the grid band redraws nothing', () => {
    const work = new FrameWork();
    work.cameraChanged(PAN);
    expect(work.take()).toEqual(NOTHING);
  });

  it('a pan that leaves the band redraws only the grid', () => {
    const work = new FrameWork();
    work.cameraChanged({ ...PAN, gridBandLeft: true });
    expect(work.take()).toEqual({ view: false, overlays: false, grid: true });
  });

  it('a zoom redraws the overlays and the grid, whose lines keep their width on screen', () => {
    const work = new FrameWork();
    work.cameraChanged({ ...PAN, zoomChanged: true });
    expect(work.take()).toEqual({ view: false, overlays: true, grid: true });
  });

  it('a new view and a pan in the same frame are one draw', () => {
    const work = new FrameWork();
    work.viewChanged();
    work.cameraChanged({ ...PAN, gridBandLeft: true });
    expect(work.take()).toEqual({ view: true, overlays: true, grid: true });
    expect(work.pending()).toBe(false);
  });

  // A full-canvas render per frame saturated the main thread under software WebGL (CI e2e).
  describe('render on demand', () => {
    it('a still board renders once, then never again', () => {
      const work = new FrameWork();
      expect(work.renderDue()).toBe(true);
      expect(work.renderDue()).toBe(false);
      work.take();
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
