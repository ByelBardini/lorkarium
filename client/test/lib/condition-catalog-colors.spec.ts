import { describe, expect, it } from 'vitest';
import { tokensOverCatalog, tokensShowingDefinition } from '@/lib/condition-catalog';
import { linkedLyra } from '../support/cast-fixtures';
import {
  activeCondition,
  conditionDefinition,
  kael,
  lyra,
} from '../support/table-session-fixtures';

// Envenenado on Kael with 2 rounds left, painted by its nature (no color yet).
const poisonedOn = (color: 'ember' | 'sky' | null = null) =>
  activeCondition({ id: 'd1d2d3d4-e5e6-4f7f-8a8a-9b9b0c0c1d1d', remainingRounds: 2, color });

describe('the color of the active conditions after a definition update', () => {
  it('a color given to the definition reaches every token holding it, rounds kept', () => {
    const tokens = [kael({ conditions: [poisonedOn()] }), lyra({ conditions: [poisonedOn()] })];
    const shown = tokensShowingDefinition(tokens, conditionDefinition({ color: 'ember' }));
    expect(
      shown.map(({ conditions }) => [conditions[0]?.color, conditions[0]?.remainingRounds]),
    ).toEqual([
      ['ember', 2],
      ['ember', 2],
    ]);
  });

  it('a color taken off the definition (back to the nature) clears it on the tokens', () => {
    const [token] = tokensShowingDefinition(
      [kael({ conditions: [poisonedOn('sky')] })],
      conditionDefinition({ color: null }),
    );
    expect(token?.conditions[0]?.color).toBeNull();
  });

  it('a color changed alone (everything else as saved) still reaches the token', () => {
    const [token] = tokensShowingDefinition(
      [kael({ conditions: [poisonedOn('sky')] })],
      conditionDefinition({ color: 'ember' }),
    );
    expect(token?.conditions[0]).toMatchObject({ name: 'Envenenado', color: 'ember' });
  });

  it('the same color saved again gives back the same tokens array', () => {
    const tokens = [kael({ conditions: [poisonedOn('ember')] })];
    expect(tokensShowingDefinition(tokens, conditionDefinition({ color: 'ember' }))).toBe(tokens);
  });

  it('a loose token in a grid follows the color of the cast list; a linked one is left alone', () => {
    const loose = kael({ conditions: [poisonedOn()] });
    const linked = linkedLyra({ conditions: [poisonedOn()] });
    const [kaelAfter, lyraAfter] = tokensOverCatalog(
      [loose, linked],
      [conditionDefinition()],
      [conditionDefinition({ color: 'sky' })],
    );
    expect(kaelAfter?.conditions[0]?.color).toBe('sky');
    expect(lyraAfter).toBe(linked);
  });
});
