import {
  MAX_BARS_PER_TOKEN,
  updateTokenCommandDto,
  type BarColorDto,
  type BarVisibilityDto,
  type TokenDto,
  type TokenSideDto,
} from '@lorkarium/contracts';
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
  size: number;
  controllerIds: readonly string[];
  bars: readonly BarFormValues[];
}>;

export type BarFormErrors = Partial<Record<'label' | 'current' | 'max', string>>;

export type TokenFormErrors = Readonly<{
  name?: string;
  initials?: string;
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

let barKeys = 0;

/** "Novo token": nothing typed yet. */
export function emptyTokenForm(): TokenFormValues {
  return {
    name: '',
    initials: '',
    initialsEdited: false,
    side: 'ally',
    size: 1,
    controllerIds: [],
    bars: [],
  };
}

/** "Editar token": the token as it is now.
 *
 *  Example: `useState(() => tokenFormOf(token))` */
export function tokenFormOf(token: TokenDto): TokenFormValues {
  const { name, initials, side, size, controllerIds } = token;
  const bars = token.bars.map((bar) => ({
    key: nextBarKey(),
    label: bar.label,
    current: String(bar.current),
    max: String(bar.max),
    color: bar.color,
    visibility: bar.visibility,
  }));
  return { name, initials, initialsEdited: true, side, size, controllerIds, bars };
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

/** The form → the token fields to send, validated by the same DTO as the server.
 *
 *  Example: `const result = parseTokenForm(form); if (result.ok) await commands.updateToken(id, tokenId, result.token)` */
export function parseTokenForm(form: TokenFormValues): TokenFormResult {
  const parsed = TOKEN_FIELDS_DTO.safeParse({
    name: form.name,
    initials: form.initials,
    side: form.side,
    size: form.size,
    controllerIds: form.controllerIds,
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
  return key === 'label' || key === 'current' || key === 'max';
}

// Accepts the typographic minus a person may paste; anything else that is not whole is NaN.
function integerOf(text: string): number {
  const trimmed = text.trim().replace('−', '-');
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function nextBarKey(): string {
  barKeys += 1;
  return `bar-${barKeys}`;
}
