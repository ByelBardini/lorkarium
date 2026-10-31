import {
  TOKEN_SIZE_MAX,
  TOKEN_SIZE_MIN,
  updateTokenCommandDto,
  type LightColorDto,
  type TokenDto,
  type TokenSideDto,
} from '@lorkarium/contracts';
import { cellsText } from '@/lib/cells-text';
import { coneFieldOf, parseConeField, type ConeFieldResult } from '@/lib/cone-form';
import {
  parseRangeFields,
  rangeFieldsOf,
  type RangeFieldErrors,
  type RangeFields,
} from '@/lib/range-form';
import {
  defaultSightFields,
  parseSightFields,
  sightFieldsOf,
  type SceneDistance,
  type SightFieldErrors,
  type SightFields,
} from '@/lib/sight-form';
import { initialsOf } from '@lorkarium/game-core';
import { DEFAULT_LIGHT_REACH } from '@/stores/light-reach-store';
import type { TokenEdit } from '@/services/table-board-commands';
import {
  auraFormOf,
  parseAuraForm,
  type AuraFormErrors,
  type AuraFormResult,
  type AuraFormValues,
} from './aura-form-state';
import { barDraftsOf, barFormsOf, type BarFormErrors, type BarFormValues } from './bar-form-state';
import {
  emptyFormsForm,
  formsFormOf,
  parseFormsForm,
  type FormsFormErrors,
  type FormsFormValues,
} from './forms-form-state';
import { BAR_MAX_PROBLEM, SIDE_OPTIONS } from './token-messages';

/** Someone at the table who may control a token. */
export type TokenPlayer = Readonly<{ userId: string; name: string }>;

/** The tabs of the token dialog, in the order a save looks for the first error. */
export type TokenDialogTab = 'basics' | 'bars' | 'vision' | 'aura' | 'forms';

/** Who fills the form: the master everything; a player never vision, light nor field of view
 *  (they open the fog; the server refuses them from a player). */
export type TokenFormMode = 'master' | 'player';

export type TokenFormValues = Readonly<{
  name: string;
  initials: string;
  /** Once the master types the initials, the name stops filling them. */
  initialsEdited: boolean;
  side: TokenSideDto;
  /** In cells, half-cell steps from 0,5 to 10 (presets and −/+, never typed). */
  width: number;
  height: number;
  /** The players who control it; none is the master's alone. */
  controllerIds: readonly string[];
  /** The image of the token, or `null` for the initials disc. */
  imageAssetId: string | null;
  /** Where it looks (not edited here: the preview aims the lantern with it). */
  facing: number;
  /** "Campo de visão (°)": whole degrees as typed, 360 = every side. */
  sightAngle: string;
  /** "Abertura do feixe (°)": whole degrees as typed, only sent with "Emite luz". */
  lightAngle: string;
  /** "Visão": how far it sees in the dark, typed in the unit of the scene. */
  sight: SightFields;
  /** "Luz": the light it gives off, typed in the unit of the scene. */
  light: RangeFields;
  /** "Cor da luz": `null` is neutral. */
  lightColor: LightColorDto | null;
  bars: readonly BarFormValues[];
  /** "Aura": the aura of the token in the unit of the scene. */
  aura: AuraFormValues;
  /** Only an aura the master touched is sent: untouched, the token keeps its own. */
  auraEdited: boolean;
  /** "Formas": only on "Editar token", and sent only once touched. */
  forms: FormsFormValues;
}>;

export type TokenFormErrors = Readonly<{
  name?: string;
  initials?: string;
  sight?: SightFieldErrors;
  light?: RangeFieldErrors;
  sightAngle?: string;
  lightAngle?: string;
  bars?: Readonly<Record<number, BarFormErrors>>;
  aura?: AuraFormErrors;
  forms?: FormsFormErrors;
}>;

export type TokenFormResult =
  Readonly<{ ok: true; token: TokenEdit }> | Readonly<{ ok: false; errors: TokenFormErrors }>;

const TOKEN_FIELDS_DTO = updateTokenCommandDto.omit({
  actionId: true,
  campaignId: true,
  tokenId: true,
});

const BAR_ERROR: Readonly<Record<keyof BarFormErrors, string>> = {
  label: 'Dê um nome à barra.',
  max: BAR_MAX_PROBLEM,
};

/** The tabs of the dialog, in order (also the order a save looks for the first error). */
export const TOKEN_DIALOG_TABS: readonly TokenDialogTab[] = [
  'basics',
  'bars',
  'forms',
  'vision',
  'aura',
];

const MASTER_TABS = TOKEN_DIALOG_TABS.filter((tab) => tab !== 'forms');
const PLAYER_TABS = MASTER_TABS.filter((tab) => tab !== 'vision');

/** The tabs a mode sees: a player has no "Visão e luz"; "Formas" only when `forms` (editing a
 *  token one may edit).
 *
 *  Example: `dialogTabsOf('player') // ['basics', 'bars', 'aura']` */
export function dialogTabsOf(mode: TokenFormMode, forms = false): readonly TokenDialogTab[] {
  if (!forms) return mode === 'player' ? PLAYER_TABS : MASTER_TABS;
  return TOKEN_DIALOG_TABS.filter((tab) => mode !== 'player' || tab !== 'vision');
}

/** The form with each locked player in "Quem controla" (first, as the server puts the creator).
 *
 *  Example: `withControllers(emptyTokenForm(scene), [bia]).controllerIds // [bia]` */
export function withControllers(
  form: TokenFormValues,
  lockedIds: readonly string[],
): TokenFormValues {
  const missing = lockedIds.filter((id) => !form.controllerIds.includes(id));
  if (missing.length === 0) return form;
  return { ...form, controllerIds: [...missing, ...form.controllerIds] };
}

const BASICS_FIELDS = ['name', 'initials'] as const;

const LIGHT_TEXTS = { missingBright: 'Informe a luz plena.' };

type LightRange = Readonly<{ bright: number; dim: number }>;
/** The sight and light as read from the form (`undefined` keeps what the token has), and the
 *  openings (`undefined` when mistyped). */
type FormRanges = Readonly<{
  sight: TokenEdit['sight'];
  light: LightRange | null | undefined;
  sightAngle: number | undefined;
  lightAngle: number | undefined;
}>;

// A player's send: none of the fields of "Visão e luz" goes.
const NO_RANGES: FormRanges = {
  sight: undefined,
  light: undefined,
  sightAngle: undefined,
  lightAngle: undefined,
};

/** The first tab, in order, with something to fix; `null` when nothing is wrong.
 *
 *  Example: `firstErrorTab({ bars: { 1: { label: 'Dê um nome à barra.' } } }) // 'bars'` */
export function firstErrorTab(errors: TokenFormErrors): TokenDialogTab | null {
  return TOKEN_DIALOG_TABS.find((tab) => tabHasErrors(errors, tab)) ?? null;
}

/** Whether a tab holds an error, for its mark.
 *
 *  Example: `tabHasErrors(errors, 'vision')` */
export function tabHasErrors(errors: TokenFormErrors, tab: TokenDialogTab): boolean {
  if (tab === 'basics') return BASICS_FIELDS.some((field) => errors[field] !== undefined);
  if (tab === 'bars') return Object.keys(errors.bars ?? {}).length > 0;
  if (tab === 'aura') return Object.keys(errors.aura ?? {}).length > 0;
  if (tab === 'forms') return Object.keys(errors.forms ?? {}).length > 0;
  return [errors.sight, errors.light, errors.sightAngle, errors.lightAngle].some(
    (error) => error !== undefined,
  );
}

/** The line under the name in the preview: side, size and what the token does in the dark.
 *
 *  Example: `previewMetaOf(form) // 'Inimigo · 2 × 2 casas · vê no escuro'` */
export function previewMetaOf(form: TokenFormValues): string {
  const side = SIDE_OPTIONS.find(({ value }) => value === form.side)?.label ?? '';
  const single = form.width === 1 && form.height === 1;
  const size = `${cellsText(form.width)} × ${cellsText(form.height)} ${single ? 'casa' : 'casas'}`;
  const bits = [side, size];
  if (form.sight.sees) bits.push('vê no escuro');
  if (form.light.on) bits.push('com luz');
  return bits.join(' · ');
}

/** "Novo token": nothing typed yet, seeing in the dark by the default of the market (9 / 18 m,
 *  kept in cells so each scene reads it in its own unit) and giving off no light.
 *
 *  Example: `useState(() => emptyTokenForm(scene))` */
export function emptyTokenForm(distance: SceneDistance): TokenFormValues {
  return {
    name: '',
    initials: '',
    initialsEdited: false,
    side: 'ally',
    width: 1,
    height: 1,
    controllerIds: [],
    imageAssetId: null,
    facing: 0,
    sightAngle: coneFieldOf(360),
    lightAngle: coneFieldOf(360),
    sight: defaultSightFields(distance),
    light: { on: false, bright: '', dim: '', saved: false },
    lightColor: null,
    bars: [],
    aura: auraFormOf(null, distance),
    auraEdited: false,
    forms: emptyFormsForm(),
  };
}

/** "Editar token": the token as it is now, its sight in the unit of the scene.
 *
 *  Example: `useState(() => tokenFormOf(token, scene))` */
export function tokenFormOf(token: TokenDto, distance: SceneDistance): TokenFormValues {
  const { name, initials, side, width, height, controllerIds, imageAssetId } = token;
  const initialsEdited = initials !== initialsOf(name);
  const bars = barFormsOf(token.bars);
  const sight = sightFieldsOf(token.sight, distance);
  const light = rangeFieldsOf(token.light, distance);
  const lightColor = token.light?.color ?? null;
  const angles = {
    facing: token.facing,
    sightAngle: coneFieldOf(token.sightAngle),
    lightAngle: coneFieldOf(token.light?.angle ?? 360),
  };
  const look = { controllerIds, imageAssetId, bars, sight, light, lightColor, ...angles };
  const aura = { aura: auraFormOf(token.aura, distance), auraEdited: false };
  const forms = formsFormOf(token);
  return { name, initials, initialsEdited, side, width, height, ...look, ...aura, forms };
}

/** The name changed: the initials follow it until edited by hand. */
export function renameToken(form: TokenFormValues, name: string): TokenFormValues {
  return form.initialsEdited ? { ...form, name } : { ...form, name, initials: initialsOf(name) };
}

/** "Emite luz" switched on: empty fields take the torch the lights panel starts with (4 + 4 cells);
 *  what was typed before stays.
 *
 *  Example: `lightSwitchedOn(form, scene).light // { on: true, bright: '6', dim: '12', saved: false }` */
export function lightSwitchedOn(form: TokenFormValues, distance: SceneDistance): TokenFormValues {
  const { light } = form;
  const empty = light.bright.trim() === '' && light.dim.trim() === '';
  const torch = rangeFieldsOf(DEFAULT_LIGHT_REACH, distance);
  const typed = empty ? { bright: torch.bright, dim: torch.dim } : {};
  return { ...form, light: { ...light, ...typed, on: true } };
}

/** The aura changed in the "Aura" tab: from now on it is sent.
 *
 *  Example: `setForm((current) => withAura(current, update(current.aura)))` */
export function withAura(form: TokenFormValues, aura: AuraFormValues): TokenFormValues {
  return { ...form, aura, auraEdited: true };
}

/** "Voltar às iniciais automáticas": the initials of the name, following it again. */
export function automaticInitials(form: TokenFormValues): TokenFormValues {
  return { ...form, initials: initialsOf(form.name), initialsEdited: false };
}

/** One −/+ of the "Personalizado" size: half a cell, held from 0,5 to 10.
 *
 *  Example: `stepSide(2, 1) // 2.5` */
export function stepSide(cells: number, direction: -1 | 1): number {
  return Math.min(TOKEN_SIZE_MAX, Math.max(TOKEN_SIZE_MIN, cells + direction * 0.5));
}

/** The form → the token fields to send, validated by the same DTO as the server; the sight and
 *  the light are read in the unit of the scene (`distance`). A player's (`mode: 'player'`) goes
 *  without sight, light and field of view, which she never sees.
 *
 *  Example: `const result = parseTokenForm(form, scene); if (result.ok) await commands.updateToken(id, tokenId, result.token)` */
export function parseTokenForm(
  form: TokenFormValues,
  distance: SceneDistance,
  mode: TokenFormMode = 'master',
): TokenFormResult {
  const player = mode === 'player';
  const look = player ? parseTokenFields(form, NO_RANGES) : parseTokenLook(form, distance);
  const aura = form.auraEdited ? withPart(look, auraPartOf(form, distance)) : look;
  return form.forms.edited ? withPart(aura, formsPartOf(form.forms)) : aura;
}

/** A tab parsed on its own (the aura, the forms): the fields it adds, or what is wrong. */
type PartResult =
  | Readonly<{ ok: true; edit: Partial<TokenEdit> }>
  | Readonly<{ ok: false; errors: TokenFormErrors }>;

function withPart(look: TokenFormResult, part: PartResult): TokenFormResult {
  if (!part.ok) return { ok: false, errors: { ...(look.ok ? {} : look.errors), ...part.errors } };
  if (!look.ok) return look;
  return { ok: true, token: { ...look.token, ...part.edit } };
}

// The aura is not in the DTO parse: its form already gives a valid aura or says what is wrong.
function auraPartOf(form: TokenFormValues, distance: SceneDistance): PartResult {
  const aura: AuraFormResult = parseAuraForm(form.aura, distance);
  return aura.ok
    ? { ok: true, edit: { aura: aura.aura } }
    : { ok: false, errors: { aura: aura.errors } };
}

function formsPartOf(forms: FormsFormValues): PartResult {
  const parsed = parseFormsForm(forms);
  return parsed.ok
    ? { ok: true, edit: { forms: parsed.forms } }
    : { ok: false, errors: { forms: parsed.errors } };
}

function parseTokenLook(form: TokenFormValues, distance: SceneDistance): TokenFormResult {
  const sight = parseSightFields(form.sight, distance);
  const light = parseRangeFields(form.light, distance, LIGHT_TEXTS);
  const sightAngle = parseConeField(form.sightAngle);
  // The beam is only read while the token gives off light.
  const lightAngle: ConeFieldResult = form.light.on
    ? parseConeField(form.lightAngle)
    : { ok: true, angle: 360 };
  const ranges = {
    sight: sight.ok ? sight.sight : undefined,
    light: light.ok ? light.range : undefined,
    sightAngle: sightAngle.ok ? sightAngle.angle : undefined,
    lightAngle: lightAngle.ok ? lightAngle.angle : undefined,
  };
  const fields = parseTokenFields(form, ranges);
  if (sight.ok && light.ok && sightAngle.ok && lightAngle.ok) return fields;
  const errors = {
    ...(fields.ok ? {} : fields.errors),
    ...(sight.ok ? {} : { sight: sight.errors }),
    ...(light.ok ? {} : { light: light.errors }),
    ...(sightAngle.ok ? {} : { sightAngle: sightAngle.error }),
    ...(lightAngle.ok ? {} : { lightAngle: lightAngle.error }),
  };
  return { ok: false, errors };
}

function parseTokenFields(form: TokenFormValues, ranges: FormRanges): TokenFormResult {
  const { sight, light, sightAngle, lightAngle } = ranges;
  const beam = { color: form.lightColor, angle: lightAngle ?? 360 };
  const parsed = TOKEN_FIELDS_DTO.safeParse({
    name: form.name,
    initials: form.initials,
    side: form.side,
    width: form.width,
    height: form.height,
    controllerIds: form.controllerIds,
    imageAssetId: form.imageAssetId,
    ...(sight === undefined ? {} : { sight }),
    ...(sightAngle === undefined ? {} : { sightAngle }),
    ...(light === undefined ? {} : { light: light && { ...light, ...beam } }),
    bars: barDraftsOf(form.bars),
  });
  if (parsed.success) return { ok: true, token: parsed.data };
  return { ok: false, errors: errorsOf(parsed.error.issues) };
}

function errorsOf(issues: readonly { path: readonly PropertyKey[] }[]): TokenFormErrors {
  let name: string | undefined;
  let initials: string | undefined;
  const bars: Record<number, BarFormErrors> = {};
  for (const { path } of issues) {
    const [field, index, barField] = path;
    if (field === 'name') name = 'Informe o nome do token.';
    if (field === 'initials') initials = 'Use de 1 a 3 letras.';
    if (field === 'bars' && typeof index === 'number' && isBarField(barField)) {
      bars[index] = { ...bars[index], [barField]: BAR_ERROR[barField] };
    }
  }
  return { name, initials, bars };
}

function isBarField(key: unknown): key is keyof BarFormErrors {
  return key === 'label' || key === 'max';
}
