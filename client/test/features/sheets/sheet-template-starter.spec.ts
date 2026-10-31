import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_SHEET_SOURCE } from '@/features/sheets/sheet-template-starter';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake, SheetPortFake } from '../../support/sheet-frame-fakes';

const PV = {
  id: 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b',
  position: 0,
  label: 'PV',
  current: 10,
  max: 10,
  color: 'ember',
  visibility: 'everyone',
  display: 'number',
};

let port: SheetPortFake;

// Runs the starter as the frame would: its HTML in the document, the bootstrap's SDK as
// `lorkarium`, then the author's JS.
beforeEach(() => {
  document.body.innerHTML = STARTER_SHEET_SOURCE.html;
  const frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
  new Function('lorkarium', STARTER_SHEET_SOURCE.js)(frame.sdk);
});

afterEach(() => {
  document.body.innerHTML = '';
});

function deliverState(token: unknown, values: Record<string, unknown> = {}): void {
  port.deliver({ type: 'state', token, bars: token ? [PV] : [], values, canEdit: true });
}

function element(id: string): HTMLInputElement {
  const found = document.getElementById(id);
  if (!(found instanceof HTMLElement)) throw new Error(`the starter lost #${id}`);
  return found as HTMLInputElement;
}

describe('STARTER_SHEET_SOURCE', () => {
  it('says ready and draws the token, the bar "PV" and the stored Força', () => {
    deliverState({ name: 'Lyra', image: null }, { forca: 14 });
    expect({
      sent: port.sent,
      name: element('nome').textContent,
      pv: element('pv').textContent,
      forca: element('forca').value,
    }).toEqual({
      sent: [{ type: 'ready', requestId: '1' }],
      name: 'Lyra',
      pv: '10 / 10',
      forca: '14',
    });
  });

  it('"−5 PV" adjusts the bar by its name and "Rolar ataque" rolls 1d20+5', () => {
    deliverState({ name: 'Lyra', image: null });
    element('dano').click();
    element('ataque').click();
    expect(port.sent.slice(1)).toEqual([
      { type: 'bars.adjust', requestId: '2', bar: 'PV', change: { op: 'add', amount: -5 } },
      { type: 'dice.roll', requestId: '3', expression: '1d20+5', label: 'Ataque' },
    ]);
  });

  it('Força saves on change', () => {
    deliverState({ name: 'Lyra', image: null });
    element('forca').value = '16';
    element('forca').dispatchEvent(new Event('change'));
    expect(port.sent.at(-1)).toEqual({
      type: 'values.set',
      requestId: '2',
      changes: { forca: 16 },
    });
  });

  it('without a stored Força the field shows 10', () => {
    deliverState({ name: 'Lyra', image: null });
    expect(element('forca').value).toBe('10');
  });

  it('a sheet with no token still draws, with no bar and no error', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deliverState({ name: 'Lyra', image: null });
    deliverState(null);
    expect({
      drawn: [element('nome').textContent, element('pv').textContent],
      errors: logged.mock.calls.length,
    }).toEqual({ drawn: ['Ficha', '–'], errors: 0 });
    logged.mockRestore();
  });
});
