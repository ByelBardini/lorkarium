import { describe, expect, it } from 'vitest';
import { SDK_CALLS } from '@/features/sheets/sheet-api-reference-content';
import { sheetSdkCompletionSource, type SdkCompletion } from '@/lib/sheet-sdk-completions';
import { SHEET_BRIDGE_BOOTSTRAP, type LorkariumSdk } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake } from '../support/sheet-frame-fakes';

const complete = sheetSdkCompletionSource(SDK_CALLS);

function labelsAt(text: string): string[] {
  return complete(text)?.options.map((option) => option.label) ?? [];
}

function optionAt(text: string, label: string): SdkCompletion | undefined {
  return complete(text)?.options.find((option) => option.label === label);
}

function installedSdk(): LorkariumSdk {
  const frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  return frame.sdk;
}

// Every function of the SDK the frame gets, as "bars.adjust".
function sdkFunctionPaths(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, member]: [string, unknown]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof member === 'function') return [path];
    return typeof member === 'object' && member !== null ? sdkFunctionPaths(member, path) : [];
  });
}

// Every function the completions offer, walking from `lorkarium.`.
function completedFunctionPaths(prefix = 'lorkarium'): string[] {
  return (complete(`${prefix}.`)?.options ?? []).flatMap((option) => {
    const path = `${prefix}.${option.label}`;
    return option.kind === 'function' ? [path] : completedFunctionPaths(path);
  });
}

describe('sheetSdkCompletionSource', () => {
  it('"lorkarium." offers the top of the SDK in the order of the reference', () => {
    expect(labelsAt('lorkarium.')).toEqual([
      'ready',
      'onState',
      'values',
      'lists',
      'bars',
      'dice',
      'html',
      'character',
      'assets',
      'documents',
    ]);
  });

  it('"lorkarium.documents." offers the three document reads', () =>
    expect(labelsAt('lorkarium.documents.')).toEqual(['list', 'tabs', 'readTab']));

  it('"lorkarium.bars." offers the bar calls, replacing from the end of the text', () => {
    const text = '  const pv = lorkarium.bars.';
    expect(labelsAt(text)).toEqual(['list', 'get', 'adjust', 'spend', 'create']);
    expect(complete(text)?.from).toBe(text.length);
  });

  it('a half-typed name is replaced from where it starts', () => {
    const text = 'await lorkarium.bars.ad';
    expect(complete(text)?.from).toBe(text.length - 'ad'.length);
    expect(labelsAt(text)).toContain('adjust');
  });

  it('a call carries the signature and the summary of the reference', () => {
    const adjust = SDK_CALLS.find(({ signature }) =>
      signature.startsWith('lorkarium.bars.adjust('),
    );
    expect(optionAt('lorkarium.bars.', 'adjust')).toEqual({
      label: 'adjust',
      kind: 'function',
      signature: adjust?.signature,
      summary: adjust?.summary,
    });
  });

  it('a group is a namespace that lists its calls', () => {
    expect(optionAt('lorkarium.', 'character')).toEqual({
      label: 'character',
      kind: 'namespace',
      signature: 'lorkarium.character',
      summary: 'Funções: get, set, setImage',
    });
  });

  it('"window.lorkarium." offers the same as "lorkarium."', () => {
    expect(labelsAt('window.lorkarium.')).toEqual(labelsAt('lorkarium.'));
  });

  it.each([
    ['no dot yet', 'lorkarium'],
    ['another object', 'document.'],
    ['a longer name ending in lorkarium', 'meulorkarium.'],
    ['a group the SDK does not have', 'lorkarium.nada.'],
    ['past a call', "lorkarium.bars.get('PV')."],
    ['a function, not a group', 'lorkarium.ready.'],
  ])('%s offers nothing', (_case, text) => {
    expect(complete(text)).toBeNull();
  });

  it('a reference signature outside lorkarium is refused, citing it', () => {
    const call = { signature: 'window.alert(texto)', summary: 'x' };
    expect(() => sheetSdkCompletionSource([call])).toThrow(/window\.alert\(texto\).*lorkarium\./);
  });

  it('offers exactly the functions of the SDK the frame gets', () => {
    const sdk = sdkFunctionPaths(installedSdk()).map((path) => `lorkarium.${path}`);
    expect(completedFunctionPaths().sort()).toEqual(sdk.sort());
  });
});
