import type { SessionMemberDto, TokenBarDto, TokenDto } from '@lorkarium/contracts';
import { CrosshairIcon, LockIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardSight } from '@/features/board/use-board-sight';
import { BarMeter } from '@/features/tokens/bar-meter';
import { BarQuickEdit } from '@/features/tokens/bar-quick-edit';
import { TokenFace } from '@/features/tokens/token-face';
import { levelOf } from '@/lib/board-sight';
import { sideRingVar } from '@/lib/token-side';
import { initialsOf } from '@/lib/token-initials';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { presenceOf } from '@/lib/member-presence';
import { PresenceMark } from './presence-mark';

/** The portrait of a card: the main token's image (or initials) with its side ring and the
 *  "Token" tag; the account's initials when the player has no main token on the scene.
 *
 *  Example: `<CardPortrait token={lyra} member={bia} name="Lyra" />` */
export function CardPortrait({
  token,
  member,
  name,
}: Readonly<{ token: TokenDto | null; member: SessionMemberDto; name: string }>) {
  const ring = token ? { boxShadow: `inset 0 0 0 2px ${sideRingVar(token.side)}` } : undefined;
  return (
    <div
      data-testid="portrait"
      style={ring}
      className="relative min-h-27 w-21 shrink-0 self-stretch overflow-hidden rounded-md bg-muted"
    >
      {token ? (
        <TokenFace
          initials={token.initials}
          imageAssetId={token.imageAssetId}
          round={false}
          alt={`Retrato de ${name}`}
          className="absolute inset-0 size-full font-brand text-[22px] text-foreground/85"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center font-brand text-xl"
        >
          {initialsOf(member.name)}
        </span>
      )}
      {token && <PortraitTag />}
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

/** The nick line: presence symbol, the account name, "· você" on one's own card, "· ausente há
 *  N min" or "· offline".
 *
 *  Example: `<NickLine member={bia} isViewer awayLabel="ausente há 4 min" />` */
export function NickLine({
  member,
  isViewer,
  awayLabel,
  id,
}: Readonly<{
  member: SessionMemberDto;
  isViewer: boolean;
  awayLabel: string | null;
  id?: string;
}>) {
  return (
    <p
      id={id}
      data-testid="nick-line"
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
    >
      <PresenceMark presence={presenceOf(member)} />
      <span className="truncate">{member.name}</span>
      {isViewer && <span className="font-semibold text-primary">· você</span>}
      {member.online && awayLabel && <span>{`· ${awayLabel}`}</span>}
      {!member.online && <span>· offline</span>}
    </p>
  );
}

/** The bars of the main token, as this viewer received them (a hidden bar never comes); whoever
 *  controls the token edits each one in its balloon, while it is on this grid (the anchor of a
 *  character in no grid of the group is only shown).
 *
 *  Example: `<CardBars token={lyra} name="Lyra" board={board} interaction={interaction} />` */
export function CardBars({
  token,
  name,
  board,
  interaction,
}: Readonly<{
  token: TokenDto | null;
  name: string;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
}>) {
  const onGrid = useOnGrid(board, token?.id ?? null);
  if (!token) return <CardNote>Sem token principal nesta cena.</CardNote>;
  if (token.bars.length === 0) return <CardNote>Token sem barras</CardNote>;
  const bars = [...token.bars].sort((a, b) => a.position - b.position);
  return (
    <div className="flex flex-col gap-1.5">
      {bars.map((bar) =>
        token.canControl && onGrid ? (
          <BarQuickEdit
            key={bar.id}
            tokenId={token.id}
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
 *  shows the character's anchor when it is in no grid of the group), the button does not.
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
