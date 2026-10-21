import {
  addCombatantsCommandDto,
  adjustBarCommandDto,
  applyConditionCommandDto,
  applyConditionsCommandDto,
  boardCommandDto,
  configureSceneCommandDto,
  createDrawingsCommandDto,
  createEffectAreasCommandDto,
  createTokenCommandDto,
  createTokensCommandDto,
  createWallsCommandDto,
  createLightsCommandDto,
  deleteLightsCommandDto,
  moveLightsCommandDto,
  setLightColorsCommandDto,
  setLightConesCommandDto,
  setLightRangesCommandDto,
  setLightsLitCommandDto,
  defineConditionCommandDto,
  deleteDrawingsCommandDto,
  deleteEffectAreasCommandDto,
  deleteTokenCommandDto,
  deleteTokensCommandDto,
  deleteWallsCommandDto,
  eraseWallAreaCommandDto,
  eraseWallSegmentCommandDto,
  dragTokensCommandDto,
  endCombatCommandDto,
  moveDrawingsCommandDto,
  moveInTieCommandDto,
  moveTokenCommandDto,
  moveTokensCommandDto,
  moveWallsCommandDto,
  nextTurnCommandDto,
  previousTurnCommandDto,
  regroupTokensCommandDto,
  removeCombatantCommandDto,
  removeConditionCommandDto,
  renameCombatantCommandDto,
  reshapeEffectAreasCommandDto,
  setInitiativeCommandDto,
  setDoorCommandDto,
  setTokenLayerCommandDto,
  setWallKindsCommandDto,
  faceTokensCommandDto,
  restyleTokensCommandDto,
  resizeTokensCommandDto,
  startCombatCommandDto,
  updateTokenCommandDto,
  type ApiErrorDto,
  type BoardCommandAckDto,
  type BoardSyncAckDto,
} from '@lorkarium/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError, type z } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { answerAck, type AckOf } from '../../realtime/realtime-ack';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import type { ClockPort } from '../auth/clock.port';
import { AssetError } from '../assets/assets.error';
import { CombatError } from '../combat/combat.error';
import type { CombatService } from '../combat/combat.service';
import { ConditionError } from '../conditions/conditions.error';
import type { ConditionsService } from '../conditions/conditions.service';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { DrawingError } from '../drawings/drawings.error';
import type { DrawingsService } from '../drawings/drawings.service';
import { EffectAreaError } from '../effect-areas/effect-areas.error';
import type { EffectAreasService } from '../effect-areas/effect-areas.service';
import { toSceneGrid } from '../scenes/scenes.mapper';
import type { CreatedInScene } from '../scenes/locked-scene';
import type { ScenesService } from '../scenes/scenes.service';
import { SessionEndedError, SessionError } from '../sessions/sessions.error';
import { TokenError } from '../tokens/tokens.error';
import type { TokenAppearanceService } from '../tokens/token-appearance.service';
import type { TokenBatchService } from '../tokens/token-batch.service';
import type { TokensService } from '../tokens/tokens.service';
import { LightError } from '../lights/lights.error';
import type { LightsService } from '../lights/lights.service';
import { WallError } from '../walls/walls.error';
import type { WallsService } from '../walls/walls.service';
import { BoardError, CommandRateLimitedError } from './board.error';
import type { BoardService } from './board.service';
import { CommandRateBo, fullBucket, type CommandBucket } from './command-rate.bo';

export type BoardGatewayDeps = Readonly<{
  board: BoardService;
  scenes: Pick<ScenesService, 'configure'>;
  tokens: Pick<
    TokensService,
    'create' | 'update' | 'move' | 'moveMany' | 'dragMany' | 'setLayer' | 'adjustBar' | 'delete'
  >;
  tokenBatch: Pick<TokenBatchService, 'createMany' | 'deleteMany'>;
  tokenAppearance: Pick<TokenAppearanceService, 'faceMany' | 'restyleMany' | 'resizeMany'>;
  conditions: Pick<ConditionsService, 'define' | 'apply' | 'applyMany' | 'remove'>;
  combat: Pick<
    CombatService,
    | 'start'
    | 'end'
    | 'addCombatants'
    | 'removeCombatant'
    | 'regroupTokens'
    | 'renameCombatant'
    | 'moveInTie'
    | 'setInitiative'
    | 'nextTurn'
    | 'previousTurn'
  >;
  drawings: Pick<DrawingsService, 'createMany' | 'moveMany' | 'deleteMany'>;
  effectAreas: Pick<EffectAreasService, 'createMany' | 'reshapeMany' | 'deleteMany'>;
  walls: Pick<
    WallsService,
    | 'createMany'
    | 'moveMany'
    | 'deleteMany'
    | 'setKindMany'
    | 'setDoor'
    | 'eraseSegment'
    | 'eraseArea'
  >;
  lights: Pick<
    LightsService,
    | 'createMany'
    | 'moveMany'
    | 'setRangeMany'
    | 'setColorMany'
    | 'setConeMany'
    | 'setLitMany'
    | 'deleteMany'
  >;
  realtime: Pick<Realtime, 'reauthenticate'>;
  clock: ClockPort;
  log: FastifyBaseLogger;
}>;

type CommandOk = Extract<BoardCommandAckDto, { ok: true }>;
type CampaignCommand = Readonly<{ campaignId: string }>;
type Handler<Command, Answer> = (userId: string, command: Command) => Promise<Answer>;
// The service reads the payload fields; the envelope (actionId, campaignId) rides along unread.
type Mutation<Command> = (userId: string, campaignId: string, command: Command) => Promise<number>;
type Creation<Command> = (
  userId: string,
  campaignId: string,
  command: Command,
) => Promise<CreatedInScene>;

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<string, string>> = {
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  FORBIDDEN: 'Your role at this table does not allow it',
  UNAUTHENTICATED: 'A valid session is required',
  TOKEN_NOT_FOUND: 'Token not found',
  ASSET_NOT_FOUND: 'Image not found',
  BAR_NOT_FOUND: 'Bar not found',
  OUT_OF_SCENE: 'It does not fit the scene there',
  INVALID_CONTROLLER: 'Only members of the table can control a token',
  CONDITION_NOT_FOUND: 'Condition not found',
  COMBAT_NOT_ACTIVE: 'There is no combat in this scene',
  COMBAT_ALREADY_ACTIVE: 'This scene already has a combat',
  TURN_ALREADY_CHANGED: 'The turn already moved',
  COMBATANT_NOT_FOUND: 'Combatant not found',
  RATE_LIMITED: 'Too many commands in a row',
  STALE_UNDO: 'Someone changed it after the action being undone',
  DRAWING_NOT_FOUND: 'Drawing not found',
  DRAWING_LIMIT: 'This scene has too many drawings',
  EFFECT_AREA_NOT_FOUND: 'Area of effect not found',
  EFFECT_AREA_LIMIT: 'This scene has too many areas of effect',
  WALL_NOT_FOUND: 'Wall not found',
  WALL_LIMIT: 'This scene has too many walls',
  INVALID_DOOR: 'Only a straight wall can be a door',
  WALL_BLOCKED: 'A wall blocks the way',
  DOOR_LOCKED: 'The door is locked',
  WALL_SEGMENT_NOT_FOUND: 'That piece of wall is not there',
  LIGHT_NOT_FOUND: 'Light not found',
  LIGHT_LIMIT: 'Too many lights in this scene',
};

/** Socket.IO edge of the board (scene and tokens): validates the command, re-reads the session,
 *  requires the table to be open on this connection, delegates and answers in the ack with the
 *  version it produced. Events go out by the publisher, after the commit.
 *
 *  Example: `realtime.onConnection(createBoardGateway({ board, scenes, tokens, realtime, log }))` */
export function createBoardGateway(deps: BoardGatewayDeps): (socket: RealtimeSocket) => void {
  const { tokens, tokenBatch, tokenAppearance: appearance, conditions, combat, drawings } = deps;
  const { effectAreas, walls, lights } = deps;
  const rate = new CommandRateGuard(deps.clock);
  return (socket) => {
    const bind = <C extends CampaignCommand, A>(schema: z.ZodType<C>, handler: Handler<C, A>) =>
      onCommand({ deps, rate, socket }, schema, handler);
    socket.on(
      'board:sync',
      bind(boardCommandDto, async (userId, { campaignId }) => {
        const state = await deps.board.snapshotFor(userId, campaignId);
        return { ok: true, state } satisfies Extract<BoardSyncAckDto, { ok: true }>;
      }),
    );
    socket.on(
      'scene:configure',
      bind(configureSceneCommandDto, (userId, command) =>
        versionOf(
          deps.scenes.configure(
            userId,
            command.campaignId,
            toSceneGrid(command),
            command.backgroundAssetId,
            command.vision,
          ),
        ),
      ),
    );
    const mutate = <C extends CampaignCommand>(schema: z.ZodType<C>, run: Mutation<C>) =>
      bind(schema, (userId, command) => versionOf(run(userId, command.campaignId, command)));
    // A creating batch also answers the ids it gave: the sender's undo needs them.
    const create = <C extends CampaignCommand>(schema: z.ZodType<C>, run: Creation<C>) =>
      bind(schema, async (userId, command): Promise<CommandOk> => {
        const { version, createdIds } = await run(userId, command.campaignId, command);
        return { ok: true, version, createdIds };
      });
    socket.on('token:create', mutate(createTokenCommandDto, tokens.create.bind(tokens)));
    socket.on('token:update', mutate(updateTokenCommandDto, tokens.update.bind(tokens)));
    socket.on('token:move', mutate(moveTokenCommandDto, tokens.move.bind(tokens)));
    socket.on('token:moveMany', mutate(moveTokensCommandDto, tokens.moveMany.bind(tokens)));
    socket.on(
      'token:dragMany',
      bind(dragTokensCommandDto, (userId, command) =>
        versionOf(tokens.dragMany(userId, command.campaignId, command, socket.id)),
      ),
    );
    socket.on('token:setLayer', mutate(setTokenLayerCommandDto, tokens.setLayer.bind(tokens)));
    socket.on('token:faceMany', mutate(faceTokensCommandDto, appearance.faceMany.bind(appearance)));
    socket.on(
      'token:restyleMany',
      mutate(restyleTokensCommandDto, appearance.restyleMany.bind(appearance)),
    );
    socket.on(
      'token:resizeMany',
      mutate(resizeTokensCommandDto, appearance.resizeMany.bind(appearance)),
    );
    socket.on('token:adjustBar', mutate(adjustBarCommandDto, tokens.adjustBar.bind(tokens)));
    socket.on('token:delete', mutate(deleteTokenCommandDto, tokens.delete.bind(tokens)));
    socket.on(
      'token:createMany',
      create(createTokensCommandDto, tokenBatch.createMany.bind(tokenBatch)),
    );
    socket.on(
      'token:deleteMany',
      mutate(deleteTokensCommandDto, tokenBatch.deleteMany.bind(tokenBatch)),
    );
    socket.on(
      'drawing:createMany',
      create(createDrawingsCommandDto, drawings.createMany.bind(drawings)),
    );
    socket.on('drawing:moveMany', mutate(moveDrawingsCommandDto, drawings.moveMany.bind(drawings)));
    socket.on(
      'drawing:deleteMany',
      mutate(deleteDrawingsCommandDto, drawings.deleteMany.bind(drawings)),
    );
    socket.on(
      'effectArea:createMany',
      create(createEffectAreasCommandDto, effectAreas.createMany.bind(effectAreas)),
    );
    socket.on(
      'effectArea:reshapeMany',
      mutate(reshapeEffectAreasCommandDto, effectAreas.reshapeMany.bind(effectAreas)),
    );
    socket.on(
      'effectArea:deleteMany',
      mutate(deleteEffectAreasCommandDto, effectAreas.deleteMany.bind(effectAreas)),
    );
    socket.on('wall:createMany', create(createWallsCommandDto, walls.createMany.bind(walls)));
    socket.on('wall:moveMany', mutate(moveWallsCommandDto, walls.moveMany.bind(walls)));
    socket.on('wall:deleteMany', mutate(deleteWallsCommandDto, walls.deleteMany.bind(walls)));
    socket.on('wall:setKindMany', mutate(setWallKindsCommandDto, walls.setKindMany.bind(walls)));
    socket.on('wall:setDoor', mutate(setDoorCommandDto, walls.setDoor.bind(walls)));
    socket.on(
      'wall:eraseSegment',
      create(eraseWallSegmentCommandDto, walls.eraseSegment.bind(walls)),
    );
    socket.on('wall:eraseArea', create(eraseWallAreaCommandDto, walls.eraseArea.bind(walls)));
    socket.on('light:createMany', create(createLightsCommandDto, lights.createMany.bind(lights)));
    socket.on('light:moveMany', mutate(moveLightsCommandDto, lights.moveMany.bind(lights)));
    socket.on(
      'light:setRangeMany',
      mutate(setLightRangesCommandDto, lights.setRangeMany.bind(lights)),
    );
    socket.on(
      'light:setColorMany',
      mutate(setLightColorsCommandDto, lights.setColorMany.bind(lights)),
    );
    socket.on(
      'light:setConeMany',
      mutate(setLightConesCommandDto, lights.setConeMany.bind(lights)),
    );
    socket.on('light:setLitMany', mutate(setLightsLitCommandDto, lights.setLitMany.bind(lights)));
    socket.on('light:deleteMany', mutate(deleteLightsCommandDto, lights.deleteMany.bind(lights)));
    socket.on(
      'condition:define',
      mutate(defineConditionCommandDto, conditions.define.bind(conditions)),
    );
    socket.on(
      'condition:apply',
      mutate(applyConditionCommandDto, conditions.apply.bind(conditions)),
    );
    socket.on(
      'condition:applyMany',
      mutate(applyConditionsCommandDto, conditions.applyMany.bind(conditions)),
    );
    socket.on(
      'condition:remove',
      mutate(removeConditionCommandDto, conditions.remove.bind(conditions)),
    );
    socket.on('combat:start', mutate(startCombatCommandDto, combat.start.bind(combat)));
    socket.on('combat:end', mutate(endCombatCommandDto, combat.end.bind(combat)));
    socket.on(
      'combat:addCombatants',
      mutate(addCombatantsCommandDto, combat.addCombatants.bind(combat)),
    );
    socket.on(
      'combat:removeCombatant',
      mutate(removeCombatantCommandDto, combat.removeCombatant.bind(combat)),
    );
    socket.on(
      'combat:regroupTokens',
      mutate(regroupTokensCommandDto, combat.regroupTokens.bind(combat)),
    );
    socket.on(
      'combat:renameCombatant',
      mutate(renameCombatantCommandDto, combat.renameCombatant.bind(combat)),
    );
    socket.on('combat:moveInTie', mutate(moveInTieCommandDto, combat.moveInTie.bind(combat)));
    socket.on(
      'combat:setInitiative',
      mutate(setInitiativeCommandDto, combat.setInitiative.bind(combat)),
    );
    socket.on('combat:nextTurn', mutate(nextTurnCommandDto, combat.nextTurn.bind(combat)));
    socket.on(
      'combat:previousTurn',
      mutate(previousTurnCommandDto, combat.previousTurn.bind(combat)),
    );
  };
}

async function versionOf(pending: Promise<number>): Promise<CommandOk> {
  return { ok: true, version: await pending };
}

type CommandContext = Readonly<{
  deps: BoardGatewayDeps;
  rate: CommandRateGuard;
  socket: RealtimeSocket;
}>;

// The rate comes first: a flood is refused before it costs a session read or a parse.
function onCommand<Command extends CampaignCommand, Answer>(
  { deps, rate, socket }: CommandContext,
  schema: z.ZodType<Command>,
  handler: Handler<Command, Answer>,
): (payload: unknown, ack: AckOf<Answer>) => void {
  const failureOf = (error: unknown): ApiErrorDto => toAckError(deps, error);
  const dropIfEnded = (error: unknown): void => {
    if (error instanceof SessionEndedError) socket.disconnect(true);
  };
  return (payload, ack) => {
    const work = async (): Promise<Answer> => {
      rate.admit(socket);
      const command = schema.parse(payload);
      return handler(await openTableUserOf(deps, socket, command.campaignId), command);
    };
    void answerAck(ack, work, failureOf, dropIfEnded);
  };
}

// The table must be open on this connection: a member who never joined it hears nothing of it.
async function openTableUserOf(
  deps: BoardGatewayDeps,
  socket: RealtimeSocket,
  campaignId: string,
): Promise<string> {
  const user = await deps.realtime.reauthenticate(socket);
  if (!user) throw new SessionEndedError(socket.id);
  if (!socket.data.campaignIds.has(campaignId)) {
    throw new CampaignNotFoundError({ campaignId, userId: user.id });
  }
  return user.id;
}

// One bucket per connection, kept beside the socket so the plumbing type stays untouched.
class CommandRateGuard {
  private readonly buckets = new WeakMap<RealtimeSocket, CommandBucket>();

  constructor(private readonly clock: ClockPort) {}

  admit(socket: RealtimeSocket): void {
    const now = this.clock.now().getTime();
    const outcome = new CommandRateBo(this.buckets.get(socket) ?? fullBucket(now)).take(now);
    this.buckets.set(socket, outcome.bucket);
    if (!outcome.allowed) throw new CommandRateLimitedError(socket.id, outcome.retryAfterSeconds);
  }
}

function toAckError(deps: BoardGatewayDeps, error: unknown): ApiErrorDto {
  if (error instanceof ZodError) return invalidBodyError(error);
  if (error instanceof CommandRateLimitedError) {
    const { retryAfterSeconds } = error;
    return {
      code: error.code,
      message: PUBLIC_MESSAGE[error.code] ?? error.code,
      retryAfterSeconds,
    };
  }
  const known =
    error instanceof CampaignError ||
    error instanceof SessionError ||
    error instanceof TokenError ||
    error instanceof ConditionError ||
    error instanceof CombatError ||
    error instanceof DrawingError ||
    error instanceof EffectAreaError ||
    error instanceof WallError ||
    error instanceof LightError ||
    error instanceof AssetError ||
    error instanceof BoardError;
  if (known) {
    const message = PUBLIC_MESSAGE[error.code];
    if (message) return { code: error.code, message };
  }
  deps.log.error({ err: error }, 'unexpected error in the board gateway');
  return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
}
