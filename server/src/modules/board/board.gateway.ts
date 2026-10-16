import {
  addCombatantsCommandDto,
  adjustBarCommandDto,
  applyConditionCommandDto,
  boardCommandDto,
  configureSceneCommandDto,
  createTokenCommandDto,
  defineConditionCommandDto,
  deleteTokenCommandDto,
  endCombatCommandDto,
  moveInTieCommandDto,
  moveTokenCommandDto,
  nextTurnCommandDto,
  previousTurnCommandDto,
  removeCombatantCommandDto,
  removeConditionCommandDto,
  setInitiativeCommandDto,
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
import { CombatError } from '../combat/combat.error';
import type { CombatService } from '../combat/combat.service';
import { ConditionError } from '../conditions/conditions.error';
import type { ConditionsService } from '../conditions/conditions.service';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { toSceneGrid } from '../scenes/scenes.mapper';
import type { ScenesService } from '../scenes/scenes.service';
import { SessionEndedError, SessionError } from '../sessions/sessions.error';
import { TokenError } from '../tokens/tokens.error';
import type { TokensService } from '../tokens/tokens.service';
import { BoardError, CommandRateLimitedError } from './board.error';
import type { BoardService } from './board.service';
import { CommandRateBo, fullBucket, type CommandBucket } from './command-rate.bo';

export type BoardGatewayDeps = Readonly<{
  board: BoardService;
  scenes: Pick<ScenesService, 'configure'>;
  tokens: Pick<TokensService, 'create' | 'update' | 'move' | 'adjustBar' | 'delete'>;
  conditions: Pick<ConditionsService, 'define' | 'apply' | 'remove'>;
  combat: Pick<
    CombatService,
    | 'start'
    | 'end'
    | 'addCombatants'
    | 'removeCombatant'
    | 'moveInTie'
    | 'setInitiative'
    | 'nextTurn'
    | 'previousTurn'
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

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<string, string>> = {
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  FORBIDDEN: 'Your role at this table does not allow it',
  UNAUTHENTICATED: 'A valid session is required',
  TOKEN_NOT_FOUND: 'Token not found',
  BAR_NOT_FOUND: 'Bar not found',
  OUT_OF_SCENE: 'The token does not fit the scene there',
  INVALID_CONTROLLER: 'Only members of the table can control a token',
  CONDITION_NOT_FOUND: 'Condition not found',
  COMBAT_NOT_ACTIVE: 'There is no combat in this scene',
  COMBAT_ALREADY_ACTIVE: 'This scene already has a combat',
  TURN_ALREADY_CHANGED: 'The turn already moved',
  COMBATANT_NOT_FOUND: 'Combatant not found',
  RATE_LIMITED: 'Too many commands in a row',
};

/** Socket.IO edge of the board (scene and tokens): validates the command, re-reads the session,
 *  requires the table to be open on this connection, delegates and answers in the ack with the
 *  version it produced. Events go out by the publisher, after the commit.
 *
 *  Example: `realtime.onConnection(createBoardGateway({ board, scenes, tokens, realtime, log }))` */
export function createBoardGateway(deps: BoardGatewayDeps): (socket: RealtimeSocket) => void {
  const { tokens, conditions, combat } = deps;
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
        versionOf(deps.scenes.configure(userId, command.campaignId, toSceneGrid(command))),
      ),
    );
    const mutate = <C extends CampaignCommand>(schema: z.ZodType<C>, run: Mutation<C>) =>
      bind(schema, (userId, command) => versionOf(run(userId, command.campaignId, command)));
    socket.on('token:create', mutate(createTokenCommandDto, tokens.create.bind(tokens)));
    socket.on('token:update', mutate(updateTokenCommandDto, tokens.update.bind(tokens)));
    socket.on('token:move', mutate(moveTokenCommandDto, tokens.move.bind(tokens)));
    socket.on('token:adjustBar', mutate(adjustBarCommandDto, tokens.adjustBar.bind(tokens)));
    socket.on('token:delete', mutate(deleteTokenCommandDto, tokens.delete.bind(tokens)));
    socket.on(
      'condition:define',
      mutate(defineConditionCommandDto, conditions.define.bind(conditions)),
    );
    socket.on(
      'condition:apply',
      mutate(applyConditionCommandDto, conditions.apply.bind(conditions)),
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
    error instanceof BoardError;
  if (known) {
    const message = PUBLIC_MESSAGE[error.code];
    if (message) return { code: error.code, message };
  }
  deps.log.error({ err: error }, 'unexpected error in the board gateway');
  return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
}
