import {
  addPlayersCommandDto,
  linkTokenToCardCommandDto,
  unlinkTokenFromCardCommandDto,
  type AddPlayersAckDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import type { AckOf } from '../../realtime/realtime-ack';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import type { TokenBatchService } from '../tokens/token-batch.service';
import type { TokenLinkService } from '../tokens/token-link.service';
import type { CampaignCommand, CommandOk, Handler } from './board-command-edge';

/** A command that writes and answers the version it produced, waiting for the table's queue. */
export type MutateCommand = <C extends CampaignCommand>(
  schema: z.ZodType<C>,
  run: (userId: string, campaignId: string, command: C) => Promise<number>,
) => (payload: unknown, ack: AckOf<CommandOk>) => void;

/** A command that writes and answers what its handler gives, waiting for the table's queue. */
export type WriteCommand = <C extends CampaignCommand, A>(
  schema: z.ZodType<C>,
  handler: Handler<C, A>,
) => (payload: unknown, ack: AckOf<A>) => void;

export type CharacterCommandsDeps = Readonly<{
  tokenLink: Pick<TokenLinkService, 'link' | 'unlink'>;
  tokenBatch: Pick<TokenBatchService, 'addPlayers'>;
}>;

type AddPlayersOk = Extract<AddPlayersAckDto, { ok: true }>;

/** The commands of the characters on one connection: link a token to a card and back, and put
 *  every player's character in a grid.
 *
 *  Example: `bindCharacterCommands(socket, { mutate, write }, { tokenLink, tokenBatch })` */
export function bindCharacterCommands(
  socket: RealtimeSocket,
  { mutate, write }: Readonly<{ mutate: MutateCommand; write: WriteCommand }>,
  { tokenLink, tokenBatch }: CharacterCommandsDeps,
): void {
  socket.on('token:linkToCard', mutate(linkTokenToCardCommandDto, tokenLink.link.bind(tokenLink)));
  socket.on(
    'token:unlinkFromCard',
    mutate(unlinkTokenFromCardCommandDto, tokenLink.unlink.bind(tokenLink)),
  );
  socket.on(
    'token:addPlayers',
    write(addPlayersCommandDto, async (userId, command): Promise<AddPlayersOk> => {
      const added = await tokenBatch.addPlayers(userId, command.campaignId, command);
      return { ok: true, ...added };
    }),
  );
}
