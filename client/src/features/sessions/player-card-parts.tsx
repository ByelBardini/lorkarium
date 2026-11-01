import type { CharacterDto, SessionMemberDto, TokenBarDto, TokenDto } from '@lorkarium/contracts';
import { CrosshairIcon, LockIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardSight } from '@/features/board/use-board-sight';
import { BarMeter } from '@/features/tokens/bar-meter';
import { BarQuickEdit } from '@/features/tokens/bar-quick-edit';
import { TokenFace } from '@/features/tokens/token-face';
import { levelOf } from '@/lib/board-sight';
import { sideRingVar } from '@/lib/token-side';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { presenceOf } from '@/lib/member-presence';
import { MemberCardPopover } from './member-card-popover';
import { PresenceMark } from './presence-mark';

/** What a portrait shows: a character's face (a linked token wears the same). */
export type PortraitFace = Pick<CharacterDto, 'side' | 'initials' | 'imageAssetId'>;

/** The portrait of a card: the character's image (or initials) with its side ring, and the
 *  "Token" tag while a token of it stands on the group grid. The member's presence rides on its
 *  corner.
 *
 *  Example: `<CardPortrait face={lyraCharacter} member={bia} name="Lyra" onGrid />` */
export function CardPortrait({
  face,
  member,
  name,
  onGrid,
}: Readonly<{ face: PortraitFace; member: SessionMemberDto; name: string; onGrid: boolean }>) {
  return (
    <div
      data-testid="portrait"
      style={{ boxShadow: `inset 0 0 0 2px ${sideRingVar(face.side)}` }}
      className="relative min-h-27 w-21 shrink-0 self-stretch overflow-hidden rounded-md bg-muted"
    >
      <TokenFace
        initials={face.initials}
        imageAssetId={face.imageAssetId}
        round={false}
        alt={`Retrato de ${name}`}
        className="absolute inset-0 size-full font-brand text-[22px] text-foreground/85"
      />
      {onGrid && <PortraitTag />}
      <PresenceMark
        presence={presenceOf(member)}
        placement="badge"
        className="right-1.5 bottom-1.5"
      />
    </div>
  );
}

function PortraitTag() {
  return (
    <span className="absolute bottom-1.5 left-1.5 rounded-sm bg-panel/75 px-1.5 text-[10px] font-semibold text-label">
      Token
    </span>
  );
}

/** The nick line: presence symbol (only when no picture carries the badge), the account name (a click opens the member's card), "· você"
 *  on one's own card, "· ausente há N min" or "· offline".
 *
 *  Example: `<NickLine member={bia} isViewer awayLabel="ausente há 4 min" />` */
export function NickLine({
  member,
  isViewer,
  awayLabel,
  id,
  withMark = false,
}: Readonly<{
  member: SessionMemberDto;
  isViewer: boolean;
  awayLabel: string | null;
  id?: string;
  /** Whether the presence goes on the line: only when no portrait or avatar wears it. */
  withMark?: boolean;
}>) {
  return (
    <p
      id={id}
      data-testid="nick-line"
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
    >
      {withMark && <PresenceMark presence={presenceOf(member)} />}
      <MemberCardPopover member={member} />
      {isViewer && (
        <span className="shrink-0 font-semibold whitespace-nowrap text-primary">· você</span>
      )}
      {member.online && awayLabel && (
        <span className="shrink-0 whitespace-nowrap">{`· ${awayLabel}`}</span>
      )}
      {!member.online && <span className="shrink-0 whitespace-nowrap">· offline</span>}
    </p>
  );
}

/** The bars of the character, as this viewer received them (a hidden bar never comes); whoever
 *  controls it edits each one in its balloon, on any grid or none (`character:adjustBar`).
 *
 *  Example: `<CardBars character={lyra} name="Lyra" interaction={interaction} />` */
export function CardBars({
  character,
  name,
  interaction,
}: Readonly<{
  character: CharacterDto;
  name: string;
  interaction: StoreApi<BoardInteractionStore>;
}>) {
  if (character.bars.length === 0) return <CardNote>Personagem sem barras</CardNote>;
  const bars = [...character.bars].sort((a, b) => a.position - b.position);
  const target = { characterId: character.id };
  return (
    <div className="flex flex-col gap-1.5">
      {bars.map((bar) =>
        character.canControl ? (
          <BarQuickEdit
            key={bar.id}
            target={target}
            bar={bar}
            name={`${bar.label} de ${name}`}
            interaction={interaction}
          >
            <CardBar bar={bar} name={name} />
          </BarQuickEdit>
        ) : (
          <CardBar key={bar.id} bar={bar} name={name} />
        ),
      )}
    </div>
  );
}

function useOnGrid(board: StoreApi<BoardStore>, tokenId: string | null): boolean {
  return useBoard(board, (state) => state.board?.tokens.some(({ id }) => id === tokenId) ?? false);
}

function CardNote({ children }: Readonly<{ children: string }>) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** One bar of the card: its label (with the lock when only its controllers see it) over the meter.
 *
 *  Example: `<CardBar bar={pv} name="Lyra" />` */
export function CardBar({ bar, name }: Readonly<{ bar: TokenBarDto; name: string }>) {
  return (
    <div className="relative">
      <span className="absolute top-0 left-0 flex items-center gap-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {bar.label}
        {bar.visibility === 'controllers' && (
          <span role="img" aria-label="Só quem controla vê">
            <LockIcon aria-hidden="true" className="size-3" />
          </span>
        )}
      </span>
      <BarMeter name={`${bar.label} de ${name}`} bar={bar} color={bar.color} className="w-full" />
    </div>
  );
}

export type LocateButtonProps = Readonly<{
  token: TokenDto;
  name: string;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** "Achar no mapa": selects the token, and the board's camera goes to the selection. Only for a
 *  token on this grid that this viewer sees: the card itself shows past the sight filter (and
 *  shows the character when it is in no grid of the group), the button does not.
 *
 *  Example: `<LocateButton token={lyra} name="Lyra" board={board} interaction={interaction} />` */
export function LocateButton({ token, name, board, interaction }: LocateButtonProps) {
  const sight = useBoardSight(board, interaction);
  const onGrid = useOnGrid(board, token.id);
  if (!onGrid || levelOf(sight, token.id) !== 'seen') return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Achar ${name} no mapa`}
      title="Achar no mapa"
      onClick={() => interaction.getState().select(token.id)}
      className="text-muted-foreground"
    >
      <CrosshairIcon aria-hidden="true" />
    </Button>
  );
}
