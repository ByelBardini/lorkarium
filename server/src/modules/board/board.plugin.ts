import type { Database } from '../../database/database';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import type { ClockPort } from '../auth/clock.port';
import { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { CombatDao } from '../combat/combat.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { DrawingsDao } from '../drawings/drawings.dao';
import { EffectAreasDao } from '../effect-areas/effect-areas.dao';
import { LightsDao } from '../lights/lights.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import type { ScenesService } from '../scenes/scenes.service';
import { MainTokensDao } from '../tokens/main-tokens.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { WallsDao } from '../walls/walls.dao';
import { createBoardGateway, type BoardGatewayDeps } from './board.gateway';
import { BoardService } from './board.service';
import type { FastifyBaseLogger } from 'fastify';

export type BoardModuleOptions = Readonly<{
  db: Database;
  scenes: Pick<ScenesService, 'configure'>;
  tokens: BoardGatewayDeps['tokens'];
  tokenBatch: BoardGatewayDeps['tokenBatch'];
  tokenAppearance: BoardGatewayDeps['tokenAppearance'];
  mainToken: BoardGatewayDeps['mainToken'];
  conditions: BoardGatewayDeps['conditions'];
  combat: BoardGatewayDeps['combat'];
  drawings: BoardGatewayDeps['drawings'];
  effectAreas: BoardGatewayDeps['effectAreas'];
  walls: BoardGatewayDeps['walls'];
  lights: BoardGatewayDeps['lights'];
  clock: ClockPort;
  realtime: Pick<Realtime, 'reauthenticate'>;
  log: FastifyBaseLogger;
}>;

export type BoardModule = Readonly<{ gateway: (socket: RealtimeSocket) => void }>;

/** Wires the board: the snapshot service and the Socket.IO edge of every board module.
 *
 *  Example: `realtime.onConnection(createBoardModule(options).gateway)` */
export function createBoardModule(options: BoardModuleOptions): BoardModule {
  const { db, scenes, tokens, tokenBatch, tokenAppearance, conditions, combat, drawings } = options;
  const { clock, effectAreas, walls, lights, mainToken } = options;
  const { realtime, log } = options;
  const members = new CampaignMembersDao(db);
  const board = new BoardService({
    members,
    scenes: new ScenesDao(db),
    tokens: new TokensDao(db),
    conditions: new ConditionsDao(db),
    combat: new CombatDao(db),
    drawings: new DrawingsDao(db),
    effectAreas: new EffectAreasDao(db),
    walls: new WallsDao(db),
    lights: new LightsDao(db),
    mainTokens: new MainTokensDao(db),
    clock,
  });
  const gateway = createBoardGateway({
    board,
    scenes,
    tokens,
    tokenBatch,
    tokenAppearance,
    mainToken,
    conditions,
    combat,
    drawings,
    effectAreas,
    walls,
    lights,
    realtime,
    clock,
    log,
  });
  return { gateway };
}
