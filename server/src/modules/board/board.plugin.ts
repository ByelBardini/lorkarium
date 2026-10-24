import type { Database } from '../../database/database';
import { runInSnapshot } from '../../database/transaction';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import type { ClockPort } from '../auth/clock.port';
import type { MembershipReader } from '../campaigns/cached-memberships';
import { CombatDao } from '../combat/combat.dao';
import { ConditionsDao } from '../conditions/conditions.dao';
import { DrawingsDao } from '../drawings/drawings.dao';
import { EffectAreasDao } from '../effect-areas/effect-areas.dao';
import { LightsDao } from '../lights/lights.dao';
import { MemberCardsDao } from '../member-cards/member-cards.dao';
import { ScenesDao } from '../scenes/scenes.dao';
import type { ScenesService } from '../scenes/scenes.service';
import { MainTokensDao } from '../tokens/main-tokens.dao';
import { TokensDao } from '../tokens/tokens.dao';
import { WallsDao } from '../walls/walls.dao';
import { createBoardGateway, type BoardGatewayDeps } from './board.gateway';
import { BoardService, type BoardSnapshotRunner } from './board.service';
import type { FastifyBaseLogger } from 'fastify';

export type BoardModuleOptions = Readonly<{
  db: Database;
  /** Shared by the board modules: the memberships remembered by the campaigns module. */
  members: MembershipReader;
  scenes: Pick<ScenesService, 'configure'>;
  sceneWatch: BoardGatewayDeps['sceneWatch'];
  sceneActivation: BoardGatewayDeps['sceneActivation'];
  tokens: BoardGatewayDeps['tokens'];
  tokenBatch: BoardGatewayDeps['tokenBatch'];
  tokenAppearance: BoardGatewayDeps['tokenAppearance'];
  mainToken: BoardGatewayDeps['mainToken'];
  tokenLink: BoardGatewayDeps['tokenLink'];
  memberCards: BoardGatewayDeps['memberCards'];
  pings: BoardGatewayDeps['pings'];
  conditions: BoardGatewayDeps['conditions'];
  conditionCatalog: BoardGatewayDeps['conditionCatalog'];
  combat: BoardGatewayDeps['combat'];
  drawings: BoardGatewayDeps['drawings'];
  effectAreas: BoardGatewayDeps['effectAreas'];
  walls: BoardGatewayDeps['walls'];
  lights: BoardGatewayDeps['lights'];
  clock: ClockPort;
  realtime: Pick<Realtime, 'reauthenticate'>;
  rate: BoardGatewayDeps['rate'];
  queue: BoardGatewayDeps['queue'];
  log: FastifyBaseLogger;
}>;

export type BoardModule = Readonly<{ gateway: (socket: RealtimeSocket) => void }>;

/** Wires the board: the snapshot service and the Socket.IO edge of every board module.
 *
 *  Example: `realtime.onConnection(createBoardModule(options).gateway)` */
export function createBoardModule(options: BoardModuleOptions): BoardModule {
  const { db, scenes, tokens, tokenBatch, tokenAppearance, conditions, combat, drawings } = options;
  const { clock, effectAreas, walls, lights, mainToken, memberCards } = options;
  const { realtime, rate, queue, log } = options;
  const { members, sceneWatch, sceneActivation, tokenLink, pings, conditionCatalog } = options;
  const snapshot: BoardSnapshotRunner = (work) =>
    runInSnapshot(db, (tx) =>
      work({
        scenes: new ScenesDao(tx),
        tokens: new TokensDao(tx),
        conditions: new ConditionsDao(tx),
        combat: new CombatDao(tx),
        drawings: new DrawingsDao(tx),
        effectAreas: new EffectAreasDao(tx),
        walls: new WallsDao(tx),
        lights: new LightsDao(tx),
        mainTokens: new MainTokensDao(tx),
        memberCards: new MemberCardsDao(tx),
      }),
    );
  const board = new BoardService({ members, snapshot, clock });
  const gateway = createBoardGateway({
    board,
    scenes,
    sceneWatch,
    sceneActivation,
    tokens,
    tokenBatch,
    tokenAppearance,
    mainToken,
    tokenLink,
    memberCards,
    pings,
    conditions,
    conditionCatalog,
    combat,
    drawings,
    effectAreas,
    walls,
    lights,
    realtime,
    rate,
    queue,
    log,
  });
  return { gateway };
}
