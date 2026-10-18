import type { TokenLayerDto } from '@lorkarium/contracts';
import {
  NOT_MEMBER_MESSAGE,
  OFFLINE_MESSAGE,
  UNEXPECTED_MESSAGE,
} from '@/features/campaigns/campaign-messages';
import { cellsText } from '@/lib/cells-text';
import { facingLabel } from '@/lib/facing-label';
import type { BoardCommandFailure } from '@/services/table-board-commands';
import type { BoardStatus } from '@/stores/board-store';
import type { TablePresenceState } from '@/stores/table-presence-store';

export const BOARD_LOAD_FAILED = 'Não deu para carregar o tabuleiro.';

const OUT_OF_SCENE_TEXT = 'Fora da cena.';
const STALE_UNDO_TEXT = 'Alguém mexeu nisso depois; não dá para desfazer.';

/** What the status line says about the connection and the board while they are not live.
 *  Once the board is ready the line belongs to tool hints and refusals.
 *
 *  Example: `connectionStatusLine('live', 'loading') // 'Carregando o tabuleiro…'` */
export function connectionStatusLine(
  presence: TablePresenceState['status'],
  board: BoardStatus,
): string {
  if (presence === 'connecting') return 'Conectando à mesa…';
  if (presence === 'reconnecting') return 'Reconectando…';
  if (presence === 'live' && board === 'loading') return 'Carregando o tabuleiro…';
  return '';
}

const COMMAND_FAILURE_MESSAGE: Readonly<Record<BoardCommandFailure, string>> = {
  forbidden: 'Só o mestre pode fazer isso.',
  not_found: NOT_MEMBER_MESSAGE,
  token_not_found: 'Isso não está mais na mesa.',
  turn_changed: 'A vez já passou.',
  combat_active: 'Já há um combate nesta cena.',
  combat_inactive: 'Não há combate nesta cena.',
  out_of_scene: OUT_OF_SCENE_TEXT,
  drawing_not_found: 'Esse desenho não está mais na mesa.',
  drawing_limit: 'A cena já tem desenhos demais. Apague alguns antes.',
  effect_area_not_found: 'Essa área não está mais na mesa.',
  effect_area_limit: 'A cena já tem áreas demais. Apague algumas antes.',
  stale_undo: STALE_UNDO_TEXT,
  asset_not_found: 'Essa imagem não está mais na mesa.',
  invalid: 'Confira os campos e tente de novo.',
  rate_limited: 'Muitas ações seguidas. Espere um instante.',
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
};

export const DISCONNECTED_COMMAND = 'Sem conexão. Aguarde reconectar.';

/** What the status line says once an area of effect was stretched or turned by its handles.
 *
 *  Example: `effectAreaReshapedAnnouncement('Cone diagonal', '4 casas · 6 m') // 'Cone diagonal agora tem 4 casas · 6 m.'` */
export function effectAreaReshapedAnnouncement(kind: string, size: string): string {
  return `${kind} agora tem ${size}.`;
}

/** Why the server refused a board command, as the person reads it.
 *
 *  Example: `boardCommandFailureMessage('forbidden') // 'Só o mestre pode fazer isso.'` */
export function boardCommandFailureMessage(failure: BoardCommandFailure): string {
  return COMMAND_FAILURE_MESSAGE[failure];
}

/** Why the server refused a command on a token: "not allowed" means the token is not yours.
 *
 *  Example: `tokenCommandFailureMessage('forbidden') // 'Esse token não é seu.'` */
export function tokenCommandFailureMessage(failure: BoardCommandFailure): string {
  return failure === 'forbidden' ? NOT_YOUR_TOKEN : boardCommandFailureMessage(failure);
}

/** Cells are announced from 1, as a person counts them. */
function cellWords(col: number, row: number): string {
  return `coluna ${cellsText(col + 1)}, linha ${cellsText(row + 1)}`;
}

/** Example: `selectedAnnouncement('Kael', 7, 5) // 'Kael selecionado, coluna 8, linha 6'` */
export function selectedAnnouncement(name: string, col: number, row: number): string {
  return `${name} selecionado, ${cellWords(col, row)}`;
}

/** Example: `movedAnnouncement('Kael', 8, 5) // 'Kael foi para a coluna 9, linha 6'` */
export function movedAnnouncement(name: string, col: number, row: number): string {
  return `${name} foi para a ${cellWords(col, row)}`;
}

/** Example: `groupMovedAnnouncement(3) // "3 tokens andaram uma casa."` */
export function groupMovedAnnouncement(count: number): string {
  return `${count} tokens andaram uma casa.`;
}

/** Example: `tokensMovedAnnouncement(2) // "2 tokens foram movidos."` */
export function tokensMovedAnnouncement(count: number): string {
  return `${count} tokens foram movidos.`;
}

/** Example: `facedAnnouncement('Kael', 45) // 'Kael olha para o sudoeste.'` */
export function facedAnnouncement(name: string, facing: number): string {
  return `${name} olha para o ${facingLabel(facing)}.`;
}

/** Example: `resizedAnnouncement('Kael', { width: 2, height: 1.5 }) // 'Kael agora ocupa 2 × 1,5 casas.'` */
export function resizedAnnouncement(
  name: string,
  size: Readonly<{ width: number; height: number }>,
): string {
  return `${name} agora ocupa ${cellsText(size.width)} × ${cellsText(size.height)} casas.`;
}

/** Example: `groupTurnedAnnouncement(2) // "2 tokens giraram."` */
export function groupTurnedAnnouncement(count: number): string {
  return `${count} tokens giraram.`;
}

/** Example: `copiedAnnouncement(3) // "3 itens copiados."` */
export function copiedAnnouncement(count: number): string {
  return count === 1 ? '1 item copiado.' : `${count} itens copiados.`;
}

export const PASTE_TOKENS_MASTER_ONLY = 'Só o mestre cola tokens.';
export const NOT_YOUR_TOKEN = 'Esse token não é seu.';
export const OUT_OF_SCENE = OUT_OF_SCENE_TEXT;

/** The three layers as the toolbar and the "Mover para camada" menu name them. */
export const LAYER_LABEL: Readonly<Record<TokenLayerDto, string>> = {
  tokens: 'Tokens',
  objects: 'Objetos',
  background: 'Fundo',
};
