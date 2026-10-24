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
});
