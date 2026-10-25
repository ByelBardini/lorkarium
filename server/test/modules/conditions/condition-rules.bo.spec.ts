import { DEFAULT_CONDITION_NAMES } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  ConditionRulesBo,
  DEFAULT_CONDITIONS,
} from '../../../src/modules/conditions/condition-rules.bo';

describe('ConditionRulesBo', () => {
  const rules = new ConditionRulesBo();

  it('0 rounds lasts until removed, and any other count is the duration', () => {
    expect(rules.durationOf(0)).toBeNull();
    expect(rules.durationOf(2)).toBe(2);
  });

  it('a name already on the list (any case) reuses the existing definition', () => {
    const existing = {
      id: 'env',
      name: 'Envenenado',
      tone: 'harm',
      icon: 'flask-conical',
      look: null,
    } as const;
    expect(rules.defineOrReuse(existing)).toEqual({ kind: 'reuse', definition: existing });
  });

  it('a new name is created', () => {
    expect(rules.defineOrReuse(undefined)).toEqual({ kind: 'create' });
  });

  it('the initial list has 3 benefits, 6 harms and 2 incapacitating', () => {
    expect(DEFAULT_CONDITIONS.filter(({ tone }) => tone === 'benefit')).toHaveLength(3);
    expect(DEFAULT_CONDITIONS.filter(({ tone }) => tone === 'harm')).toHaveLength(6);
    expect(
      DEFAULT_CONDITIONS.filter(({ tone }) => tone === 'incapacitating').map(({ name }) => name),
    ).toEqual(['Atordoado', 'Paralisado']);
  });

  it('only Invisível changes the token: Concentrando and Caído stay icons, and there is no Inconsciente', () => {
    const withLook = DEFAULT_CONDITIONS.filter(({ look }) => look !== null);
    expect(withLook).toEqual([expect.objectContaining({ name: 'Invisível', look: 'invisible' })]);
    expect(DEFAULT_CONDITIONS.map(({ name }) => name)).not.toContain('Inconsciente');
  });

  it('each initial condition has its own icon, none left on the generic one', () => {
    const icons = DEFAULT_CONDITIONS.map(({ icon }) => icon);
    expect(new Set(icons).size).toBe(DEFAULT_CONDITIONS.length);
    expect(icons).not.toContain('circle-dot');
  });

  it('the 11 initial conditions are born with no image, shown by their icon', () => {
    expect(DEFAULT_CONDITIONS.filter(({ imageAssetId }) => imageAssetId !== null)).toEqual([]);
    expect(DEFAULT_CONDITIONS).toHaveLength(11);
  });

  it('the server defaults are the names of the contract, in the same order', () => {
    expect(DEFAULT_CONDITIONS.map(({ name }) => name)).toEqual([...DEFAULT_CONDITION_NAMES]);
  });

  describe('missingDefaults', () => {
    const allNames = DEFAULT_CONDITIONS.map(({ name }) => name);

    it('a list without "Cego" gets only Cego back, with its tone and icon', () => {
      const missing = rules.missingDefaults(allNames.filter((name) => name !== 'Cego'));
      expect(missing).toEqual([
        {
          name: 'Cego',
          tone: 'harm',
          icon: 'eye-off',
          look: null,
          color: null,
          description: '',
          maxStacks: null,
          imageAssetId: null,
        },
      ]);
    });

    it('"Cego" renamed to "Cega" brings Cego back', () => {
      const renamed = allNames.map((name) => (name === 'Cego' ? 'Cega' : name));
      expect(rules.missingDefaults([...renamed, 'Sangrando']).map(({ name }) => name)).toEqual([
        'Cego',
      ]);
    });

    it('a default kept under another case ("cego", "ABENÇOADO") is not missing', () => {
      const recased = allNames.map((name) =>
        name === 'Cego' ? 'cego' : name === 'Abençoado' ? 'ABENÇOADO' : name,
      );
      expect(rules.missingDefaults(recased)).toEqual([]);
    });

    it('the full list misses nothing', () => {
      expect(rules.missingDefaults(allNames)).toEqual([]);
    });

    it('an empty list misses the 11 defaults, in their order', () => {
      expect(rules.missingDefaults([]).map(({ name }) => name)).toEqual([
        ...DEFAULT_CONDITION_NAMES,
      ]);
    });
  });

  describe('requireNameFree', () => {
    const cego = { id: 'cego-id', campaignId: 'vharn', name: 'Cego' };

    it('no condition with the wanted name lets the rename through', () => {
      expect(() => rules.requireNameFree('env-id', undefined)).not.toThrow();
    });

    it('the name found being the condition itself (only the case changes) lets it through', () => {
      expect(() => rules.requireNameFree('cego-id', cego)).not.toThrow();
    });

    it('another condition holding the name refuses with CONDITION_NAME_TAKEN citing the name and the table', () => {
      expect(() => rules.requireNameFree('env-id', cego)).toThrow(
        expect.objectContaining({
          code: 'CONDITION_NAME_TAKEN',
          conditionName: 'Cego',
          campaignId: 'vharn',
          message: expect.stringContaining('Cego'),
        }),
      );
    });
  });

  describe('stacksAfterApply', () => {
    it('the first application of a stacking condition starts at 1 stack', () => {
      expect(rules.stacksAfterApply(null, 5)).toBe(1);
    });

    it('re-applying a stacking condition held at 2 of 5 piles up to 3', () => {
      expect(rules.stacksAfterApply(2, 5)).toBe(3);
    });

    it('re-applying a stacking condition already at the cap 5 of 5 stays at 5', () => {
      expect(rules.stacksAfterApply(5, 5)).toBe(5);
    });

    it('re-applying a condition that does not stack stays at 1', () => {
      expect(rules.stacksAfterApply(1, null)).toBe(1);
    });
  });

  describe('stacksCeilingOf', () => {
    it('a condition that does not stack (max null) keeps at most 1', () => {
      expect(rules.stacksCeilingOf(null)).toBe(1);
    });

    it('a stacking condition keeps at most its maxStacks 4', () => {
      expect(rules.stacksCeilingOf(4)).toBe(4);
    });
  });

  describe('requireStacksWithin', () => {
    const sangrando = { id: 'active-sangrando', maxStacks: 3 };

    it.each([
      ['0 stacks', sangrando, 0, 3],
      ['4 stacks, above the max 3', sangrando, 4, 3],
      ['2 stacks on a condition that does not stack', { id: 'active-cego', maxStacks: null }, 2, 1],
    ] as const)(
      '%s is INVALID_STACKS citing the id, the value and the range',
      (_, active, stacks, max) => {
        expect(() => rules.requireStacksWithin(active, stacks)).toThrow(
          expect.objectContaining({
            code: 'INVALID_STACKS',
            activeConditionId: active.id,
            stacks,
            maxStacks: max,
            message: `condition ${active.id} cannot have ${stacks} stacks; expected 1 to ${max}`,
          }),
        );
      },
    );

    it.each([1, 3])('%i stacks within 1 to 3 passes', (stacks) => {
      expect(() => rules.requireStacksWithin(sangrando, stacks)).not.toThrow();
    });

    it('1 stack on a condition that does not stack passes', () => {
      expect(() =>
        rules.requireStacksWithin({ id: 'active-cego', maxStacks: null }, 1),
      ).not.toThrow();
    });
  });
});
