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
    } as const;
    expect(rules.defineOrReuse(existing)).toEqual({ kind: 'reuse', definition: existing });
  });

  it('a new name is created', () => {
    expect(rules.defineOrReuse(undefined)).toEqual({ kind: 'create' });
  });

  it('the initial list has 3 benefits and 8 harms', () => {
    expect(DEFAULT_CONDITIONS.filter(({ tone }) => tone === 'benefit')).toHaveLength(3);
    expect(DEFAULT_CONDITIONS.filter(({ tone }) => tone === 'harm')).toHaveLength(8);
  });

  it('each initial condition has its own icon, none left on the generic one', () => {
    const icons = DEFAULT_CONDITIONS.map(({ icon }) => icon);
    expect(new Set(icons).size).toBe(DEFAULT_CONDITIONS.length);
    expect(icons).not.toContain('circle-dot');
  });
});
