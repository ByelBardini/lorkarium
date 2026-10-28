import { describe, expect, it } from 'vitest';
import {
  activeFormAfterEdit,
  formBoxOf,
  isShowing,
  requireActiveForm,
  requireForm,
} from '../../../src/modules/tokens/token-forms.bo';
import {
  LYRA_ID,
  LYRA_RAVEN_FORM_ID,
  LYRA_WOLF_FORM_ID,
  WOLF_IMAGE_ID,
  lyraForms,
  wolfForm,
} from '../../support/tokens-factories';

const SCENE = { widthCells: 10, heightCells: 10 };
const AS_WOLF = {
  activeFormId: LYRA_WOLF_FORM_ID,
  imageAssetId: WOLF_IMAGE_ID,
  frame: 'round' as const,
  col: 3,
  row: 3,
  width: 2,
  height: 2,
};

describe('activeFormAfterEdit', () => {
  it('an edit that keeps the image and the size keeps the shown form', () => {
    expect(activeFormAfterEdit(AS_WOLF, { width: 2, height: 2 })).toBe(LYRA_WOLF_FORM_ID);
  });

  it('a new size by hand leaves the token without a form', () => {
    expect(activeFormAfterEdit(AS_WOLF, { width: 3, height: 2 })).toBeNull();
  });

  it('a new image by hand leaves the token without a form', () => {
    expect(activeFormAfterEdit(AS_WOLF, { imageAssetId: null, width: 2, height: 2 })).toBeNull();
  });

  it('a new frame by hand leaves the token without a form', () => {
    expect(activeFormAfterEdit(AS_WOLF, { frame: 'square', width: 2, height: 2 })).toBeNull();
  });

  it('the same frame sent again keeps the form', () => {
    const edit = { frame: 'round' as const, width: 2, height: 2 };

    expect(activeFormAfterEdit(AS_WOLF, edit)).toBe(LYRA_WOLF_FORM_ID);
  });

  it('the same image sent again keeps the form', () => {
    const edit = { imageAssetId: WOLF_IMAGE_ID, width: 2, height: 2 };

    expect(activeFormAfterEdit(AS_WOLF, edit)).toBe(LYRA_WOLF_FORM_ID);
  });

  it('a list without the shown form leaves the token without one', () => {
    const edit = { width: 2, height: 2, formIds: [LYRA_RAVEN_FORM_ID] };

    expect(activeFormAfterEdit(AS_WOLF, edit)).toBeNull();
  });

  it('a list that keeps the shown form keeps it', () => {
    const edit = { width: 2, height: 2, formIds: [LYRA_RAVEN_FORM_ID, LYRA_WOLF_FORM_ID] };

    expect(activeFormAfterEdit(AS_WOLF, edit)).toBe(LYRA_WOLF_FORM_ID);
  });

  it('a token in no form stays in none', () => {
    expect(activeFormAfterEdit({ ...AS_WOLF, activeFormId: null }, { width: 2, height: 2 })).toBe(
      null,
    );
  });
});

describe('requireForm', () => {
  it('finds the kept form by its id', () => {
    expect(requireForm(LYRA_ID, lyraForms(), LYRA_WOLF_FORM_ID).name).toBe('Lobo atroz');
  });

  it('an id the token does not keep is TOKEN_FORM_NOT_FOUND citing the token and the id', () => {
    const otherId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

    expect(() => requireForm(LYRA_ID, lyraForms(), otherId)).toThrow(
      expect.objectContaining({
        code: 'TOKEN_FORM_NOT_FOUND',
        message: `token ${LYRA_ID} has no form ${otherId}; expected the id of one of its forms`,
      }),
    );
  });
});

describe('requireActiveForm', () => {
  it('without expect (a normal switch) passes', () => {
    expect(() => requireActiveForm(LYRA_ID, undefined, LYRA_WOLF_FORM_ID)).not.toThrow();
  });

  it('the expected form still shown passes, none included', () => {
    expect(() => requireActiveForm(LYRA_ID, { activeFormId: null }, null)).not.toThrow();
  });

  it('another form shown since is STALE_UNDO citing both', () => {
    const undo = () => requireActiveForm(LYRA_ID, { activeFormId: null }, LYRA_WOLF_FORM_ID);

    expect(undo).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: `token ${LYRA_ID} is at form ${LYRA_WOLF_FORM_ID}; the undo expected no form`,
      }),
    );
  });
});

describe('formBoxOf', () => {
  it('keeps the top-left corner when the form fits', () => {
    const box = { col: 3, row: 3, width: 1, height: 1 };

    expect(formBoxOf(SCENE, box, wolfForm())).toEqual({ col: 3, row: 3, width: 2, height: 2 });
  });

  it('steps back into the scene near the right edge', () => {
    const box = { col: 9, row: 4, width: 1, height: 1 };

    expect(formBoxOf(SCENE, box, wolfForm())).toEqual({ col: 8, row: 4, width: 2, height: 2 });
  });

  it('a form larger than the scene is OUT_OF_SCENE citing the size and the scene', () => {
    const box = { col: 0, row: 0, width: 1, height: 1 };
    const tiny = { widthCells: 1, heightCells: 1 };

    expect(() => formBoxOf(tiny, box, wolfForm())).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: 'a token at (0, 0) of size 2×2 does not fit the 1×1 scene',
      }),
    );
  });
});

describe('isShowing', () => {
  const box = { col: 3, row: 3, width: 2, height: 2 };

  it('the token in that form, image and box is already showing it', () => {
    expect(isShowing(AS_WOLF, wolfForm(), box)).toBe(true);
  });

  it('the same form id with another box (the form was edited since) is not', () => {
    expect(isShowing({ ...AS_WOLF, width: 1, height: 1 }, wolfForm(), box)).toBe(false);
  });

  it('the same box with another image is not', () => {
    expect(isShowing({ ...AS_WOLF, imageAssetId: null }, wolfForm(), box)).toBe(false);
  });

  it('the same box and image with another frame is not', () => {
    expect(isShowing({ ...AS_WOLF, frame: 'square' }, wolfForm(), box)).toBe(false);
  });

  it('another form shown is not', () => {
    expect(isShowing({ ...AS_WOLF, activeFormId: null }, wolfForm(), box)).toBe(false);
  });
});
