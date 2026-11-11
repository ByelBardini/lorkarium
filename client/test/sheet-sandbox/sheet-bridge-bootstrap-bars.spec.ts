import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake, SheetPortFake } from '../support/sheet-frame-fakes';

const BAR_ID = '10000000-0000-4000-8000-0000000000b1';

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

// The exact text the srcdoc embeds, run with the fake as its `window`.
beforeEach(() => {
  frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
});

describe('sheet bridge bootstrap: bars.create', () => {
  it('sends the bar as given, with no color the host fills in', () => {
    void frame.sdk.bars.create({ label: 'Fôlego', max: 6 });
    expect(port.sent).toEqual([
      { type: 'bars.create', requestId: '1', bar: { label: 'Fôlego', max: 6 } },
    ]);
  });

  it('resolves with the bar id and whether it was created', async () => {
    const created = frame.sdk.bars.create({ label: 'Fôlego', max: 6, color: 'moss' });
    port.deliver({ type: 'result', requestId: '1', value: { barId: BAR_ID, created: false } });
    expect(await created).toEqual({ barId: BAR_ID, created: false });
  });

  it('rejects with the code of a refusal', async () => {
    const created = frame.sdk.bars.create({ label: 'Fôlego', max: 6 });
    const message = 'Bar "Fôlego" does not fit: the holder has 8 bars; expected fewer than 8';
    port.deliver({ type: 'error', requestId: '1', code: 'BAR_LIMIT', message });
    await expect(created).rejects.toMatchObject({ code: 'BAR_LIMIT', message });
  });
});
