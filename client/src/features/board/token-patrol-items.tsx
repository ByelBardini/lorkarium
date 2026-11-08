import type { TokenDto } from '@lorkarium/contracts';
import { Route } from 'lucide-react';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { DropdownMenuCheckboxItem, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NEEDS_PATROL_HINT, patrolsSwitchedAnnouncement } from '@/features/tokens/patrol-messages';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';

export type TokenPatrolItemsProps = Readonly<{
  /** The token right clicked. */
  token: TokenDto;
  /** The tokens the menu acts on: the selection when the token is in it, else that token. */
  targets: readonly TokenDto[];
  interaction: StoreApi<BoardInteractionStore>;
  /** "Patrulha…": the editor opens on that token. */
  onEditPatrol: (tokenId: string) => void;
}>;

/** The master's "Patrulha…" (draw the route of the token right clicked) and "Patrulhando" (checked
 *  while its patrol runs): starting or pausing it sends every target that has a route, at once;
 *  a token with no route has it off, with "Desenhe uma patrulha primeiro.".
 *
 *  Example: `{isMaster && <TokenPatrolItems token={token} targets={targets} interaction={interaction} onEditPatrol={open} />}` */
export function TokenPatrolItems(props: TokenPatrolItemsProps): React.JSX.Element {
  const { token, targets, interaction } = props;
  const hintId = useId();
  const running = token.patrol !== null && token.patrol.startedAt !== null;
  const switchPatrols = (): void => {
    const routed = targets.filter(({ patrol }) => patrol !== null);
    const ids = routed.map(({ id }) => id);
    void interaction
      .getState()
      .command((commands, scope) => commands.setTokenPatrolsActive(scope, ids, !running))
      .then((ok) => {
        const names = routed.map(({ name }) => name);
        if (ok) interaction.getState().say(patrolsSwitchedAnnouncement(names, !running));
      });
  };
  return (
    <>
      <DropdownMenuItem onSelect={() => props.onEditPatrol(token.id)}>
        <Route aria-hidden="true" />
        Patrulha…
      </DropdownMenuItem>
      <DropdownMenuCheckboxItem
        checked={running}
        disabled={token.patrol === null}
        aria-describedby={token.patrol === null ? hintId : undefined}
        onSelect={switchPatrols}
      >
        Patrulhando
      </DropdownMenuCheckboxItem>
      {token.patrol === null && (
        <p id={hintId} className="px-2 py-1 text-xs text-muted-foreground">
          {NEEDS_PATROL_HINT}
        </p>
      )}
    </>
  );
}
