import { z } from 'zod';
import { realtimeAckFailureDto, stateVersionDto } from '../http/realtime-ack.dto';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import type { BoardCommandAckDto } from './board.dto';
import { conditionChangeDto } from './combat.dto';
import { cellIndexDto } from './token.dto';

/** `token:linkToCard` (master): the token becomes the character of `memberId` (a player). The
 *  first link creates the anchor in the cast with the token's bars, conditions and controllers;
 *  a later one, in another grid, adopts the anchor's (the token's own are dropped).
 *
 *  Example: `linkTokenToCardCommandDto.parse({ actionId, campaignId, sceneId, tokenId, memberId })` */
export const linkTokenToCardCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  memberId: z.uuid(),
});
export type LinkTokenToCardCommandDto = z.infer<typeof linkTokenToCardCommandDto>;

/** `token:unlinkFromCard` (master): the token keeps a copy of what it showed (the anchor's
 *  identity, bars, controllers and conditions) and stops following it; the anchor stays.
 *
 *  Example: `unlinkTokenFromCardCommandDto.parse({ actionId, campaignId, sceneId, tokenId })` */
export const unlinkTokenFromCardCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
});
export type UnlinkTokenFromCardCommandDto = z.infer<typeof unlinkTokenFromCardCommandDto>;

/** `token:addPlayers` (master): puts in the grid a token linked to each player who has an anchor,
 *  in the free cells around `center` (the middle of the master's view).
 *
 *  Example: `addPlayersCommandDto.parse({ actionId, campaignId, sceneId, center: { col: 10, row: 6 } })` */
export const addPlayersCommandDto = z.strictObject({
  ...boardCommandShape,
  center: z.strictObject({ col: cellIndexDto, row: cellIndexDto }),
});
export type AddPlayersCommandDto = z.infer<typeof addPlayersCommandDto>;

/** Answer to `token:addPlayers`: the ids of the tokens created (in the order of the players) and
 *  the players skipped because they have no anchor yet. With nobody to place, `createdIds` is
 *  empty and the version did not change. */
export const addPlayersAckDto = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    version: stateVersionDto,
    createdIds: z.array(z.uuid()),
    skippedMemberIds: z.array(z.uuid()),
  }),
  realtimeAckFailureDto,
]);
export type AddPlayersAckDto = z.infer<typeof addPlayersAckDto>;

/** `condition:changedMany`, to the cast: the conditions of anchors after the end of a turn of a
 *  token linked to them (counted down, the expired gone), in the cast's version. */
export const conditionsChangedDto = z.strictObject({
  ...boardEventShape,
  changes: z.array(conditionChangeDto),
});
export type ConditionsChangedDto = z.infer<typeof conditionsChangedDto>;

type CharacterAck<Answer> = (answer: Answer) => void;
type CommandAck = CharacterAck<BoardCommandAckDto>;

/** Client → server commands of the characters, merged into `BoardClientEvents`. */
export type CharacterClientEvents = {
  'token:linkToCard': (command: LinkTokenToCardCommandDto, ack: CommandAck) => void;
  'token:unlinkFromCard': (command: UnlinkTokenFromCardCommandDto, ack: CommandAck) => void;
  'token:addPlayers': (command: AddPlayersCommandDto, ack: CharacterAck<AddPlayersAckDto>) => void;
};

/** Server → room events of the characters, merged into `BoardServerEvents`. */
export type CharacterServerEvents = {
  'condition:changedMany': (event: ConditionsChangedDto) => void;
};
