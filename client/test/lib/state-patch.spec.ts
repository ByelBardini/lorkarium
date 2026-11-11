import { describe, expect, it } from 'vitest';
import { changedPatchOf } from '@/lib/state-patch';

const STATE = { tool: 'select', readOnly: false, selected: ['a'] as readonly string[] };

describe('changedPatchOf', () => {
  it('a patch holding the very values of the state is no change', () => {
    expect(changedPatchOf(STATE, { readOnly: false, selected: STATE.selected })).toBeNull();
  });

  it('an empty patch is no change', () => {
    expect(changedPatchOf(STATE, {})).toBeNull();
  });

  it('one field of another value gives the whole patch back', () => {
    const patch = { tool: 'ruler', readOnly: false };

    expect(changedPatchOf(STATE, patch)).toBe(patch);
  });

  it('an equal array of another identity is a change (identity is what selectors compare)', () => {
    const patch = { selected: ['a'] };

    expect(changedPatchOf(STATE, patch)).toBe(patch);
  });
});
