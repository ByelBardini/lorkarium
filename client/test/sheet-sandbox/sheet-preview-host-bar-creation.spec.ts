import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SHEET_PREVIEW_DATA,
  previewBarIdOf,
  type SheetPreviewData,
} from '@/lib/sheet-preview-data';
import { createSheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';

const create = (bar: unknown) => ({ type: 'bars.create', requestId: '5', bar });

function openPreview(data: SheetPreviewData = SAMPLE_SHEET_PREVIEW_DATA) {
  const port = new SheetHostPortFake();
  const changes: SheetPreviewData[] = [];
  createSheetPreviewHost(port, {
    data,
    onDataChange: (next) => changes.push(next),
    permissions: ['character:bars'],
  });
  port.fromFrame({ type: 'ready', requestId: '1' });
  return { port, changes };
}

// The sample's PV and 7 more: the cap of 8.
function fullBars(): SheetPreviewData {
  const [pv] = SAMPLE_SHEET_PREVIEW_DATA.bars;
  const more = [1, 2, 3, 4, 5, 6, 7].map((position) => ({
    ...pv!,
    ...{ id: previewBarIdOf(position), position, label: `B${position}` },
  }));
  return { ...SAMPLE_SHEET_PREVIEW_DATA, bars: [pv!, ...more] };
}

describe('sheet preview host: bars.create', () => {
  it('adds the bar full after the test bars and answers its id', () => {
    const { port, changes } = openPreview();

    port.fromFrame(create({ label: 'Fôlego', max: 6 }));

    const added = changes[0]?.bars[1];
    expect(added).toMatchObject({
      ...{ id: previewBarIdOf(1), position: 1, label: 'Fôlego' },
      ...{ current: 6, max: 6, color: 'gold' },
    });
    expect(port.ofType('result').at(-1)).toEqual({
      type: 'result',
      requestId: '5',
      value: { barId: previewBarIdOf(1), created: true },
    });
    expect(port.ofType('state').at(-1)?.bars).toHaveLength(2);
  });

  it('a bar already there under that label answers its id with created false and changes nothing', () => {
    const { port, changes } = openPreview();

    port.fromFrame(create({ label: ' pv ', max: 99 }));

    expect(port.ofType('result').at(-1)?.value).toEqual({
      barId: SAMPLE_SHEET_PREVIEW_DATA.bars[0]?.id,
      created: false,
    });
    expect(changes).toEqual([]);
  });

  it('with 8 bars it is BAR_LIMIT citing the label, and the bars stay', () => {
    const { port, changes } = openPreview(fullBars());

    port.fromFrame(create({ label: 'Fôlego', max: 6 }));

    expect(port.ofType('error')).toEqual([
      {
        type: 'error',
        requestId: '5',
        code: 'BAR_LIMIT',
        message: 'Bar "Fôlego" does not fit: the holder has 8 bars; expected fewer than 8',
      },
    ]);
    expect(changes).toEqual([]);
  });

  it('a draft without character:bars is PERMISSION_NOT_DECLARED', () => {
    const port = new SheetHostPortFake();
    createSheetPreviewHost(port, {});
    port.fromFrame(create({ label: 'Fôlego', max: 6 }));
    expect(port.ofType('error').map(({ code }) => code)).toEqual(['PERMISSION_NOT_DECLARED']);
  });
});
