import { TOKENS_PER_SCENE_MAX, type TokenLayerDto } from '@lorkarium/contracts';
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
/** A player in the dark with no token that sees: only their own tokens show. */
export const NO_EYES = 'Nenhum token seu está nesta cena.';
/** The master's preview with no selected token that sees. */
export const PREVIEW_BLIND = 'Selecione um token para ver como ele.';

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
  scene_not_found: 'Esse grid não está mais aberto pra você.',
  token_not_found: 'Isso não está mais na mesa.',
  token_limit: `A cena já tem o máximo de ${TOKENS_PER_SCENE_MAX} tokens.`,
  turn_changed: 'A vez já passou.',
  combat_active: 'Já há um combate nesta cena.',
  combat_inactive: 'Não há combate nesta cena.',
  out_of_scene: OUT_OF_SCENE_TEXT,
  drawing_not_found: 'Esse desenho não está mais na mesa.',
  drawing_limit: 'A cena já tem desenhos demais. Apague alguns antes.',
  effect_area_not_found: 'Essa área não está mais na mesa.',
  effect_area_limit: 'A cena já tem áreas demais. Apague algumas antes.',
  wall_not_found: 'Essa parede não está mais na mesa.',
  wall_limit: 'A cena já tem paredes demais. Apague algumas antes.',
  invalid_door: 'Só parede reta vira porta.',
  door_locked: 'A porta está trancada.',
  wall_blocked: 'Uma parede bloqueia o caminho.',
  light_not_found: 'Essa luz não está mais na mesa.',
  light_limit: 'A cena já tem luzes demais. Apague algumas antes.',
  member_not_found: 'Essa pessoa não está mais na mesa.',
  character_already_placed: 'Esse personagem já tem um token neste grid.',
  token_not_linked: 'Esse token não está ligado a uma ficha.',
  no_free_cells: 'Não há casas livres neste grid.',
  stale_undo: STALE_UNDO_TEXT,
  asset_not_found: 'Essa imagem não está mais na mesa.',
  invalid: 'Confira os campos e tente de novo.',
  rate_limited: 'Muitas ações seguidas. Espere um instante.',
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
};

export const DISCONNECTED_COMMAND = 'Sem conexão. Aguarde reconectar.';

/** "Adicionar jogadores" with the middle of the view off the grid. */
export const VIEW_OFF_GRID = 'Traga o grid para a vista primeiro.';

const PEOPLE = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });

/** What the status line says once "Adicionar jogadores" was confirmed: who was skipped for having
 *  no token yet, or that everyone was already there; nothing when the tokens simply arrive.
 *
 *  Example: `addPlayersNotice({ created: 2, skipped: ['Davi'] }) // 'Davi ainda não tem token.'` */
export function addPlayersNotice({
  created,
  skipped,
}: Readonly<{ created: number; skipped: readonly string[] }>): string | null {
  if (skipped.length === 1) return `${PEOPLE.format(skipped)} ainda não tem token.`;
  if (skipped.length > 1) return `${PEOPLE.format(skipped)} ainda não têm token.`;
  return created === 0 ? 'Os jogadores já estão neste grid.' : null;
}

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

/** What a deletion from the board cannot do: come back. */
export const DELETE_CANNOT_UNDO = 'Isso não tem volta.';
export const TOO_MANY_TO_DELETE = 'Selecione até 64 tokens para excluir.';

/** How many of each piece a Delete with tokens takes away. */
export type DeletionCounts = Readonly<{
  tokenNames: readonly string[];
  drawings: number;
  areas: number;
  walls: number;
}>;

/** The question of the Delete dialog: "Excluir Goblin?" for one token alone, otherwise the
 *  counts ("Excluir 2 tokens e 1 desenho?").
 *
 *  Example: `deleteSelectionQuestion({ tokenNames: ['Goblin'], drawings: 0, areas: 0, walls: 0 })` */
export function deleteSelectionQuestion(counts: DeletionCounts): string {
  const { tokenNames, drawings, areas, walls } = counts;
  const [only] = tokenNames;
  if (only !== undefined && tokenNames.length === 1 && drawings + areas + walls === 0) {
    return `Excluir ${only}?`;
  }
  const parts = [
    countOf(tokenNames.length, 'token', 'tokens'),
    countOf(drawings, 'desenho', 'desenhos'),
    countOf(areas, 'área', 'áreas'),
    countOf(walls, 'parede', 'paredes'),
  ].filter((part): part is string => part !== null);
  const last = parts.pop();
  return parts.length === 0 ? `Excluir ${last}?` : `Excluir ${parts.join(', ')} e ${last}?`;
}

function countOf(count: number, one: string, many: string): string | null {
  if (count === 0) return null;
  return `${count} ${count === 1 ? one : many}`;
}
