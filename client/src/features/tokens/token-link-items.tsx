import type { TokenDto } from '@lorkarium/contracts';
import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { characterLinkTargetsOf, type CharacterLinkTarget } from '@/lib/character-link';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useCharacters, type CharactersStore } from '@/stores/characters-store';
import {
  characterLinkQuestion,
  LINK_TO_CHARACTER_TITLE,
  UNLINK_FROM_CHARACTER,
} from './token-messages';

/** A link that waits for the master's yes: the token drops its own bars and conditions for the
 *  character's. */
export type CharacterLinkRequest = Readonly<{
  tokenId: string;
  characterId: string;
  characterName: string;
}>;

export type TokenLinkItemsProps = Readonly<{
  token: TokenDto;
  /** The grid the token is on: a character already placed in it cannot get a second token. */
  board: StoreApi<BoardStore>;
  /** The table's characters, the ones a token can be linked to. */
  characters: StoreApi<CharactersStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** Picking a character asks first (`CharacterLinkRequest`). */
  onConfirmLink: (request: CharacterLinkRequest) => void;
}>;

/** The master's character items on a token's menu: "Ligar a personagem ▸" (one item per
 *  character of the table, the one already in this grid disabled) on a free token, "Desligar do
 *  personagem" on a linked one. A pick asks first.
 *
 *  Example: `<TokenLinkItems token={goblin} board={board} characters={table.characters} interaction={interaction} onConfirmLink={ask} />` */
export function TokenLinkItems(props: TokenLinkItemsProps): React.JSX.Element {
  const { token, interaction } = props;
  const targets = useCharacterLinkTargets(props.board, props.characters);
  if (token.characterId) return <UnlinkItem token={token} interaction={interaction} />;
  const choose = ({ characterId, name }: CharacterLinkTarget): void =>
    props.onConfirmLink({ tokenId: token.id, characterId, characterName: name });
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={targets.length === 0}>
        {LINK_TO_CHARACTER_TITLE}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {targets.map((target) => (
          <DropdownMenuItem
            key={target.characterId}
            disabled={target.placed}
            onSelect={() => choose(target)}
          >
            {target.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function UnlinkItem({ token, interaction }: Pick<TokenLinkItemsProps, 'token' | 'interaction'>) {
  return (
    <DropdownMenuItem
      onSelect={() =>
        void interaction
          .getState()
          .command((commands, scope) => commands.unlinkTokenFromCharacter(scope, token.id))
      }
    >
      {UNLINK_FROM_CHARACTER}
    </DropdownMenuItem>
  );
}

export type CharacterLinkDialogProps = Readonly<{
  request: CharacterLinkRequest;
  interaction: StoreApi<BoardInteractionStore>;
  onClose: () => void;
}>;

/** "Ligar a Lyra?": the token is about to drop its own bars and conditions for the character's.
 *  "Ligar" sends the link; a refusal goes to the status line.
 *
 *  Example: `{link && <CharacterLinkDialog request={link} interaction={interaction} onClose={close} />}` */
export function CharacterLinkDialog({ request, interaction, onClose }: CharacterLinkDialogProps) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Ligar a ${request.characterName}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {characterLinkQuestion(request.characterName)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => linkToCharacter(interaction, request)}>
            Ligar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function linkToCharacter(
  interaction: StoreApi<BoardInteractionStore>,
  { tokenId, characterId }: CharacterLinkRequest,
): void {
  void interaction
    .getState()
    .command((commands, scope) => commands.linkTokenToCharacter(scope, tokenId, characterId));
}

function useCharacterLinkTargets(
  board: StoreApi<BoardStore>,
  characters: StoreApi<CharactersStore>,
): readonly CharacterLinkTarget[] {
  const tokens = useBoard(board, (state) => state.board?.tokens);
  const confirmed = useCharacters(characters, (state) => state.characters);
  return useMemo(() => characterLinkTargetsOf(confirmed, tokens ?? []), [confirmed, tokens]);
}
