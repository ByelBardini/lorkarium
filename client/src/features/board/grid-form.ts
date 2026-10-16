import { sceneGridDto, type SceneDto, type SceneGridDto } from '@lorkarium/contracts';

/** The "Configurar grid" fields as typed: text, so "1,5" and an empty field are possible. */
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
  cellUnit: 'Use de 1 a 8 letras, como m ou ft.',
  gridOpacity: 'Use de 0 a 100.',
};

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

// pt-BR decimal comma; an empty field is no number at all, never 0.
function numberOf(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
}

function isGridFormField(key: unknown): key is GridFormField {
  return typeof key === 'string' && key in FIELD_ERROR;
}
