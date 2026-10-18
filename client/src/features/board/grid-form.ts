import { sceneGridDto, type SceneDto, type SceneGridDto } from '@lorkarium/contracts';
import {
  heightForWidth,
  widthForHeight,
  type ImageSize,
  type SceneCells,
} from '@/lib/scene-proportion';

/** The "Configurar cena" grid fields as typed: text, so "1,5" and an empty field are possible. */
export type GridForm = Readonly<{
  widthCells: string;
  heightCells: string;
  cellDistance: string;
  cellUnit: string;
  gridVisible: boolean;
  gridOpacity: string;
}>;

export type GridFormField = Exclude<keyof GridForm, 'gridVisible'>;

export type GridFormErrors = Partial<Record<GridFormField, string>>;

export type GridFormResult =
  Readonly<{ ok: true; grid: SceneGridDto }> | Readonly<{ ok: false; errors: GridFormErrors }>;

const FIELD_ERROR: Readonly<Record<GridFormField, string>> = {
  widthCells: 'Use de 1 a 100 casas.',
  heightCells: 'Use de 1 a 100 casas.',
  cellDistance: 'Use uma distância maior que zero, como 1,5.',
  cellUnit: 'Escolha cm, m ou km.',
  gridOpacity: 'Use de 0 a 100.',
};

/** The units offered in "Unidade". */
export const CELL_UNITS: readonly string[] = ['cm', 'm', 'km'];

/** The units to offer: cm, m and km, plus the scene's own when it is another one (a scene saved
 *  before the list existed keeps its unit until the master picks one).
 *
 *  Example: `unitOptionsOf('ft') // ['cm', 'm', 'km', 'ft']` */
export function unitOptionsOf(current: string): readonly string[] {
  return CELL_UNITS.includes(current) || current === '' ? CELL_UNITS : [...CELL_UNITS, current];
}

const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, useGrouping: false });

/** The form filled with the scene as it is now.
 *
 *  Example: `useState(() => gridFormOf(scene))` */
export function gridFormOf(scene: SceneDto): GridForm {
  return {
    widthCells: String(scene.widthCells),
    heightCells: String(scene.heightCells),
    cellDistance: DECIMAL.format(scene.cellDistance),
    cellUnit: scene.cellUnit,
    gridVisible: scene.gridVisible,
    gridOpacity: String(scene.gridOpacity),
  };
}

/** The form → the grid to send, validated by the same DTO as the server, or one message per field.
 *
 *  Example: `const result = parseGridForm(form); if (result.ok) await commands.configureScene(id, result.grid)` */
export function parseGridForm(form: GridForm): GridFormResult {
  const parsed = sceneGridDto.safeParse({
    widthCells: numberOf(form.widthCells),
    heightCells: numberOf(form.heightCells),
    cellDistance: numberOf(form.cellDistance),
    cellUnit: form.cellUnit,
    gridVisible: form.gridVisible,
    gridOpacity: numberOf(form.gridOpacity),
  });
  if (parsed.success) return { ok: true, grid: parsed.data };
  const errors: GridFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (isGridFormField(field)) errors[field] = FIELD_ERROR[field];
  }
  return { ok: false, errors };
}

/** The form with these cells in the width and height fields.
 *
 *  Example: `withCells(form, cellsForImage(image, 20))` */
export function withCells(form: GridForm, cells: SceneCells): GridForm {
  return { ...form, widthCells: String(cells.widthCells), heightCells: String(cells.heightCells) };
}

/** With the lock on: the field just typed (width or height) drives the other by the image's
 *  proportion; a field that is not a whole number yet leaves the other alone.
 *
 *  Example: `keepProportion(before, after, { width: 1400, height: 700 })` */
export function keepProportion(before: GridForm, after: GridForm, image: ImageSize): GridForm {
  if (after.widthCells !== before.widthCells) {
    const width = wholeOf(after.widthCells);
    return width ? { ...after, heightCells: String(heightForWidth(image, width)) } : after;
  }
  if (after.heightCells === before.heightCells) return after;
  const height = wholeOf(after.heightCells);
  return height ? { ...after, widthCells: String(widthForHeight(image, height)) } : after;
}

/** A positive whole number typed in a cells field, or `null`.
 *
 *  Example: `wholeOf('20') // 20` */
export function wholeOf(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

// pt-BR decimal comma; an empty field is no number at all, never 0.
function numberOf(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

function isGridFormField(key: unknown): key is GridFormField {
  return typeof key === 'string' && key in FIELD_ERROR;
}
