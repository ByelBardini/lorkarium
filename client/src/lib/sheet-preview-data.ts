import {
  MAX_BARS_PER_TOKEN,
  barColorDto,
  barInputDto,
  barVisibilityDto,
  sheetFrameCharacterDto,
  sheetValuesDto,
  type BarInputDto,
  type SheetFrameCharacterDto,
  type SheetValuesDto,
  type TokenBarDto,
} from '@lorkarium/contracts';
import { z } from 'zod';

/** What the editor's preview hands the frame instead of a real holder: the character, its bars
 *  and the sheet's values, all editable by the master and changed by the frame's own requests. */
export type SheetPreviewData = Readonly<{
  character: SheetFrameCharacterDto;
  bars: readonly TokenBarDto[];
  values: SheetValuesDto;
}>;

/** The name of the sample token (and character) of the preview. */
export const SHEET_PREVIEW_TOKEN_NAME = 'Exemplo';
/** The id of the preview's first bar ("PV 20/20" until the master changes it). */
export const SHEET_PREVIEW_BAR_ID = previewBarIdOf(0);

/** The preview's data before the master edits it: "Exemplo", PV 20/20, AC 10, DC 10, no value. */
export const SAMPLE_SHEET_PREVIEW_DATA: SheetPreviewData = {
  character: { name: SHEET_PREVIEW_TOKEN_NAME, armorClass: 10, difficultyClass: 10 },
  bars: [
    {
      ...{ id: SHEET_PREVIEW_BAR_ID, position: 0, label: 'PV', current: 20, max: 20, temp: 0 },
      ...{ color: 'ember', visibility: 'everyone', display: 'number' },
    },
  ],
  values: {},
};

/** Why a text of the test data was not taken (the previous data stays). */
export type PreviewDataProblem =
  Readonly<{ kind: 'not_json' }> | Readonly<{ kind: 'invalid'; detail: string }>;

export type PreviewDataReading<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; problem: PreviewDataProblem }>;

// The author writes a bar as the master does; color and visibility may be left out.
const previewBarsDto = z
  .array(
    barInputDto.extend({
      color: barColorDto.default('ember'),
      visibility: barVisibilityDto.default('everyone'),
    }),
  )
  .max(MAX_BARS_PER_TOKEN);

/** The id of the preview's bar at `position`: stable, so the frame finds a bar again by its id
 *  after the master edits the list.
 *
 *  Example: `previewBarIdOf(1) // '00000000-0000-4000-8000-000000000002'` */
export function previewBarIdOf(position: number): string {
  return `00000000-0000-4000-8000-${String(position + 1).padStart(12, '0')}`;
}

/** The bars as the test data panel shows them: the master's fields, without id nor position.
 *
 *  Example: `previewBarsText(SAMPLE_SHEET_PREVIEW_DATA.bars) // '[\n  {\n    "label": "PV", …'` */
export function previewBarsText(bars: readonly TokenBarDto[]): string {
  const shown = bars.map(({ label, current, max, temp, color, visibility, display }) => {
    const input: BarInputDto = { label, current, max, temp, color, visibility, display };
    return input;
  });
  return JSON.stringify(shown, null, 2);
}

/** Reads the bars the master typed (a JSON list, up to `MAX_BARS_PER_TOKEN`), each given the
 *  id of its position.
 *
 *  Example: `readPreviewBarsText('[{"label":"MP","current":6,"max":6}]')` */
export function readPreviewBarsText(text: string): PreviewDataReading<TokenBarDto[]> {
  const read = readJson(text, previewBarsDto);
  if (!read.ok) return read;
  const bars = read.value.map((bar, position) => ({
    ...bar,
    id: previewBarIdOf(position),
    position,
  }));
  return { ok: true, value: bars };
}

/** The values as the test data panel shows them. Example: `previewValuesText({ forca: 14 })` */
export function previewValuesText(values: SheetValuesDto): string {
  return JSON.stringify(values, null, 2);
}

/** Reads the values the master typed, under the same rules and budget as a sheet's values.
 *
 *  Example: `readPreviewValuesText('{"forca": 14}') // { ok: true, value: { forca: 14 } }` */
export function readPreviewValuesText(text: string): PreviewDataReading<SheetValuesDto> {
  return readJson(text, sheetValuesDto);
}

/** The character fields of the panel, as typed (a blank AC or DC is none).
 *
 *  Example: `readPreviewCharacter({ name: 'Lyra', armorClass: '14', difficultyClass: '' })` */
export function readPreviewCharacter(
  fields: Readonly<{ name: string; armorClass: string; difficultyClass: string }>,
): PreviewDataReading<SheetFrameCharacterDto> {
  const typed = {
    name: fields.name,
    armorClass: statOf(fields.armorClass),
    difficultyClass: statOf(fields.difficultyClass),
  };
  return issueReading(sheetFrameCharacterDto.safeParse(typed));
}

function statOf(text: string): number | null {
  return text.trim() === '' ? null : Number(text);
}

function readJson<T>(text: string, schema: z.ZodType<T, unknown>): PreviewDataReading<T> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, problem: { kind: 'not_json' } };
  }
  return issueReading(schema.safeParse(value));
}

function issueReading<T>(parsed: z.ZodSafeParseResult<T>): PreviewDataReading<T> {
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return { ok: false, problem: { kind: 'invalid', detail: `${where}${issue?.message ?? ''}` } };
}
