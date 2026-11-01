import {
  SHEET_NAME_MAX_LENGTH,
  type SheetSummaryDto,
  type SheetVisibilityDto,
} from '@lorkarium/contracts';
import type { SheetsFailure } from '@/services/sheets-api';

export const OPEN_SHEET = 'Abrir ficha';
export const OPEN_SHEET_WINDOW = 'Abrir ficha em janela';
export const SHEETS_SUBMENU = 'Fichas';
export const MAKE_MAIN_SHEET = 'Tornar principal';
export const MAIN_SHEET_MARK = 'principal';
export const NEW_SHEET = 'Nova ficha';
export const GIVE_SPARE_SHEET = 'Dar ficha existente';
export const GIVE_SHEET = 'Dar a';
export const RELEASE_FROM_TOKEN = 'Tirar do token';
export const RELEASE_FROM_HOLDER = 'Tirar do dono';
export const DELETE_SHEET = 'Excluir ficha…';
export const SHEET_VISIBILITY_TITLE = 'Quem vê a ficha';
export const NO_SHEET_TEMPLATES = 'Nenhum modelo na biblioteca';
export const NO_SPARE_SHEETS = 'Nenhuma ficha sem dono';
export const NO_PLAYERS = 'Nenhum jogador na mesa';

export const SHEET_VISIBILITY_LABEL: Readonly<Record<SheetVisibilityDto, string>> = {
  controllers: 'Só quem controla',
  table: 'A mesa toda (só leitura)',
};

const SHEET_FAILURE: Readonly<Partial<Record<SheetsFailure['kind'], string>>> = {
  member_not_found: 'Esse jogador não está mais na mesa.',
  forbidden: 'Só o mestre muda uma ficha.',
  not_found: 'A ficha, o modelo ou o token não existe mais.',
  invalid: 'O nome da ficha precisa ter de 1 a 60 letras.',
  offline: 'Sem conexão com o servidor. Tente de novo.',
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
};

/** What the room (or the library) says when a sheet command of the master was refused.
 *
 *  Example: `sheetCommandFailureMessage('Criar', { kind: 'member_not_found' }) // 'Esse jogador não está mais na mesa.'` */
export function sheetCommandFailureMessage(action: string, failure: SheetsFailure): string {
  return SHEET_FAILURE[failure.kind] ?? `${action} a ficha não deu certo. Tente de novo.`;
}

/** The name a sheet made from a menu starts with: "<template> · <holder>", cut with "…" to fit.
 *
 *  Example: `defaultSheetName('Ficha Tormenta', 'Goblin') // 'Ficha Tormenta · Goblin'` */
export function defaultSheetName(templateName: string, holderName: string): string {
  const name = `${templateName} · ${holderName}`;
  if (name.length <= SHEET_NAME_MAX_LENGTH) return name;
  return `${name.slice(0, SHEET_NAME_MAX_LENGTH - 1).trimEnd()}…`;
}

/** Who the names of a sheet's holder are, as the reader knows them (`null` = not known here). */
export type SheetHolderNames = Readonly<{
  memberName: (userId: string) => string | null;
  characterName: (userId: string) => string | null;
  tokenName: (tokenId: string) => string | null;
}>;

/** The library's line about who holds a sheet.
 *
 *  Example: `sheetHolderLabel(lyraSheet, names) // 'Ficha · de Bia (Lyra)'` */
export function sheetHolderLabel(
  sheet: Pick<SheetSummaryDto, 'tokenId' | 'memberId'>,
  names: SheetHolderNames,
): string {
  if (sheet.tokenId === null) return 'Ficha · sem dono, só mestres';
  if (sheet.memberId !== null) return `Ficha · de ${memberLabelOf(sheet.memberId, names)}`;
  const token = names.tokenName(sheet.tokenId);
  return token === null ? 'Ficha · num token' : `Ficha · token ${token}`;
}

function memberLabelOf(userId: string, names: SheetHolderNames): string {
  const member = names.memberName(userId) ?? 'um jogador';
  const character = names.characterName(userId);
  return character === null ? member : `${member} (${character})`;
}
