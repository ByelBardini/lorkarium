import type { Database } from '../../database/database';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CombatDao } from '../combat/combat.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import type { ScenesService } from '../scenes/scenes.service';
import { TokensDao } from '../tokens/tokens.dao';
import { createBoardGateway, type BoardGatewayDeps } from './board.gateway';
import { BoardService } from './board.service';
import type { FastifyBaseLogger } from 'fastify';

export type BoardModuleOptions = Readonly<{
  db: Database;
  scenes: Pick<ScenesService, 'configure'>;
  tokens: BoardGatewayDeps['tokens'];
  conditions: BoardGatewayDeps['conditions'];
  combat: BoardGatewayDeps['combat'];
  clock: ClockPort;
  realtime: Pick<Realtime, 'reauthenticate'>;
  log: FastifyBaseLogger;
}>;

export type BoardModule = Readonly<{ gateway: (socket: RealtimeSocket) => void }>;

/** Wires the board: the snapshot service and the Socket.IO edge of every board module.
 *
 *  Example: `realtime.onConnection(createBoardModule(options).gateway)` */
export function createBoardModule(options: BoardModuleOptions): BoardModule {
  const { db, scenes, tokens, conditions, combat, clock, realtime, log } = options;
  const members = new CampaignMembersDao(db);
  const board = new BoardService({
    members,
    scenes: new ScenesDao(db),
    tokens: new TokensDao(db),
    conditions: new ConditionsDao(db),
    combat: new CombatDao(db),
    clock,
  });
  const gateway = createBoardGateway({
    board,
    scenes,
    tokens,
    conditions,
    combat,
    realtime,
    clock,
    log,
  });
  return { gateway };
}
