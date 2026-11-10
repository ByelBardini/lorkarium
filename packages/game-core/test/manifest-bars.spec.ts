import { describe, expect, it } from 'vitest';
import { barLabelKey, missingManifestBars } from '../src/manifest-bars';

const CAP = 8;

function bars(...labels: string[]): { label: string }[] {
  return labels.map((label) => ({ label }));
}

describe('barLabelKey', () => {
  it('drops case, accents and edge spaces', () =>
    expect(barLabelKey('  Pontos de AÇÃO ')).toBe('pontos de acao'));
});

describe('missingManifestBars', () => {
  it('creates the manifest bars the holder lacks, in manifest order', () =>
    expect(missingManifestBars(bars('HP'), bars('HP', 'MP', 'EF', 'ES'), CAP)).toEqual({
      added: bars('MP', 'EF', 'ES'),
      skipped: [],
    }));

  it('keeps the manifest entry whole, with its color and maximum', () => {
    const manifest = [{ label: 'MP', color: 'ember', max: 12 }];
    expect(missingManifestBars([], manifest, CAP).added).toEqual([
      { label: 'MP', color: 'ember', max: 12 },
    ]);
  });

  it.each(['hp', ' HP ', 'Hp'])('an existing bar labelled %j counts as HP', (label) =>
    expect(missingManifestBars(bars(label), bars('HP', 'MP'), CAP).added).toEqual(bars('MP')),
  );

  it('an existing bar with an accent matches the manifest label without it', () =>
    expect(missingManifestBars(bars('Energia Física'), bars('energia fisica'), CAP).added).toEqual(
      [],
    ));

  it('6 bars and 3 missing creates 2 and reports the third as skipped', () =>
    expect(
      missingManifestBars(bars('A', 'B', 'C', 'D', 'E', 'F'), bars('MP', 'EF', 'ES'), CAP),
    ).toEqual({ added: bars('MP', 'EF'), skipped: ['ES'] }));

  it('a holder already at the cap creates nothing and skips every missing bar', () =>
    expect(
      missingManifestBars(bars('1', '2', '3', '4', '5', '6', '7', '8'), bars('HP', 'MP'), CAP),
    ).toEqual({ added: [], skipped: ['HP', 'MP'] }));

  it('an empty manifest creates nothing', () =>
    expect(missingManifestBars(bars('HP'), [], CAP)).toEqual({ added: [], skipped: [] }));

  it('a label repeated in the manifest is created once', () =>
    expect(missingManifestBars([], bars('MP', 'mp'), CAP).added).toEqual(bars('MP')));

  it.each([0, -1, 1.5, Number.NaN])('cap %s is a RangeError citing the value', (cap) =>
    expect(() => missingManifestBars([], bars('HP'), cap)).toThrow(
      new RangeError(`Bar cap ${String(cap)} is invalid: expected a whole number of at least 1.`),
    ),
  );
});
