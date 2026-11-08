import { BOARD_EVENTS, type TokenPatrolRepeatDto } from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** A patrol as the master's editor saves it: the route as token origins (the first is where the
 *  token stood when the editor opened), what it does at the end, cells per second and whether it
 *  turns to where it walks. */
export type PatrolRoute = Readonly<{
  path: readonly Cell[];
  repeat: TokenPatrolRepeatDto;
  speed: number;
  turns: boolean;
}>;

/** The master's patrol commands; each answers with its ack, never throws. The patrol itself
 *  arrives as `token:patrolsChanged`, like everyone else's.
 *
 *  Example: `await commands.setTokenPatrolsActive(scope, [kaelId], true)` */
export interface TokenPatrolCommands {
  /** Saves the route of one token, or takes it away (`null`); over a running patrol the server
   *  starts it again from the first point. */
  setTokenPatrol(
    scope: BoardScope,
    tokenId: string,
    route: PatrolRoute | null,
  ): Promise<BoardCommandResult>;
  /** Starts or pauses the patrols of these tokens, all or nothing (`token_patrol_not_found`,
   *  `token_patrol_limit`). */
  setTokenPatrolsActive(
    scope: BoardScope,
    tokenIds: readonly string[],
    active: boolean,
  ): Promise<BoardCommandResult>;
}

/** `TokenPatrolCommands` over the board command sender (`token:setPatrol`,
 *  `token:setPatrolActiveMany`).
 *
 *  Example: `new RealtimeTokenPatrolCommands(sender).setTokenPatrol(scope, kaelId, null)` */
export class RealtimeTokenPatrolCommands implements TokenPatrolCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  setTokenPatrol(
    scope: BoardScope,
    tokenId: string,
    route: PatrolRoute | null,
  ): Promise<BoardCommandResult> {
    const patrol = route && { ...route, path: route.path.map(({ col, row }) => [col, row]) };
    return this.sender.send(BOARD_EVENTS.setTokenPatrol, scope, { tokenId, patrol });
  }

  setTokenPatrolsActive(
    scope: BoardScope,
    tokenIds: readonly string[],
    active: boolean,
  ): Promise<BoardCommandResult> {
    const fields = { tokenIds: [...tokenIds], active };
    return this.sender.send(BOARD_EVENTS.setTokenPatrolsActive, scope, fields);
  }
}
