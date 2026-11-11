import { describe, expect, it } from 'vitest';
import { readSheetManifestText, sheetManifestText } from '@/lib/sheet-template-manifest';

const lork = {
  permissions: ['character:stats' as const],
  bars: [{ label: 'HP', color: 'ember' as const, max: 12 }],
  assets: [],
};

describe('sheet template manifest text', () => {
  it('the text of a manifest reads back as the same manifest', () =>
    expect(readSheetManifestText(sheetManifestText(lork))).toEqual({ ok: true, manifest: lork }));

  it('writes indented JSON with permissions before bars', () =>
    expect(sheetManifestText({ permissions: [], bars: [], assets: [] })).toBe(
      '{\n  "permissions": [],\n  "bars": []\n}',
    ));

  it('a text that is not JSON is not_json', () =>
    expect(readSheetManifestText('{ permissions: ')).toEqual({
      ok: false,
      problem: { kind: 'not_json' },
    }));

  it('an unknown permission is invalid with where it is and the contract message', () =>
    expect(readSheetManifestText('{"permissions":["network"],"bars":[]}')).toEqual({
      ok: false,
      problem: {
        kind: 'invalid',
        detail:
          'permissions.0: permission "network"; expected one of character:stats, character:portrait, sheet:images, documents:read, character:bars',
      },
    }));

  it('a JSON that is not an object is invalid', () => {
    const reading = readSheetManifestText('[]');
    expect(reading.ok ? 'accepted' : reading.problem.kind).toBe('invalid');
  });

  it('writes the assets only when the manifest has any, and reads them back', () => {
    const withFont = {
      ...lork,
      assets: [{ path: 'fontes/x.woff2', assetId: '00000000-0000-4000-8000-000000000001' }],
    };
    expect(sheetManifestText(withFont)).toContain('"assets"');
    expect(sheetManifestText(lork)).not.toContain('assets');
    expect(readSheetManifestText(sheetManifestText(withFont))).toEqual({
      ok: true,
      manifest: withFont,
    });
  });
});
