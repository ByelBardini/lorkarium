import type { ApiErrorDto, BoardCommandAckDto } from '@lorkarium/contracts';
import type { FastifyBaseLogger } from 'fastify';
import { ZodError, type z } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { answerAck, type AckOf } from '../../realtime/realtime-ack';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { AssetError } from '../assets/assets.error';
import { CombatError } from '../combat/combat.error';
import { ConditionError } from '../conditions/conditions.error';
import { CampaignError, CampaignNotFoundError } from '../campaigns/campaigns.error';
import { CharacterError } from '../characters/characters.error';
import { ChatError } from '../chat/chat.error';
import { InvalidDiceExpressionError } from '../dice/dice.error';
import { DrawingError } from '../drawings/drawings.error';
import { EffectAreaError } from '../effect-areas/effect-areas.error';
import { LightError } from '../lights/lights.error';
import { SceneError } from '../scenes/scenes.error';
import { SessionEndedError, SessionError } from '../sessions/sessions.error';
import { SheetError } from '../sheets/sheets.error';
import { TokenError } from '../tokens/tokens.error';
import { WallError } from '../walls/walls.error';
import { BoardError, CommandRateLimitedError } from './board.error';

export type CommandOk = Extract<BoardCommandAckDto, { ok: true }>;
export type CampaignCommand = Readonly<{ campaignId: string }>;
export type Handler<Command, Answer> = (userId: string, command: Command) => Promise<Answer>;

/** Binds a handler to a socket event: validated, re-authenticated, on an open table, acked. */
export type BindCommand = <C extends CampaignCommand, A>(
  schema: z.ZodType<C>,
  handler: Handler<C, A>,
) => (payload: unknown, ack: AckOf<A>) => void;

/** What every board command needs at the edge besides its service. */
export type CommandEdgeDeps = Readonly<{
  realtime: Pick<Realtime, 'reauthenticate'>;
  log: FastifyBaseLogger;
}>;

export type CommandContext = Readonly<{
  deps: CommandEdgeDeps;
  rate: CommandRateGuard;
  socket: RealtimeSocket;
}>;

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<string, string>> = {
  CAMPAIGN_NOT_FOUND: 'Campaign not found',
  FORBIDDEN: 'Your role at this table does not allow it',
  UNAUTHENTICATED: 'A valid session is required',
  TOKEN_NOT_FOUND: 'Token not found',
  TOKEN_LIMIT: 'This scene has too many tokens',
  ASSET_NOT_FOUND: 'Image not found',
  BAR_NOT_FOUND: 'Bar not found',
  OUT_OF_SCENE: 'It does not fit the scene there',
  INVALID_CONTROLLER: 'Only members of the table can control a token',
  CONDITION_NOT_FOUND: 'Condition not found',
  CONDITION_NAME_TAKEN: 'Another condition of this table already has that name',
  INVALID_STACKS: 'That condition cannot have that many stacks',
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
  MEMBER_NOT_FOUND: 'Member not found',
  SCENE_NOT_FOUND: 'Scene not found',
  CHARACTER_ALREADY_PLACED: 'This character already has a token here',
  CHARACTER_NOT_FOUND: 'Character not found',
  TOKEN_NOT_LINKED: 'This token is not linked to a card',
  TOKEN_FORM_NOT_FOUND: 'This token has no such form',
  NO_FREE_CELLS: 'There are no free cells around there',
  CHAT_RECIPIENT_NOT_MEMBER: 'That person is not at this table',
  CHAT_RECIPIENT_IS_SENDER: 'A private message needs someone else',
  CHAT_SENDER_NOT_IN_GROUP: 'You are not in this group',
  CHAT_SPEAKER_NOT_ALLOWED: 'A character only speaks to the whole table',
  SHEET_NOT_FOUND: 'Sheet not found',
  SHEET_HAS_NO_TOKEN: 'This sheet is not held by a token',
};

/** The answer of a command that only reports the version it produced.
 *
 *  Example: `versionOf(tokens.move(userId, campaignId, command))` */
export async function versionOf(pending: Promise<number>): Promise<CommandOk> {
  return { ok: true, version: await pending };
}

/** The socket listener of one board command. The rate comes first: a flood is refused before it
 *  costs a session read or a parse.
 *
 *  Example: `socket.on('board:sync', onCommand(context, boardCommandDto, handler))` */
export function onCommand<Command extends CampaignCommand, Answer>(
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
  deps: CommandEdgeDeps,
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

function toAckError(deps: CommandEdgeDeps, error: unknown): ApiErrorDto {
  if (error instanceof ZodError) return invalidBodyError(error);
  if (error instanceof CommandRateLimitedError) {
    const { retryAfterSeconds } = error;
    return {
      code: error.code,
      message: PUBLIC_MESSAGE[error.code] ?? error.code,
      retryAfterSeconds,
    };
  }
  // The person's own text and which piece to fix: the same answer as the saved rolls give.
  if (error instanceof InvalidDiceExpressionError) {
    return { code: error.code, message: error.message };
  }
  if (isKnown(error)) {
    const message = PUBLIC_MESSAGE[error.code];
    if (message) return { code: error.code, message };
  }
  deps.log.error({ err: error }, 'unexpected error in the board gateway');
  return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
}

type KnownError =
  | CampaignError
  | SessionError
  | TokenError
  | ConditionError
  | CombatError
  | DrawingError
  | EffectAreaError
  | WallError
  | LightError
  | AssetError
  | SceneError
  | BoardError
  | ChatError
  | SheetError
  | CharacterError;

function isKnown(error: unknown): error is KnownError {
  return (
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
    error instanceof SceneError ||
    error instanceof BoardError ||
    error instanceof ChatError ||
    error instanceof SheetError ||
    error instanceof CharacterError
  );
}
