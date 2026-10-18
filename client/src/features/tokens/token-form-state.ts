import {
  MAX_BARS_PER_TOKEN,
  updateTokenCommandDto,
  type BarColorDto,
  type BarVisibilityDto,
  type TokenDto,
  type TokenSideDto,
} from '@lorkarium/contracts';
import { cellsText } from '@/lib/cells-text';
import {
  parseSightFields,
  sightFieldsOf,
  type SceneDistance,
  type SightFieldErrors,
  type SightFields,
} from '@/lib/sight-form';
import { initialsOf } from '@/lib/token-initials';
import type { TokenEdit } from '@/services/table-board-commands';

/** One bar as typed: numbers are text until saved. `key` keeps React rows stable on reorder. */
export type BarFormValues = Readonly<{
  key: string;
  label: string;
  current: string;
  max: string;
  color: BarColorDto;
  visibility: BarVisibilityDto;
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
  /** "Visão": how far it sees, typed in the unit of the scene. */
  sight: SightFields;
  bars: readonly BarFormValues[];
}>;

export type BarFormErrors = Partial<Record<'label' | 'current' | 'max', string>>;

export type TokenFormErrors = Readonly<{
  name?: string;
  initials?: string;
  width?: string;
  height?: string;
  sight?: SightFieldErrors;
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
  current: 'Use um número inteiro entre −99 999 e 99 999.',
  max: 'O máximo vai de 1 a 99 999.',
};

const SIDE_ERROR = 'De 0,5 a 10 casas, de meia em meia.';

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
    current: String(bar.current),
    max: String(bar.max),
    color: bar.color,
    visibility: bar.visibility,
  }));
  const look = { controllerIds, imageAssetId, bars, sight: sightFieldsOf(token.sight, distance) };
  return { name, initials, initialsEdited: true, side, width, height, ...look };
}

/** The name changed: the initials follow it until edited by hand. */
export function renameToken(form: TokenFormValues, name: string): TokenFormValues {
  return form.initialsEdited ? { ...form, name } : { ...form, name, initials: initialsOf(name) };
}

/** A new bar at the end: the first is the PV (ember, hidden from the other players). */
export function addBar(form: TokenFormValues): TokenFormValues {
  if (form.bars.length >= MAX_BARS_PER_TOKEN) return form;
  const first = form.bars.length === 0;
  const bar: BarFormValues = {
    key: nextBarKey(),
    label: first ? 'PV' : `Barra ${form.bars.length + 1}`,
    current: '10',
    max: '10',
    color: first ? 'ember' : 'steel',
    visibility: first ? 'controllers' : 'everyone',
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

/** The form → the token fields to send, validated by the same DTO as the server; the sight is
 *  read in the unit of the scene (`distance`).
 *
 *  Example: `const result = parseTokenForm(form, scene); if (result.ok) await commands.updateToken(id, tokenId, result.token)` */
export function parseTokenForm(form: TokenFormValues, distance: SceneDistance): TokenFormResult {
  const sight = parseSightFields(form.sight, distance);
  const fields = parseTokenFields(form, sight.ok ? sight.sight : undefined);
  if (sight.ok) return fields;
  const errors = fields.ok ? {} : fields.errors;
  return { ok: false, errors: { ...errors, sight: sight.errors } };
}

function parseTokenFields(form: TokenFormValues, sight: TokenEdit['sight']): TokenFormResult {
  const parsed = TOKEN_FIELDS_DTO.safeParse({
    name: form.name,
    initials: form.initials,
    side: form.side,
    width: cellsOf(form.width),
    height: cellsOf(form.height),
    controllerIds: form.controllerIds,
    imageAssetId: form.imageAssetId,
    ...(sight === undefined ? {} : { sight }),
    bars: form.bars.map(({ label, current, max, color, visibility }) => ({
      label,
      current: integerOf(current),
      max: integerOf(max),
      color,
      visibility,
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
  return key === 'label' || key === 'current' || key === 'max';
}

// Accepts the typographic minus a person may paste; anything else that is not whole is NaN.
function integerOf(text: string): number {
  const trimmed = text.trim().replace('−', '-');
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
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
