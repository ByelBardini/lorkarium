import { SHEET_TEMPLATE_SOURCE_MAX_BYTES } from '@lorkarium/contracts';
import type { SheetTemplatesFailure } from '@/services/sheet-templates-api';

const FAILURE_MESSAGES: Readonly<Record<SheetTemplatesFailure['kind'], string>> = {
  conflict: 'Outro mestre salvou este modelo enquanto você editava.',
  in_use: 'Este modelo está ligado a fichas. Desligue as fichas antes de excluir o modelo.',
  folder_not_found: 'A pasta não existe mais. Recarregue a biblioteca.',
  forbidden: 'Só mestres mexem nos modelos de ficha.',
  not_found: 'Este modelo não existe mais.',
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  invalid: `O modelo foi recusado. O código inteiro cabe em até ${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB.`,
  offline: 'Sem conexão. Tente de novo quando a mesa reconectar.',
  unexpected: 'Não deu para salvar o modelo. Tente de novo.',
};

/** The refusal of a template command, worded for the status line or the editor.
 *
 *  Example: `sheetTemplateFailureMessage('in_use')` */
export function sheetTemplateFailureMessage(kind: SheetTemplatesFailure['kind']): string {
  return FAILURE_MESSAGES[kind];
}

/** "12,3 KiB de 512 KiB": the size of the code against the budget.
 *
 *  Example: `sheetSourceSizeLabel(12_600) // '12,3 KiB de 512 KiB'` */
export function sheetSourceSizeLabel(bytes: number): string {
  const kib = (bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${kib} KiB de ${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB`;
}
