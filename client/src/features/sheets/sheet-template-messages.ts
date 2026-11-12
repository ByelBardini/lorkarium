import { SHEET_TEMPLATE_FILES_MAX, SHEET_TEMPLATE_SOURCE_MAX_BYTES } from '@lorkarium/contracts';
import type { InlineHandler } from '@/lib/sheet-inline-handlers';
import { PLAN_LIMIT_FALLBACK, planLimitMessage } from '@/lib/plan-limit-message';
import type { PreviewDataProblem } from '@/lib/sheet-preview-data';
import type { TemplateFilesProblem } from '@/lib/sheet-template-files';
import type { SheetTemplateFileProblem } from '@/lib/sheet-template-file';
import type { SheetTemplatesFailure } from '@/services/sheet-templates-api';

const FAILURE_MESSAGES: Readonly<Record<SheetTemplatesFailure['kind'], string>> = {
  conflict: 'Outro mestre salvou este modelo enquanto você editava.',
  in_use: 'Este modelo está ligado a fichas. Desligue as fichas antes de excluir o modelo.',
  folder_not_found: 'A pasta não existe mais. Recarregue a biblioteca.',
  forbidden: 'Só mestres mexem nos modelos de ficha.',
  not_found: 'Este modelo não existe mais.',
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  invalid: `O modelo foi recusado. O código inteiro cabe em até ${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB.`,
  asset_not_found: 'Um asset do manifesto não existe nesta mesa. Envie-o de novo.',
  assets_too_large: 'Os assets do modelo passam de 8 MiB juntos.',
  too_large: 'O arquivo é grande demais: até 8 MiB, e uma fonte até 2 MiB.',
  unsupported_asset: 'O arquivo não é uma imagem PNG, JPEG ou WebP nem uma fonte WOFF2.',
  rate_limited: 'Muitos envios seguidos. Espere um minuto e tente de novo.',
  offline: 'Sem conexão. Tente de novo quando a mesa reconectar.',
  unexpected: 'Não deu para salvar o modelo. Tente de novo.',
  plan_limit: PLAN_LIMIT_FALLBACK,
};

/** The refusal of a template command, worded for the status line or the editor.
 *
 *  Example: `sheetTemplateFailureMessage('in_use')` */
export function sheetTemplateFailureMessage(kind: SheetTemplatesFailure['kind']): string {
  return FAILURE_MESSAGES[kind];
}

/** `sheetTemplateFailureMessage` with the plan refusal's own sentence (create, import, asset).
 *
 *  Example: `sheetTemplateRefusalMessage(result.failure)` */
export function sheetTemplateRefusalMessage(failure: SheetTemplatesFailure): string {
  if (failure.kind === 'plan_limit') return planLimitMessage(failure.planLimit);
  return FAILURE_MESSAGES[failure.kind];
}

/** "12,3 KiB de 512 KiB": the size of the code against the budget.
 *
 *  Example: `sheetSourceSizeLabel(12_600) // '12,3 KiB de 512 KiB'` */
export function sheetSourceSizeLabel(bytes: number): string {
  const kib = (bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${kib} KiB de ${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB`;
}

const FILES_PROBLEM_MESSAGES: Readonly<Record<TemplateFilesProblem, string>> = {
  invalid_path:
    'Caminho inválido: use letras sem acento, números, _, - e pastas com /, terminando em .html, .css ou .js.',
  repeated_path: 'Já existe um arquivo com esse caminho.',
  entry_page: 'O index.html é a página da ficha: não pode ser renomeado nem apagado.',
  too_many: `O modelo já tem ${SHEET_TEMPLATE_FILES_MAX} arquivos, o máximo.`,
};

/** Why a change to the template's files was refused, worded under the file list.
 *
 *  Example: `templateFilesProblemMessage('repeated_path')` */
export function templateFilesProblemMessage(problem: TemplateFilesProblem): string {
  return FILES_PROBLEM_MESSAGES[problem];
}

const FILE_PROBLEM_MESSAGES: Readonly<Record<SheetTemplateFileProblem, string>> = {
  not_json: 'Este arquivo não é um modelo de ficha (.lksheet).',
  not_lksheet: 'Este arquivo não é um modelo de ficha (.lksheet).',
  newer_version: 'Este arquivo foi feito numa versão mais nova do Lorkarium.',
  over_budget: `O código do arquivo passa de ${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB, ou os assets de 8 MiB.`,
  invalid: 'Este arquivo de modelo está incompleto ou foi alterado.',
};

/** Why a picked `.lksheet` was refused, worded for the import alert.
 *
 *  Example: `sheetTemplateFileProblemMessage('newer_version')` */
export function sheetTemplateFileProblemMessage(problem: SheetTemplateFileProblem): string {
  return FILE_PROBLEM_MESSAGES[problem];
}

/** The attributes that will not run in one HTML file of the template. */
export type FileInlineHandlers = Readonly<{ path: string; handlers: readonly InlineHandler[] }>;

/** "1 atributo de evento não vai rodar · index.html, linha 3": what the editor says after saving
 *  HTML files with attributes the sheet frame refuses, file by file; `''` with none.
 *
 *  Example: `inlineHandlerNotice([{ path: 'index.html', handlers: findInlineHandlers(html) }])` */
export function inlineHandlerNotice(files: readonly FileInlineHandlers[]): string {
  const found = files.filter(({ handlers }) => handlers.length > 0);
  const total = found.reduce((sum, { handlers }) => sum + handlers.length, 0);
  if (total === 0) return '';
  const count =
    total === 1
      ? '1 atributo de evento não vai rodar'
      : `${total} atributos de evento não vão rodar`;
  return `${count} · ${found.map(fileLinesText).join('; ')}`;
}

function fileLinesText({ path, handlers }: FileInlineHandlers): string {
  const lines = [...new Set(handlers.map((handler) => handler.line))].sort((a, b) => a - b);
  return `${path}, ${lines.length === 1 ? 'linha' : 'linhas'} ${spokenList(lines)}`;
}

// "3", "3 e 7", "3, 7 e 12".
function spokenList(items: readonly number[]): string {
  const head = items.slice(0, -1).join(', ');
  return head === '' ? `${items.at(-1)}` : `${head} e ${items.at(-1)}`;
}

/** The part of the preview's test data a typed text belongs to. */
export type PreviewDataPart = 'character' | 'bars' | 'values';

const PREVIEW_DATA_PART_PROBLEM: Readonly<Record<PreviewDataPart, string>> = {
  character: 'Personagem inválido',
  bars: 'Barras inválidas',
  values: 'Valores inválidos',
};

/** Why a text of the preview's test data was not taken (the preview keeps the previous data).
 *
 *  Example: `previewDataProblemMessage('values', { kind: 'not_json' }) // 'Valores inválidos: o texto não é um JSON.'` */
export function previewDataProblemMessage(
  part: PreviewDataPart,
  problem: PreviewDataProblem,
): string {
  const detail = problem.kind === 'not_json' ? 'o texto não é um JSON.' : problem.detail;
  return `${PREVIEW_DATA_PART_PROBLEM[part]}: ${detail}`;
}
