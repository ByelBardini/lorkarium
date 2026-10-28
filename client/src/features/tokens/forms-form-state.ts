import {
  TOKEN_FORM_NAME_MAX_LENGTH,
  TOKEN_FORMS_MAX,
  tokenFormsDto,
  type TokenDto,
  type TokenFormDto,
  type TokenFrameDto,
} from '@lorkarium/contracts';
import { cellsText } from '@/lib/cells-text';

/** One form as the "Formas" tab edits it: the name as typed (validated only on save). */
export type FormDraft = Readonly<{
  id: string;
  name: string;
  imageAssetId: string | null;
  width: number;
  height: number;
  frame: TokenFrameDto;
}>;

/** The look the token has now (the "Básico" tab): what the base form copies. */
export type FormLook = Omit<FormDraft, 'id'>;

export type FormsFormValues = Readonly<{
  /** In order: the first is the base. */
  list: readonly FormDraft[];
  /** The form open in the editor under the cards. */
  selectedId: string | null;
  /** Only a list someone touched is sent: untouched, the token keeps its own. */
  edited: boolean;
}>;

/** The name problem of each form, by its id. */
export type FormsFormErrors = Readonly<Record<string, string>>;

export type FormsFormResult =
  Readonly<{ ok: true; forms: TokenFormDto[] }> | Readonly<{ ok: false; errors: FormsFormErrors }>;

export const FORM_NAME_PROBLEM = 'Dê um nome à forma.';
const COPY_SUFFIX = ' (cópia)';
const BASE_FALLBACK_NAME = 'Base';

/** No forms yet: the "Novo token" and a token that never had one.
 *
 *  Example: `emptyFormsForm().list // []` */
export function emptyFormsForm(): FormsFormValues {
  return { list: [], selectedId: null, edited: false };
}

/** "Editar token": its forms as they are, the one on the map open (else the base).
 *
 *  Example: `formsFormOf(thoren).selectedId // thoren.activeFormId` */
export function formsFormOf(token: TokenDto): FormsFormValues {
  const list = token.forms.map((form) => ({ ...form }));
  const active = list.find(({ id }) => id === token.activeFormId);
  return { list, selectedId: active?.id ?? list[0]?.id ?? null, edited: false };
}

/** Whether "Nova forma" (and "Duplicar") still fit under the limit of 8.
 *
 *  Example: `canAddForm(forms) // false with 8` */
export function canAddForm(forms: FormsFormValues): boolean {
  return forms.list.length < TOKEN_FORMS_MAX;
}

/** "Nova forma": a nameless form of the base's size and frame, open in the editor. On a token without forms
 *  the base comes first, a copy of the look it has now, so the original is not lost.
 *
 *  Example: `addForm(emptyFormsForm(), look, randomId).list.length // 2` */
export function addForm(
  forms: FormsFormValues,
  look: FormLook,
  newId: () => string,
): FormsFormValues {
  if (!canAddForm(forms)) return forms;
  // Field by field: the look may be the whole token form, and the DTO is strict.
  const { imageAssetId, width, height, frame } = look;
  const base = forms.list[0] ?? {
    id: newId(),
    name: baseNameOf(look.name),
    imageAssetId,
    width,
    height,
    frame,
  };
  const fresh = {
    id: newId(),
    name: '',
    imageAssetId: null,
    width: base.width,
    height: base.height,
    frame: base.frame,
  };
  const list = forms.list.length === 0 ? [base, fresh] : [...forms.list, fresh];
  return { list, selectedId: fresh.id, edited: true };
}

function baseNameOf(tokenName: string): string {
  const name = tokenName.trim().slice(0, TOKEN_FORM_NAME_MAX_LENGTH).trim();
  return name === '' ? BASE_FALLBACK_NAME : name;
}

/** "Duplicar": the copy goes right after it, named "… (cópia)", and opens in the editor.
 *
 *  Example: `duplicateForm(forms, wolf.id, randomId)` */
export function duplicateForm(
  forms: FormsFormValues,
  id: string,
  newId: () => string,
): FormsFormValues {
  const index = forms.list.findIndex((form) => form.id === id);
  const source = forms.list[index];
  if (!source || !canAddForm(forms)) return forms;
  const name = `${source.name.slice(0, TOKEN_FORM_NAME_MAX_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
  const copy = { ...source, id: newId(), name };
  const list = [...forms.list.slice(0, index + 1), copy, ...forms.list.slice(index + 1)];
  return { list, selectedId: copy.id, edited: true };
}

/** "Tornar base": the form moves to the first place; the others keep their order.
 *
 *  Example: `makeBaseForm(forms, wolf.id).list[0].id // wolf.id` */
export function makeBaseForm(forms: FormsFormValues, id: string): FormsFormValues {
  const chosen = forms.list.find((form) => form.id === id);
  if (!chosen || forms.list[0]?.id === id) return forms;
  const list = [chosen, ...forms.list.filter((form) => form.id !== id)];
  return { ...forms, list, edited: true };
}

/** "Excluir forma": never the base; the editor moves to the form before it.
 *
 *  Example: `removeForm(forms, crow.id).selectedId // the form before the crow` */
export function removeForm(forms: FormsFormValues, id: string): FormsFormValues {
  const index = forms.list.findIndex((form) => form.id === id);
  if (index <= 0) return forms;
  const list = forms.list.filter((form) => form.id !== id);
  return { list, selectedId: list[index - 1]?.id ?? null, edited: true };
}

/** A field of one form changed (name, image, size or frame).
 *
 *  Example: `patchForm(forms, wolf.id, { width: 2, height: 2 })` */
export function patchForm(
  forms: FormsFormValues,
  id: string,
  patch: Partial<FormLook>,
): FormsFormValues {
  const list = forms.list.map((form) => (form.id === id ? { ...form, ...patch } : form));
  return { ...forms, list, edited: true };
}

/** The card picked: its form opens in the editor (nothing to send).
 *
 *  Example: `selectForm(forms, crow.id)` */
export function selectForm(forms: FormsFormValues, id: string): FormsFormValues {
  return { ...forms, selectedId: id };
}

/** The size under the name of a card: "1×1 casa", "2×2 casas", "0,5×0,5 casa".
 *
 *  Example: `formSizeText({ width: 2, height: 2 }) // '2×2 casas'` */
export function formSizeText({ width, height }: Pick<FormDraft, 'width' | 'height'>): string {
  const unit = width * height > 1 ? 'casas' : 'casa';
  return `${cellsText(width)}×${cellsText(height)} ${unit}`;
}

/** The list → the forms to send, validated by the same DTO as the server; an empty name is
 *  marked on its form.
 *
 *  Example: `const result = parseFormsForm(form.forms); if (result.ok) edit.forms = result.forms` */
export function parseFormsForm(forms: FormsFormValues): FormsFormResult {
  const parsed = tokenFormsDto.safeParse(forms.list);
  if (parsed.success) return { ok: true, forms: parsed.data };
  const errors: Record<string, string> = {};
  for (const { path } of parsed.error.issues) {
    const [index, field] = path;
    const form = typeof index === 'number' ? forms.list[index] : undefined;
    if (form && field === 'name') errors[form.id] = FORM_NAME_PROBLEM;
  }
  return { ok: false, errors };
}
