import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardSight } from '@/features/board/use-board-sight';
import { SelectionConditions } from '@/features/combat/selection-conditions';
import { seenTokensOf } from '@/lib/board-sight';
import type { PrepItem } from '@/lib/combat-prep';
import { combatCandidatesOf } from '@/lib/combat-entries';
import { sceneSectionsOf, type SceneSection } from '@/lib/scene-sections';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { TokenGroupLine } from './token-group-line';
import { TokenLine } from './token-line';

export type SceneTokenListProps = Readonly<{
  board: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

const NO_TOKENS: readonly TokenDto[] = [];

/** "Na cena" out of combat: the tokens by side ("Grupo · 3", "Inimigos · 7", "Neutros · 1"), the
 *  same creature folded in one group, with the same line as the tracker. Picking a line selects
 *  the token (its detail opens at the foot of the panel); with several selected, their lines are
 *  marked and the count and a condition for all of them come above.
 *
 *  Example: `<SceneTokenList board={board} presence={presence} interaction={interaction} isMaster />` */
export function SceneTokenList(props: SceneTokenListProps): React.JSX.Element {
  const all = useBoard(props.board, (state) => state.board?.tokens ?? NO_TOKENS);
  const sight = useBoardSight(props.board, props.interaction);
  // Only what this viewer sees whole (a silhouette or a hidden token is never named), and only the
  // Tokens layer: the chest of Objetos is still picked on the board.
  const sections = useMemo(
    () => sceneSectionsOf(combatCandidatesOf(seenTokensOf({ tokens: all }, sight))),
    [all, sight],
  );
  const members = useTablePresence(props.presence, (state) => state.members);
  const selectedIds = useBoardInteraction(props.interaction, (state) => state.selectedTokenIds);
  if (sections.length === 0) return <EmptyScene isMaster={props.isMaster} />;
  return (
    <div className="flex flex-col gap-2">
      {selectedIds.length > 1 && (
        <p className="text-xs text-muted-foreground">{`${selectedIds.length} selecionados`}</p>
      )}
      <SelectionConditions
        board={props.board}
        interaction={props.interaction}
        isMaster={props.isMaster}
      />
      <ul aria-label="Na cena" className="flex flex-col gap-3">
        {sections.map((section) => (
          <SideSection
            key={section.side}
            section={section}
            members={members}
            selectedIds={selectedIds}
            interaction={props.interaction}
          />
        ))}
      </ul>
    </div>
  );
}

function EmptyScene({ isMaster }: Readonly<{ isMaster: boolean }>): React.JSX.Element {
  return (
    <p className="text-sm text-muted-foreground">
      {isMaster
        ? 'Crie um token pelo + na barra de ferramentas.'
        : 'O mestre ainda não pôs ninguém na cena.'}
    </p>
  );
}

type LinesProps = Readonly<{
  members: readonly SessionMemberDto[];
  selectedIds: readonly string[];
  interaction: StoreApi<BoardInteractionStore>;
}>;

function SideSection({ section, ...props }: LinesProps & Readonly<{ section: SceneSection }>) {
  const title = `${section.title} · ${section.count}`;
  return (
    <li className="flex flex-col">
      <h3 className="pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h3>
      <ul aria-label={title} className="flex flex-col">
        {section.items.map((item) => (
          <SceneItem
            key={item.kind === 'token' ? item.token.id : item.key}
            item={item}
            {...props}
          />
        ))}
      </ul>
    </li>
  );
}

function SceneItem({ item, ...props }: LinesProps & Readonly<{ item: PrepItem }>) {
  if (item.kind === 'token') return <SceneTokenRow token={item.token} {...props} />;
  return <SceneGroupRow group={item} {...props} />;
}

type SceneGroupRowProps = LinesProps & Readonly<{ group: Extract<PrepItem, { kind: 'group' }> }>;

function SceneGroupRow({ group, ...props }: SceneGroupRowProps) {
  const [opened, setOpened] = useState(false);
  const holdsSelected = group.tokens.some(({ id }) => props.selectedIds.includes(id));
  const open = opened || holdsSelected;
  return (
    <li className="border-b border-divider py-2 last:border-b-0">
      <TokenGroupLine
        label={group.label}
        tokens={group.tokens}
        open={open}
        onToggle={() => setOpened(!open)}
      >
        <ul
          aria-label={`Tokens de ${group.label}`}
          className="mt-1.5 flex flex-col border-l border-divider"
        >
          {group.tokens.map((token) => (
            <SceneTokenRow key={token.id} token={token} compact {...props} />
          ))}
        </ul>
      </TokenGroupLine>
    </li>
  );
}

type SceneTokenRowProps = LinesProps & Readonly<{ token: TokenDto; compact?: boolean }>;

function SceneTokenRow({ token, compact = false, ...props }: SceneTokenRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const selected = props.selectedIds.includes(token.id);
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);
  const alone = props.selectedIds.length === 1 && selected;
  return (
    <li
      ref={rowRef}
      className={compact ? 'py-1 pl-2' : 'border-b border-divider py-2 last:border-b-0'}
    >
      <TokenLine
        token={token}
        members={props.members}
        selected={selected}
        compact={compact}
        onSelect={() => props.interaction.getState().select(alone ? null : token.id)}
      />
    </li>
  );
}
