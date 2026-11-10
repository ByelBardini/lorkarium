import { describe, expect, it } from 'vitest';
import {
  SAMPLE_SHEET_PREVIEW_DATA,
  SHEET_PREVIEW_BAR_ID,
  previewBarIdOf,
  previewBarsText,
  previewValuesText,
  readPreviewBarsText,
  readPreviewCharacter,
  readPreviewValuesText,
} from '@/lib/sheet-preview-data';

describe('the bars of the test data', () => {
  it('the sample shows as the master writes a bar, without id nor position', () => {
    expect(JSON.parse(previewBarsText(SAMPLE_SHEET_PREVIEW_DATA.bars))).toEqual(
      [...[{ label: 'PV', current: 20, max: 20, temp: 0, color: 'ember' }]].map((bar) => ({
        ...bar,
        visibility: 'everyone',
        display: 'number',
      })),
    );
  });

  it('read back, the shown text gives the same bars', () => {
    const text = previewBarsText(SAMPLE_SHEET_PREVIEW_DATA.bars);
    expect(readPreviewBarsText(text)).toEqual({ ok: true, value: SAMPLE_SHEET_PREVIEW_DATA.bars });
  });

  it('each bar gets the id of its position, and color and visibility default', () => {
    const read = readPreviewBarsText(
      '[{"label":"PV","current":7,"max":12},{"label":"MP","current":3,"max":6,"color":"steel"}]',
    );
    expect(read).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          id: SHEET_PREVIEW_BAR_ID,
          position: 0,
          label: 'PV',
          color: 'ember',
        }),
        expect.objectContaining({
          id: previewBarIdOf(1),
          position: 1,
          current: 3,
          color: 'steel',
        }),
      ],
    });
  });

  it('no bar at all is a valid list', () => {
    expect(readPreviewBarsText('[]')).toEqual({ ok: true, value: [] });
  });

  it('a text that is not JSON says so', () => {
    expect(readPreviewBarsText('[{label')).toEqual({ ok: false, problem: { kind: 'not_json' } });
  });

  it('a bar without max is refused, citing where', () => {
    const read = readPreviewBarsText('[{"label":"PV","current":7}]');
    expect(read).toEqual({
      ok: false,
      problem: { kind: 'invalid', detail: expect.stringMatching(/^0\.max: /) },
    });
  });

  it('nine bars are refused: a token holds at most eight', () => {
    const bar = { label: 'PV', current: 1, max: 1 };
    const read = readPreviewBarsText(JSON.stringify(Array.from({ length: 9 }, () => bar)));
    expect(read.ok).toBe(false);
  });

  it('the ids of the positions are distinct uuids', () => {
    expect(previewBarIdOf(0)).toBe('00000000-0000-4000-8000-000000000001');
    expect(previewBarIdOf(7)).toBe('00000000-0000-4000-8000-000000000008');
  });
});

describe('the values of the test data', () => {
  it('a JSON object is read as the values, and shows back as indented JSON', () => {
    expect(readPreviewValuesText('{"forca": 14, "pericias": {"atletismo": true}}')).toEqual({
      ok: true,
      value: { forca: 14, pericias: { atletismo: true } },
    });
    expect(previewValuesText({ forca: 14 })).toBe('{\n  "forca": 14\n}');
  });

  it('a list is not values', () => {
    expect(readPreviewValuesText('[1, 2]').ok).toBe(false);
  });

  it('a forbidden key is refused as the sheet refuses it', () => {
    expect(readPreviewValuesText('{"__proto__": 1}').ok).toBe(false);
  });

  it('a text that is not JSON says so', () => {
    expect(readPreviewValuesText('{forca: 14}')).toEqual({
      ok: false,
      problem: { kind: 'not_json' },
    });
  });
});

describe('the character of the test data', () => {
  it('reads the name, AC and DC as typed', () => {
    expect(readPreviewCharacter({ name: 'Lyra', armorClass: '14', difficultyClass: '12' })).toEqual(
      {
        ok: true,
        value: { name: 'Lyra', armorClass: 14, difficultyClass: 12 },
      },
    );
  });

  it('a blank AC or DC is none', () => {
    const read = readPreviewCharacter({ name: 'Lyra', armorClass: ' ', difficultyClass: '' });
    expect(read).toEqual({
      ok: true,
      value: { name: 'Lyra', armorClass: null, difficultyClass: null },
    });
  });

  it('a blank name is refused, citing the field', () => {
    const read = readPreviewCharacter({ name: '  ', armorClass: '10', difficultyClass: '10' });
    expect(read).toEqual({
      ok: false,
      problem: { kind: 'invalid', detail: expect.stringMatching(/^name: /) },
    });
  });

  it.each([['-1'], ['1000'], ['2.5'], ['abc']])('an AC of %s is refused', (armorClass) => {
    expect(readPreviewCharacter({ name: 'Lyra', armorClass, difficultyClass: '' }).ok).toBe(false);
  });
});
