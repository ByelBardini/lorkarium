import type { SheetManifestPermissionDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { createSheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';

const KEPT_ID = '3c2b1a0f-9e8d-4c7b-8a69-5f4e3d2c1b0a';
const ALL: readonly SheetManifestPermissionDto[] = [
  'character:stats',
  'character:portrait',
  'sheet:images',
];

function readyPreview(permissions: readonly SheetManifestPermissionDto[] = ALL) {
  const port = new SheetHostPortFake();
  createSheetPreviewHost(port, { permissions, newAssetId: () => KEPT_ID });
  port.fromFrame({ type: 'ready', requestId: '1' });
  return port;
}

const png = () => ({ type: 'image/png', bytes: new Uint8Array([1, 2]).buffer });

describe('sheet preview host: the new requests', () => {
  it('the sample state carries the sample character', () =>
    expect(readyPreview().ofType('state')[0]?.character).toEqual({
      name: 'Exemplo',
      armorClass: 10,
      difficultyClass: 10,
    }));

  it('character.set changes the sample character in the next state', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'character.set', requestId: '2', changes: { armorClass: 14 } });
    expect(port.ofType('state').at(-1)?.character?.armorClass).toBe(14);
  });

  it('what the manifest does not declare is refused as in the room', () => {
    const port = readyPreview([]);
    port.fromFrame({ type: 'character.set', requestId: '2', changes: { armorClass: 14 } });
    expect(port.ofType('error').map(({ code }) => code)).toEqual(['PERMISSION_NOT_DECLARED']);
  });

  it('character.setImage shows the bytes as the token image', () => {
    const port = readyPreview();
    const image = png();
    port.fromFrame({ type: 'character.setImage', requestId: '2', image });
    expect(port.ofType('state').at(-1)?.token?.image).toEqual(image);
  });

  it('assets.upload keeps the image here and assets.read gives it back', () => {
    const port = readyPreview();
    const image = png();
    port.fromFrame({ type: 'assets.upload', requestId: '2', image });
    port.fromFrame({ type: 'assets.read', requestId: '3', assetId: KEPT_ID });
    expect(port.ofType('result').slice(1)).toEqual([
      { type: 'result', requestId: '2', value: { assetId: KEPT_ID } },
      { type: 'result', requestId: '3', value: image },
    ]);
  });

  it('assets.read of an image never sent is ASSET_NOT_FOUND', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'assets.read', requestId: '3', assetId: KEPT_ID });
    expect(port.ofType('error').map(({ code }) => code)).toEqual(['ASSET_NOT_FOUND']);
  });

  it('bars.spend pays from the sample bar, and a cost past it is INSUFFICIENT_BAR', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'bars.spend', requestId: '2', costs: [{ bar: 'PV', amount: 6 }] });
    port.fromFrame({ type: 'bars.spend', requestId: '3', costs: [{ bar: 'PV', amount: 15 }] });
    expect({
      current: port.ofType('state').at(-1)?.bars[0]?.current,
      error: port.ofType('error')[0],
    }).toEqual({
      current: 14,
      error: {
        type: 'error',
        requestId: '3',
        code: 'INSUFFICIENT_BAR',
        message: 'Bar "PV" has 14; expected at least 15',
      },
    });
  });

  it('values.patch changes only its path', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'values.set', requestId: '2', changes: { hab: { a: 1, b: 2 } } });
    port.fromFrame({
      type: 'values.patch',
      requestId: '3',
      patches: [{ path: ['hab', 'b'], value: 5 }],
    });
    expect(port.ofType('state').at(-1)?.values).toEqual({ hab: { a: 1, b: 5 } });
  });
});
