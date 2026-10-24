import { describe, expect, it } from 'vitest';
import { unsavedChangesStateOf } from '@/lib/unsaved-changes';

describe('unsavedChangesStateOf', () => {
  it('saving wins over an edit still waiting', () => {
    expect(unsavedChangesStateOf({ saving: true, dirty: true, justSaved: false })).toBe('saving');
  });

  it('an edit waiting is "dirty", even right after a save', () => {
    expect(unsavedChangesStateOf({ saving: false, dirty: true, justSaved: true })).toBe('dirty');
  });

  it('nothing waiting right after a save is "saved"', () => {
    expect(unsavedChangesStateOf({ saving: false, dirty: false, justSaved: true })).toBe('saved');
  });

  it('nothing to say hides the bar (null)', () => {
    expect(unsavedChangesStateOf({ saving: false, dirty: false, justSaved: false })).toBeNull();
  });
});
