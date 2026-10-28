import { describe, expect, it } from 'vitest';
import {
  addForm,
  canAddForm,
  duplicateForm,
  emptyFormsForm,
  FORM_NAME_PROBLEM,
  formSizeText,
  formsFormOf,
  makeBaseForm,
  parseFormsForm,
  patchForm,
  removeForm,
  type FormDraft,
  type FormsFormValues,
} from '@/features/tokens/forms-form-state';
import { LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { lyra } from '../../support/table-session-fixtures';

const DWARF_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const WOLF_ID = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const CROW_ID = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

const DWARF: FormDraft = {
  id: DWARF_ID,
  name: 'Anão',
  imageAssetId: null,
  width: 1,
  height: 1,
  frame: 'square',
};
const WOLF: FormDraft = {
  id: WOLF_ID,
  name: 'Lobo atroz',
  imageAssetId: null,
  width: 2,
  height: 2,
  frame: 'round',
};
const CROW: FormDraft = {
  id: CROW_ID,
  name: 'Corvo',
  imageAssetId: null,
  width: 0.5,
  height: 0.5,
  frame: 'square',
};

function idsFrom(...ids: string[]): () => string {
  let next = 0;
  return () => ids[next++] ?? `id-${next}`;
}

function formsOf(list: readonly FormDraft[], selectedId = list[0]?.id ?? null): FormsFormValues {
  return { list, selectedId, edited: false };
}

function eight(): FormsFormValues {
  const list = Array.from({ length: 8 }, (_, index) => ({ ...WOLF, id: `form-${index}` }));
  return formsOf(list);
}

describe('formsFormOf', () => {
  it('opens the form on the map in the editor', () => {
    const token = lyra({ forms: [DWARF, WOLF], activeFormId: WOLF_ID });

    expect(formsFormOf(token)).toEqual({ list: [DWARF, WOLF], selectedId: WOLF_ID, edited: false });
  });

  it('without a form on the map, opens the base; without forms, nothing', () => {
    expect(formsFormOf(lyra({ forms: [DWARF, WOLF] })).selectedId).toBe(DWARF_ID);
    expect(formsFormOf(lyra()).selectedId).toBeNull();
  });
});

describe('addForm', () => {
  const look = {
    name: 'Thoren',
    imageAssetId: LYRA_PORTRAIT.id,
    width: 2,
    height: 1,
    frame: 'round' as const,
  };

  it('on a token without forms creates the base (the current look) and the new one, selected', () => {
    const forms = addForm(emptyFormsForm(), look, idsFrom('base', 'new'));

    expect(forms).toEqual({
      list: [
        {
          id: 'base',
          name: 'Thoren',
          imageAssetId: LYRA_PORTRAIT.id,
          width: 2,
          height: 1,
          frame: 'round',
        },
        { id: 'new', name: '', imageAssetId: null, width: 2, height: 1, frame: 'round' },
      ],
      selectedId: 'new',
      edited: true,
    });
  });

  it('the base takes only the fields of a form, even from the whole token form', () => {
    const tokenForm = { ...look, initials: 'TH', side: 'ally' };

    const base = addForm(emptyFormsForm(), tokenForm, idsFrom('base', 'new')).list[0];

    expect(base).toEqual({
      id: 'base',
      name: 'Thoren',
      imageAssetId: LYRA_PORTRAIT.id,
      width: 2,
      height: 1,
      frame: 'round',
    });
  });

  it('a token without a name gets a base named "Base"', () => {
    const forms = addForm(emptyFormsForm(), { ...look, name: '  ' }, idsFrom('base', 'new'));

    expect(forms.list[0]?.name).toBe('Base');
  });

  it('with forms, adds only the new one at the end, with the size of the base', () => {
    const forms = addForm(formsOf([WOLF, DWARF]), look, idsFrom('new'));

    expect(forms.list.map(({ id }) => id)).toEqual([WOLF_ID, DWARF_ID, 'new']);
    expect(forms.list[2]).toMatchObject({
      width: 2,
      height: 2,
      imageAssetId: null,
      frame: 'round',
    });
  });

  it('with 8 forms adds nothing', () => {
    expect(addForm(eight(), look, idsFrom('new')).list).toHaveLength(8);
    expect(canAddForm(eight())).toBe(false);
    expect(canAddForm(formsOf([DWARF]))).toBe(true);
  });
});

describe('duplicateForm', () => {
  it('puts the copy right after the form, named "(cópia)", selected', () => {
    const forms = duplicateForm(formsOf([DWARF, WOLF, CROW]), WOLF_ID, idsFrom('copy'));

    expect(forms.list.map(({ name }) => name)).toEqual([
      'Anão',
      'Lobo atroz',
      'Lobo atroz (cópia)',
      'Corvo',
    ]);
    expect(forms.list[2]).toMatchObject({ id: 'copy', width: 2, height: 2, frame: 'round' });
    expect(forms.selectedId).toBe('copy');
  });

  it('keeps the copied name within 30 characters', () => {
    const long = { ...WOLF, name: 'Dragão vermelho ancião do pico' };

    const copy = duplicateForm(formsOf([DWARF, long]), WOLF_ID, idsFrom('copy')).list[2];

    expect(copy?.name).toBe('Dragão vermelho ancião (cópia)');
  });

  it('with 8 forms copies nothing', () => {
    expect(duplicateForm(eight(), 'form-1', idsFrom('copy')).list).toHaveLength(8);
  });
});

describe('makeBaseForm and removeForm', () => {
  it('"Tornar base" moves the form to the first place, the others in order', () => {
    const forms = makeBaseForm(formsOf([DWARF, WOLF, CROW]), CROW_ID);

    expect(forms.list.map(({ id }) => id)).toEqual([CROW_ID, DWARF_ID, WOLF_ID]);
    expect(forms.edited).toBe(true);
  });

  it('"Excluir forma" removes it and opens the form before', () => {
    const forms = removeForm(formsOf([DWARF, WOLF, CROW], CROW_ID), CROW_ID);

    expect(forms.list.map(({ id }) => id)).toEqual([DWARF_ID, WOLF_ID]);
    expect(forms.selectedId).toBe(WOLF_ID);
  });

  it('the base is never removed', () => {
    const forms = formsOf([DWARF, WOLF]);

    expect(removeForm(forms, DWARF_ID)).toBe(forms);
  });
});

describe('patchForm', () => {
  it('changes only the field of that form and marks the list as edited', () => {
    const forms = patchForm(formsOf([DWARF, WOLF]), WOLF_ID, { name: 'Lobo' });

    expect(forms.list.map(({ name }) => name)).toEqual(['Anão', 'Lobo']);
    expect(forms.edited).toBe(true);
  });
});

describe('formSizeText', () => {
  it.each([
    [1, 1, '1×1 casa'],
    [2, 2, '2×2 casas'],
    [0.5, 0.5, '0,5×0,5 casa'],
    [1.5, 1, '1,5×1 casas'],
  ])('%s × %s reads "%s"', (width, height, text) => {
    expect(formSizeText({ width, height })).toBe(text);
  });
});

describe('parseFormsForm', () => {
  it('a valid list goes as the DTO, names trimmed', () => {
    const result = parseFormsForm(formsOf([DWARF, { ...WOLF, name: ' Lobo atroz ' }]));

    expect(result).toEqual({ ok: true, forms: [DWARF, WOLF] });
  });

  it('an empty name is marked on its form', () => {
    const result = parseFormsForm(formsOf([DWARF, { ...WOLF, name: '   ' }]));

    expect(result).toEqual({ ok: false, errors: { [WOLF_ID]: FORM_NAME_PROBLEM } });
  });
});
