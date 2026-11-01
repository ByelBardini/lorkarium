import {
  addPlayersCommandDto,
  adjustCharacterBarCommandDto,
  characterSyncCommandDto,
  linkTokenToCardCommandDto,
  unlinkTokenFromCardCommandDto,
  updateCharacterCommandDto,
  type AddPlayersAckDto,
  type CharacterSyncAckDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import type { AckOf } from '../../realtime/realtime-ack';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import type { CharactersService } from '../characters/characters.service';
import type { TokenBatchService } from '../tokens/token-batch.service';
import type { TokenLinkService } from '../tokens/token-link.service';
import type { BindCommand, CampaignCommand, CommandOk, Handler } from './board-command-edge';

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
  characters: Pick<CharactersService, 'update' | 'adjustBar' | 'sync'>;
}>;

/** How the commands of one connection are bound: a read (`bind`), a write answering its version
 *  (`mutate`) and a write answering what its handler gives (`write`), both through the queue. */
export type CharacterBinders = Readonly<{
  bind: BindCommand;
  mutate: MutateCommand;
  write: WriteCommand;
}>;

type AddPlayersOk = Extract<AddPlayersAckDto, { ok: true }>;
type CharacterSyncOk = Extract<CharacterSyncAckDto, { ok: true }>;

/** The commands of the characters on one connection: change one and read them all, link a token
 *  to a card and back, and put every player's character in a grid.
 *
 *  Example: `bindCharacterCommands(socket, { bind, mutate, write }, { tokenLink, tokenBatch, characters })` */
export function bindCharacterCommands(
  socket: RealtimeSocket,
  binders: CharacterBinders,
  deps: CharacterCommandsDeps,
): void {
  bindCharacterOwnCommands(socket, binders, deps.characters);
  const { mutate, write } = binders;
  const { tokenLink, tokenBatch } = deps;
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

// The commands on the character itself; the sync is a read, so it skips the table's queue.
function bindCharacterOwnCommands(
  socket: RealtimeSocket,
  { bind, mutate }: CharacterBinders,
  characters: CharacterCommandsDeps['characters'],
): void {
  socket.on(
    'character:update',
    mutate(updateCharacterCommandDto, characters.update.bind(characters)),
  );
  socket.on(
    'character:adjustBar',
    mutate(adjustCharacterBarCommandDto, characters.adjustBar.bind(characters)),
  );
  socket.on(
    'character:sync',
    bind(characterSyncCommandDto, async (userId, { campaignId }): Promise<CharacterSyncOk> => {
      return { ok: true, ...(await characters.sync(userId, campaignId)) };
    }),
  );
}
