import { describe, expect, it } from 'vitest';
import { sheetBridgeHarness, settledHost } from '../support/sheet-bridge-harness';

const patch = (requestId: string, path: string[], value: unknown) => ({
  type: 'values.patch',
  requestId,
  patches: [{ path, value }],
});

describe('sheet bridge host: values.patch', () => {
  it('goes in the same 500 ms batch as values.set and is answered once it is saved', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends({ type: 'values.set', requestId: '1', changes: { forca: 16 } });
    await harness.frameSends(patch('2', ['hab', 'k3f9', 'efeito'], 'Cura'));
    expect(harness.port.ofType('result')).toEqual([]);
    harness.clock.advance(500);
    await settledHost();
    expect({
      saves: harness.api.saves.length,
      results: harness.port.ofType('result').map(({ requestId }) => requestId),
    }).toEqual({ saves: 1, results: ['1', '2'] });
  });

  it('the frame sees the path applied in its next state, the rest of the tree kept', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends({ type: 'ready', requestId: '0' });
    await harness.frameSends(patch('2', ['hab', 'k3f9', 'efeito'], 'Cura'));
    const states = harness.port.ofType('state');
    expect(states[states.length - 1]?.values).toEqual({
      forca: 14,
      hab: { k3f9: { efeito: 'Cura' } },
    });
  });

  it('without canEdit is FORBIDDEN and nothing is saved', async () => {
    const harness = await sheetBridgeHarness({ canEdit: false });
    await harness.frameSends(patch('2', ['hab', 'k3f9'], 1));
    harness.clock.advance(500);
    await settledHost();
    expect({
      codes: harness.port.ofType('error').map(({ code }) => code),
      saves: harness.api.saves,
    }).toEqual({ codes: ['FORBIDDEN'], saves: [] });
  });

  it('a forbidden key on the path is INVALID_MESSAGE', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends(patch('2', ['hab', '__proto__'], 1));
    expect(harness.port.ofType('error').map(({ code }) => code)).toEqual(['INVALID_MESSAGE']);
  });
});
