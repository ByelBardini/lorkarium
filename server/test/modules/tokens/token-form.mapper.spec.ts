import { describe, expect, it } from 'vitest';
import { pastedFormsOf } from '../../../src/modules/tokens/token-form.mapper';
import { LYRA_WOLF_FORM_ID, lyraForms } from '../../support/tokens-factories';

const COPIED = lyraForms().map(({ id, name, imageAssetId, width, height, frame }) => ({
  id,
  name,
  imageAssetId,
  width,
  height,
  frame,
}));

describe('pastedFormsOf', () => {
  it('a copy in the wolf form shows the form at its position', () => {
    const pasted = pastedFormsOf({ forms: COPIED, activeFormId: LYRA_WOLF_FORM_ID });

    expect(pasted.forms.map(({ name }) => name)).toEqual(['Elfa', 'Lobo atroz', 'Corvo']);
    expect(pasted.forms[1]?.frame).toBe('round');
    expect(pasted.activeFormIndex).toBe(1);
  });

  it('a shown id that is not in the copied list shows no form', () => {
    const otherId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

    expect(pastedFormsOf({ forms: COPIED, activeFormId: otherId }).activeFormIndex).toBeNull();
  });

  it('a paste without forms (an older client) has none and shows none', () => {
    expect(pastedFormsOf({})).toEqual({ forms: [], activeFormIndex: null });
  });
});
