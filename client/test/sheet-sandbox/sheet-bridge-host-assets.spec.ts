import { describe, expect, it } from 'vitest';
import { LYRA_PORTRAIT } from '../support/assets-api-fake';
import { VHARN } from '../support/campaigns-api-fake';
import { LYRA_SHEET_ID } from '../support/sheet-fixtures';
import { sheetBridgeHarness, type SheetBridgeHarness } from '../support/sheet-bridge-harness';

const IMAGES = ['sheet:images'] as const;
const STORED_ID = '5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b';
const upload = (bytes = new Uint8Array([1, 2, 3]).buffer) => ({
  type: 'assets.upload',
  requestId: '1',
  image: { type: 'image/png', bytes },
});
const read = (assetId = STORED_ID) => ({ type: 'assets.read', requestId: '2', assetId });

function codesOf(harness: SheetBridgeHarness): string[] {
  return harness.port.ofType('error').map(({ code }) => code);
}

describe('sheet bridge host: assets.upload', () => {
  it("sends the bytes by the sheet's image route and answers the asset id", async () => {
    const harness = await sheetBridgeHarness({ permissions: IMAGES });
    harness.api.uploadResult = { ok: true, value: LYRA_PORTRAIT };
    const bytes = new Uint8Array([9, 8, 7]).buffer;
    await harness.frameSends(upload(bytes));
    expect({ uploads: harness.api.uploads, results: harness.port.ofType('result') }).toEqual({
      uploads: [{ campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, bytes, type: 'image/png' }],
      results: [{ type: 'result', requestId: '1', value: { assetId: LYRA_PORTRAIT.id } }],
    });
  });

  it('without sheet:images is PERMISSION_NOT_DECLARED with no upload', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends(upload());
    expect({ codes: codesOf(harness), uploads: harness.api.uploads }).toEqual({
      codes: ['PERMISSION_NOT_DECLARED'],
      uploads: [],
    });
  });

  it('without canEdit is FORBIDDEN with no upload', async () => {
    const harness = await sheetBridgeHarness({ permissions: IMAGES, canEdit: false });
    await harness.frameSends(upload());
    expect({ codes: codesOf(harness), uploads: harness.api.uploads }).toEqual({
      codes: ['FORBIDDEN'],
      uploads: [],
    });
  });

  it.each([
    ['too_large', 'TOO_LARGE'],
    ['unsupported_image', 'UNSUPPORTED_IMAGE'],
  ] as const)("the server's %s comes back as %s", async (kind, code) => {
    const harness = await sheetBridgeHarness({ permissions: IMAGES });
    harness.api.uploadResult = { ok: false, failure: { kind } };
    await harness.frameSends(upload());
    expect(codesOf(harness)).toEqual([code]);
  });

  it('an eleventh upload in 60 s is RATE_LIMITED, and the window reopens', async () => {
    const harness = await sheetBridgeHarness({ permissions: IMAGES });
    harness.api.uploadResult = { ok: true, value: LYRA_PORTRAIT };
    for (let index = 0; index < 11; index += 1) await harness.frameSends(upload());
    const limited = codesOf(harness);
    harness.clock.advance(60_000);
    await harness.frameSends(upload());
    expect({ limited, uploads: harness.api.uploads.length }).toEqual({
      limited: ['RATE_LIMITED'],
      uploads: 11,
    });
  });
});

describe('sheet bridge host: assets.read', () => {
  it('answers the bytes and the type of the image', async () => {
    const harness = await sheetBridgeHarness({ permissions: IMAGES });
    const bytes = new Uint8Array([4, 5]).buffer;
    harness.api.images[STORED_ID] = { type: 'image/webp', bytes };
    await harness.frameSends(read());
    expect({ reads: harness.api.imageReads, results: harness.port.ofType('result') }).toEqual({
      reads: [STORED_ID],
      results: [{ type: 'result', requestId: '2', value: { type: 'image/webp', bytes } }],
    });
  });

  it('an image this viewer may not read is ASSET_NOT_FOUND', async () => {
    const harness = await sheetBridgeHarness({ permissions: IMAGES });
    await harness.frameSends(read());
    expect(codesOf(harness)).toEqual(['ASSET_NOT_FOUND']);
  });

  it('a read-only viewer still reads (it shows what the sheet shows)', async () => {
    const harness = await sheetBridgeHarness({ permissions: IMAGES, canEdit: false });
    harness.api.images[STORED_ID] = { type: 'image/png', bytes: new ArrayBuffer(1) };
    await harness.frameSends(read());
    expect(harness.port.ofType('result')).toHaveLength(1);
  });

  it('without sheet:images is PERMISSION_NOT_DECLARED with no read', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends(read());
    expect({ codes: codesOf(harness), reads: harness.api.imageReads }).toEqual({
      codes: ['PERMISSION_NOT_DECLARED'],
      reads: [],
    });
  });
});
