import type { LibrarySceneDto } from '@lorkarium/contracts';
import { editedLabel } from '@/lib/edited-label';
import { PLAN_LIMIT_FALLBACK, planLimitMessage } from '@/lib/plan-limit-message';
import type { LibraryFailure, LibraryFailureKind } from '@/services/library-api';
import type { LibraryMapsFailure, LibraryMapsFailureKind } from '@/services/library-maps-api';

const FAILURE_MESSAGES: Readonly<Record<Exclude<LibraryFailureKind, 'plan_limit'>, string>> = {
  scene_is_active: 'O grupo está nesse grid. Leva o grupo pra outro antes.',
  folder_cycle: 'Uma pasta não entra nela mesma nem numa pasta de dentro dela.',
  folder_too_deep: 'Pastas vão até 5 níveis.',
  folder_not_found: 'Essa pasta não existe mais.',
  not_found: 'Esse grid não existe mais.',
  forbidden: 'Só o mestre mexe na biblioteca.',
  invalid: 'O servidor não aceitou essa mudança.',
  unauthenticated: 'Sua sessão acabou. Entre de novo.',
  offline: 'Sem conexão com o servidor.',
  unexpected: 'Algo deu errado. Tenta de novo.',
};

/** What the status line says for a refusal of the library (a plan refusal names the ceiling).
 *
 *  Example: `libraryFailureMessage({ kind: 'folder_cycle' })` */
export function libraryFailureMessage(failure: LibraryFailure): string {
  if (failure.kind === 'plan_limit') return planLimitMessage(failure.planLimit);
  return FAILURE_MESSAGES[failure.kind];
}

const MAP_FAILURE_MESSAGES: Readonly<Record<LibraryMapsFailureKind, string>> = {
  map_is_main: 'Escolha outro mapa principal antes de excluir este.',
  regions_full: 'Esse mapa já tem o máximo de lugares.',
  link_self: 'Um lugar não pode levar ao próprio mapa.',
  link_target_not_found: 'Esse item não existe mais.',
  region_not_showable: 'Há jogadores que não podem ver esse lugar.',
  not_found: 'Esse mapa não existe mais.',
  forbidden: FAILURE_MESSAGES.forbidden,
  invalid: FAILURE_MESSAGES.invalid,
  unauthenticated: FAILURE_MESSAGES.unauthenticated,
  offline: FAILURE_MESSAGES.offline,
  unexpected: FAILURE_MESSAGES.unexpected,
  plan_limit: PLAN_LIMIT_FALLBACK,
};

/** What the status line says for a refusal about a map.
 *
 *  Example: `libraryMapFailureMessage('map_is_main')` */
export function libraryMapFailureMessage(kind: LibraryMapsFailureKind): string {
  return MAP_FAILURE_MESSAGES[kind];
}

/** `libraryMapFailureMessage` with the plan refusal's own sentence (creating a map).
 *
 *  Example: `libraryMapRefusalMessage(answer.failure)` */
export function libraryMapRefusalMessage(failure: LibraryMapsFailure): string {
  if (failure.kind === 'plan_limit') return planLimitMessage(failure.planLimit);
  return libraryMapFailureMessage(failure.kind);
}

/** "1 grid", "3 grids".
 *
 *  Example: `gridCountLabel(3) // '3 grids'` */
export function gridCountLabel(count: number): string {
  return count === 1 ? '1 grid' : `${count} grids`;
}

/** "1 token", "14 tokens".
 *
 *  Example: `tokenCountLabel(14) // '14 tokens'` */
export function tokenCountLabel(count: number): string {
  return count === 1 ? '1 token' : `${count} tokens`;
}

/** The group grid's mark, with how many players are online (all of them are there).
 *
 *  Example: `liveLabel(2) // 'No ar · 2 jogadores aqui'` */
export function liveLabel(playersOnline: number): string {
  if (playersOnline === 0) return 'No ar';
  const players = playersOnline === 1 ? '1 jogador' : `${playersOnline} jogadores`;
  return `No ar · ${players} aqui`;
}

/** "30×20 casas · 11 tokens · editado hoje"; the token count only for the master.
 *
 *  Example: `sceneMeta(scene, now)` */
export function sceneMeta(scene: LibrarySceneDto, now: Date): string {
  const size = `${scene.widthCells}×${scene.heightCells} casas`;
  const tokens = scene.tokenCount === null ? [] : [tokenCountLabel(scene.tokenCount)];
  return [size, ...tokens, editedLabel(scene.updatedAt, now)].join(' · ');
}

/** What a grid's tree item says: "Privado · 28×28 casas · 14 tokens · editado hoje", plus the
 *  "No ar" mark on the group grid.
 *
 *  Example: `sceneDescription(scene, now, true, 2) // 'Público · … · No ar · 2 jogadores aqui'` */
export function sceneDescription(
  scene: LibrarySceneDto,
  now: Date,
  isGroupGrid: boolean,
  playersOnline: number,
): string {
  const visibility = scene.visibility === 'public' ? 'Público' : 'Privado';
  const live = isGroupGrid ? [liveLabel(playersOnline)] : [];
  return [visibility, sceneMeta(scene, now), ...live].join(' · ');
}

/** What a folder's tree item says: its grid count and whether the group is inside.
 *
 *  Example: `folderDescription(3, true) // '3 grids · o grupo está aqui'` */
export function folderDescription(gridCount: number, holdsGroupGrid: boolean): string {
  const count = gridCount === 1 ? '1 item' : `${gridCount} itens`;
  return holdsGroupGrid ? `${count} · o grupo está aqui` : count;
}

/** What deleting a grid takes with it, for the confirmation.
 *
 *  Example: `sceneDeletionText(14) // 'Some com 14 tokens, as paredes e as luzes.'` */
export function sceneDeletionText(tokenCount: number | null): string {
  if (tokenCount === null || tokenCount === 0)
    return 'Some com as paredes, as luzes e os desenhos.';
  return `Some com ${tokenCountLabel(tokenCount)}, as paredes e as luzes.`;
}
