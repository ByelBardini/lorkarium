import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SHEET_PREVIEW_DATA,
  previewBarIdOf,
  type SheetPreviewData,
} from '@/lib/sheet-preview-data';
import { createSheetPreviewHost, type SheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';

// Lyra, PV 7/12 and MP 3/6, strength 14.
const LYRA_DATA: SheetPreviewData = {
  character: { name: 'Lyra', armorClass: 13, difficultyClass: 11 },
  bars: [
    { ...SAMPLE_SHEET_PREVIEW_DATA.bars[0]!, current: 7, max: 12 },
    {
      ...SAMPLE_SHEET_PREVIEW_DATA.bars[0]!,
      ...{ id: previewBarIdOf(1), position: 1, label: 'MP', current: 3, max: 6 },
    },
  ],
  values: { forca: 14 },
};

type Opened = Readonly<{
  port: SheetHostPortFake;
  host: SheetPreviewHost;
  changes: SheetPreviewData[];
}>;

function openPreview(ready = true): Opened {
  const port = new SheetHostPortFake();
  const changes: SheetPreviewData[] = [];
  const host = createSheetPreviewHost(port, {
    data: LYRA_DATA,
    onDataChange: (data) => changes.push(data),
    permissions: ['character:stats'],
  });
  if (ready) port.fromFrame({ type: 'ready', requestId: '1' });
  return { port, host, changes };
}

describe('sheet preview host with test data', () => {
  it('the first state is the test data: the character, its bars and the values', () => {
    const { port } = openPreview();
    expect(port.ofType('state')).toEqual([
      expect.objectContaining({
        token: { name: 'Lyra', image: null },
        bars: LYRA_DATA.bars,
        values: { forca: 14 },
        character: LYRA_DATA.character,
      }),
    ]);
  });

  it('new data from the panel goes to the frame as a new state, unannounced back', () => {
    const { port, host, changes } = openPreview();
    host.setData({ ...LYRA_DATA, character: { ...LYRA_DATA.character, armorClass: 14 } });
    expect(port.ofType('state').at(-1)?.character?.armorClass).toBe(14);
    expect(changes).toEqual([]);
  });

  it('the same data again sends nothing', () => {
    const { port, host } = openPreview();
    host.setData(LYRA_DATA);
    expect(port.ofType('state')).toHaveLength(1);
  });

  it('new data before ready waits for the first state', () => {
    const { port, host } = openPreview(false);
    host.setData({ ...LYRA_DATA, values: { forca: 18 } });
    expect(port.ofType('state')).toEqual([]);
    port.fromFrame({ type: 'ready', requestId: '1' });
    expect(port.ofType('state')[0]?.values).toEqual({ forca: 18 });
  });

  it("the frame's character.set changes the data the panel shows", () => {
    const { port, changes } = openPreview();
    port.fromFrame({ type: 'character.set', requestId: '2', changes: { armorClass: 14 } });
    expect(changes.at(-1)?.character).toEqual({ ...LYRA_DATA.character, armorClass: 14 });
  });

  it("the frame's values.patch changes the values of the data", () => {
    const { port, changes } = openPreview();
    port.fromFrame({
      type: 'values.patch',
      requestId: '2',
      patches: [{ path: ['notas'], value: 'x' }],
    });
    expect(changes.at(-1)?.values).toEqual({ forca: 14, notas: 'x' });
  });

  it('bars.adjust by a label moves only that bar of the data', () => {
    const { port, changes } = openPreview();
    port.fromFrame({
      type: 'bars.adjust',
      requestId: '2',
      bar: 'mp',
      change: { op: 'add', amount: 2 },
    });
    expect(changes.at(-1)?.bars.map(({ label, current }) => [label, current])).toEqual([
      ['PV', 7],
      ['MP', 5],
    ]);
  });

  it('bars.spend pays from every bar named, or none', () => {
    const { port, changes } = openPreview();
    const costs = [
      { bar: 'PV', amount: 2 },
      { bar: 'MP', amount: 4 },
    ];
    port.fromFrame({ type: 'bars.spend', requestId: '2', costs });
    expect(port.ofType('error')).toEqual([expect.objectContaining({ code: 'INSUFFICIENT_BAR' })]);
    port.fromFrame({
      type: 'bars.spend',
      requestId: '3',
      costs: [costs[0], { bar: 'MP', amount: 3 }],
    });
    expect(changes.at(-1)?.bars.map(({ current }) => current)).toEqual([5, 0]);
    expect(changes).toHaveLength(1);
  });

  it('bars.spend from one bar keeps the others as they were', () => {
    const { port, changes } = openPreview();
    port.fromFrame({ type: 'bars.spend', requestId: '2', costs: [{ bar: 'MP', amount: 1 }] });
    expect(changes.at(-1)?.bars.map(({ label, current }) => [label, current])).toEqual([
      ['PV', 7],
      ['MP', 2],
    ]);
  });

  it('a refused request changes nothing and says nothing to the panel', () => {
    const { port, changes } = openPreview();
    port.fromFrame({
      type: 'bars.adjust',
      requestId: '2',
      bar: 'EF',
      change: { op: 'add', amount: 1 },
    });
    port.fromFrame({ type: 'dice.roll', requestId: '3', expression: '1d20' });
    expect(changes).toEqual([]);
  });

  it('a test data with no bar gives the frame none, and a bar request is BAR_NOT_FOUND', () => {
    const port = new SheetHostPortFake();
    createSheetPreviewHost(port, { data: { ...LYRA_DATA, bars: [] } });
    port.fromFrame({ type: 'ready', requestId: '1' });
    port.fromFrame({
      type: 'bars.adjust',
      requestId: '2',
      bar: 'PV',
      change: { op: 'add', amount: 1 },
    });
    expect(port.ofType('state')[0]?.bars).toEqual([]);
    expect(port.ofType('error')).toEqual([expect.objectContaining({ code: 'BAR_NOT_FOUND' })]);
  });
});
