import { describe, expect, it } from 'vitest';
import { zoomSettleOf } from '@/renderer/zoom-settle';

describe('zoomSettleOf', () => {
  it('a zoom still for 130 ms asks for the redraw', () => {
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 1.1, stillForMs: 130 })).toBe('redraw');
  });

  it('a zoom 30% past the drawn one redraws at once, even mid-gesture', () => {
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 1.3, stillForMs: 10 })).toBe('redraw');
  });

  it('zooming out uses the same limit, by the ratio and not the difference', () => {
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 0.79, stillForMs: 10 })).toBe('redraw');
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 0.81, stillForMs: 10 })).toBe('wait');
  });

  it('one button step (25% in or out) settles in the same frame', () => {
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 1.25, stillForMs: 0 })).toBe('redraw');
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 1 / 1.25, stillForMs: 0 })).toBe('redraw');
  });

  it('a small zoom still moving waits, up to 119 ms', () => {
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 1.2, stillForMs: 119 })).toBe('wait');
  });

  it('exactly 120 ms still is settled', () => {
    expect(zoomSettleOf({ drawnZoom: 1, zoom: 1.2, stillForMs: 120 })).toBe('redraw');
  });

  it('the zoom already drawn is idle, however long ago it changed', () => {
    expect(zoomSettleOf({ drawnZoom: 1.5, zoom: 1.5, stillForMs: 0 })).toBe('idle');
  });

  it('a zoom of zero or less throws, citing the value', () => {
    expect(() => zoomSettleOf({ drawnZoom: 1, zoom: 0, stillForMs: 0 })).toThrow(/0.*zoom > 0/);
    expect(() => zoomSettleOf({ drawnZoom: -2, zoom: 1, stillForMs: 0 })).toThrow(/-2.*zoom > 0/);
  });
});
