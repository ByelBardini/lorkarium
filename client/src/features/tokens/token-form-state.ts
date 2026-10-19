import {
  MAX_BARS_PER_TOKEN,
  updateTokenCommandDto,
  type BarColorDto,
  type BarDisplayDto,
  type BarVisibilityDto,
  type TokenDto,
  type TokenSideDto,
} from '@lorkarium/contracts';
import { cellsText } from '@/lib/cells-text';
import {
  parseRangeFields,
  rangeFieldsOf,
  type RangeFieldErrors,
  type RangeFields,
} from '@/lib/range-form';
import {
  parseSightFields,
  sightFieldsOf,
  type SceneDistance,
  type SightFieldErrors,
  type SightFields,
} from '@/lib/sight-form';
import { initialsOf } from '@/lib/token-initials';
import type { TokenEdit } from '@/services/table-board-commands';

/** One bar as configured. `current` and `max` are not typed here (the card adjusts them): they
 *  travel as the token has them, so saving does not reset them. `key` keeps React rows stable. */
export type BarFormValues = Readonly<{
  key: string;
  label: string;
  current: number;
  max: number;
  color: BarColorDto;
  visibility: BarVisibilityDto;
  display: BarDisplayDto;
}>;

export type TokenFormValues = Readonly<{
  name: string;
  initials: string;
  /** Once the master types the initials, the name stops filling them. */
  initialsEdited: boolean;
  side: TokenSideDto;
  /** In cells, as typed ("1,5"): half-cell steps from 0,5 to 10. */
  width: string;
  height: string;
  controllerIds: readonly string[];
  /** The image of the token, or `null` for the initials disc. */
  imageAssetId: string | null;
  /** "Visão": how far it sees in the dark, typed in the unit of the scene. */
  sight: SightFields;
  /** "Luz": the light it gives off, typed in the unit of the scene. */
  light: RangeFields;
  bars: readonly BarFormValues[];
}>;

export type BarFormErrors = Partial<Record<'label', string>>;

export type TokenFormErrors = Readonly<{
  name?: string;
  initials?: string;
  width?: string;
  height?: string;
  sight?: SightFieldErrors;
  light?: RangeFieldErrors;
  bars?: Readonly<Record<number, BarFormErrors>>;
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
};

const SIDE_ERROR = 'De 0,5 a 10 casas, de meia em meia.';

const NEW_BAR_MAX = 10;

const LIGHT_TEXTS = { missingBright: 'Informe a luz plena.' };

/** The sight and light as read from the form; `undefined` keeps what the token has. */
type FormRanges = Readonly<{ sight: TokenEdit['sight']; light: TokenEdit['light'] }>;

let barKeys = 0;

/** "Novo token": nothing typed yet. */
export function emptyTokenForm(): TokenFormValues {
  return {
    name: '',
    initials: '',
    initialsEdited: false,
    side: 'ally',
    width: '1',
    height: '1',
    controllerIds: [],
    imageAssetId: null,
    sight: { sees: false, bright: '', dim: '', saved: false },
    light: { on: false, bright: '', dim: '', saved: false },
    bars: [],
  };
}

/** "Editar token": the token as it is now, its sight in the unit of the scene.
 *
 *  Example: `useState(() => tokenFormOf(token, scene))` */
export function tokenFormOf(token: TokenDto, distance: SceneDistance): TokenFormValues {
  const { name, initials, side, controllerIds, imageAssetId } = token;
  const width = cellsText(token.width);
  const height = cellsText(token.height);
  const bars = token.bars.map((bar) => ({
    key: nextBarKey(),
    label: bar.label,
    current: bar.current,
    max: bar.max,
    color: bar.color,
    visibility: bar.visibility,
    display: bar.display,
  }));
  const sight = sightFieldsOf(token.sight, distance);
  const light = rangeFieldsOf(token.light, distance);
  const look = { controllerIds, imageAssetId, bars, sight, light };
  return { name, initials, initialsEdited: true, side, width, height, ...look };
}

/** The name changed: the initials follow it until edited by hand. */
export function renameToken(form: TokenFormValues, name: string): TokenFormValues {
  return form.initialsEdited ? { ...form, name } : { ...form, name, initials: initialsOf(name) };
}

/** A new bar at the end, full at 10 / 10 and read as numbers; the first is the PV (ember,
 *  hidden from the other players). */
export function addBar(form: TokenFormValues): TokenFormValues {
  if (form.bars.length >= MAX_BARS_PER_TOKEN) return form;
  const first = form.bars.length === 0;
  const bar: BarFormValues = {
    key: nextBarKey(),
    label: first ? 'PV' : `Barra ${form.bars.length + 1}`,
    current: NEW_BAR_MAX,
    max: NEW_BAR_MAX,
    color: first ? 'ember' : 'steel',
    visibility: first ? 'controllers' : 'everyone',
    display: 'number',
  };
  return { ...form, bars: [...form.bars, bar] };
}

/** Swaps bar `index` with its neighbour (`-1` up, `1` down); the first one is drawn on the token. */
export function moveBar(form: TokenFormValues, index: number, offset: -1 | 1): TokenFormValues {
  const target = index + offset;
  const moving = form.bars[index];
  const other = form.bars[target];
  if (!moving || !other) return form;
  const bars = [...form.bars];
  bars[index] = other;
  bars[target] = moving;
  return { ...form, bars };
}

/** The form → the token fields to send, validated by the same DTO as the server; the sight and
 *  the light are read in the unit of the scene (`distance`).
 *
 *  Example: `const result = parseTokenForm(form, scene); if (result.ok) await commands.updateToken(id, tokenId, result.token)` */
export function parseTokenForm(form: TokenFormValues, distance: SceneDistance): TokenFormResult {
  const sight = parseSightFields(form.sight, distance);
  const light = parseRangeFields(form.light, distance, LIGHT_TEXTS);
  const ranges = {
    sight: sight.ok ? sight.sight : undefined,
    light: light.ok ? light.range : undefined,
  };
  const fields = parseTokenFields(form, ranges);
  if (sight.ok && light.ok) return fields;
  const errors = {
    ...(fields.ok ? {} : fields.errors),
    ...(sight.ok ? {} : { sight: sight.errors }),
    ...(light.ok ? {} : { light: light.errors }),
  };
  return { ok: false, errors };
}

function parseTokenFields(form: TokenFormValues, { sight, light }: FormRanges): TokenFormResult {
  const parsed = TOKEN_FIELDS_DTO.safeParse({
    name: form.name,
    initials: form.initials,
    side: form.side,
    width: cellsOf(form.width),
    height: cellsOf(form.height),
    controllerIds: form.controllerIds,
    imageAssetId: form.imageAssetId,
    ...(sight === undefined ? {} : { sight }),
    ...(light === undefined ? {} : { light }),
    bars: form.bars.map(({ label, current, max, color, visibility, display }) => ({
      label,
      current,
      max,
      color,
      visibility,
      display,
    })),
  });
  if (parsed.success) return { ok: true, token: parsed.data };
  return { ok: false, errors: errorsOf(parsed.error.issues) };
}

function errorsOf(issues: readonly { path: readonly PropertyKey[] }[]): TokenFormErrors {
  let name: string | undefined;
  let initials: string | undefined;
  let width: string | undefined;
  let height: string | undefined;
  const bars: Record<number, BarFormErrors> = {};
  for (const { path } of issues) {
    const [field, index, barField] = path;
    if (field === 'name') name = 'Informe o nome do token.';
    if (field === 'initials') initials = 'Use de 1 a 3 letras.';
    if (field === 'width') width = SIDE_ERROR;
    if (field === 'height') height = SIDE_ERROR;
    if (field === 'bars' && typeof index === 'number' && isBarField(barField)) {
      bars[index] = { ...bars[index], [barField]: BAR_ERROR[barField] };
    }
  }
  return { name, initials, width, height, bars };
}

function isBarField(key: unknown): key is keyof BarFormErrors {
  return key === 'label';
}

// "1,5" and "1.5" are both a cell and a half; anything else is NaN and the DTO refuses it.
function cellsOf(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function nextBarKey(): string {
  barKeys += 1;
  return `bar-${barKeys}`;
}
