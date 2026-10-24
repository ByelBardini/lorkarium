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
import { cardLinkTargetsOf, type CardLinkTarget } from '@/lib/character-link';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { characterLinkQuestion, LINK_TO_CARD_TITLE, UNLINK_FROM_CARD } from './token-messages';

/** A link that waits for the master's yes: the token adopts the bars and conditions of a
 *  character that already exists. */
export type CardLinkRequest = Readonly<{
  tokenId: string;
  memberId: string;
  memberName: string;
  characterName: string;
}>;

export type TokenLinkItemsProps = Readonly<{
  token: TokenDto;
  /** The table's cast: which players already have a character. */
  cast: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** Linking to a card that has a character asks first (`CardLinkRequest`). */
  onConfirmLink: (request: CardLinkRequest) => void;
}>;

/** The master's character items on a token's menu: "Ligar à ficha de ▸" (one item per player)
 *  on a loose token, "Desligar da ficha" on a linked one. A card without a character links at
 *  once; one with a character asks first.
 *
 *  Example: `<TokenLinkItems token={lyra} cast={table.cast} presence={presence} interaction={interaction} onConfirmLink={ask} />` */
export function TokenLinkItems(props: TokenLinkItemsProps): React.JSX.Element {
  const { token, interaction } = props;
  const targets = useCardLinkTargets(props.cast, props.presence);
  if (token.anchorTokenId !== null) {
    return (
      <DropdownMenuItem
        onSelect={() =>
          void interaction
            .getState()
            .command((commands, scope) => commands.unlinkTokenFromCard(scope, token.id))
        }
      >
        {UNLINK_FROM_CARD}
      </DropdownMenuItem>
    );
  }
  const choose = (target: CardLinkTarget): void => {
    if (target.characterName === null) return linkToCard(interaction, token.id, target.memberId);
    props.onConfirmLink({ ...target, tokenId: token.id, characterName: target.characterName });
  };
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={targets.length === 0}>
        {LINK_TO_CARD_TITLE}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {targets.map((target) => (
          <DropdownMenuItem key={target.memberId} onSelect={() => choose(target)}>
            {target.memberName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export type CardLinkDialogProps = Readonly<{
  request: CardLinkRequest;
  interaction: StoreApi<BoardInteractionStore>;
  onClose: () => void;
}>;

/** "Ligar à ficha de Bia?": the token is about to drop its own bars and conditions for the
 *  character's. "Ligar" sends the link; a refusal goes to the status line.
 *
 *  Example: `{link && <CardLinkDialog request={link} interaction={interaction} onClose={close} />}` */
export function CardLinkDialog({ request, interaction, onClose }: CardLinkDialogProps) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Ligar à ficha de ${request.memberName}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {characterLinkQuestion(request.characterName, request.memberName)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => linkToCard(interaction, request.tokenId, request.memberId)}
          >
            Ligar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function linkToCard(
  interaction: StoreApi<BoardInteractionStore>,
  tokenId: string,
  memberId: string,
): void {
  void interaction
    .getState()
    .command((commands, scope) => commands.linkTokenToCard(scope, tokenId, memberId));
}

function useCardLinkTargets(
  cast: StoreApi<BoardStore>,
  presence: StoreApi<TablePresenceStore>,
): readonly CardLinkTarget[] {
  const castBoard = useBoard(cast, (state) => state.board);
  const members = useTablePresence(presence, (state) => state.members);
  return useMemo(() => cardLinkTargetsOf(members, castBoard), [members, castBoard]);
}
