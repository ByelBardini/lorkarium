import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { EyeIcon, EyeOffIcon, StarIcon, XIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { playedByText } from '@/lib/played-by';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { TokenAvatar } from './token-avatar';

export type DockHeaderProps = Readonly<{
  token: TokenDto;
  /** It is the viewer's main token: marked, and never closed (it is what the dock falls back to). */
  isMain: boolean;
  /** Only the master hides a token from the players (absent: not the master). */
  isMaster?: boolean;
  members: readonly SessionMemberDto[];
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The head of the dock: avatar, name, who plays it, the "Principal" mark on the token of the
 *  viewer's character, the master's "Invisível para os jogadores" switch, and "Fechar ficha" on
 *  any other token (back to the main one).
 *
 *  Example: `<DockHeader token={kael} isMain={false} members={members} interaction={interaction} />` */
export function DockHeader(props: DockHeaderProps): React.JSX.Element {
  const { token, isMain, members, interaction } = props;
  return (
    <header className="flex items-center gap-3">
      <TokenAvatar token={token} />
      <span className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate font-display text-xl font-semibold">{token.name}</h3>
        <span className="truncate text-xs text-muted-foreground">{playedText(token, members)}</span>
      </span>
      {isMain && <MainMark />}
      {props.isMaster && <HiddenToggle token={token} interaction={interaction} />}
      {!isMain && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Fechar ficha"
          onClick={() => interaction.getState().select(null)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </header>
  );
}

type HiddenToggleProps = Readonly<{
  token: TokenDto;
  interaction: StoreApi<BoardInteractionStore>;
}>;

// Pressed = the players do not receive the token; the status line says the change once confirmed.
function HiddenToggle({ token, interaction }: HiddenToggleProps) {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  const Icon = token.hidden ? EyeOffIcon : EyeIcon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Invisível para os jogadores"
      aria-pressed={token.hidden}
      title={token.hidden ? 'Invisível para os jogadores' : 'Visível para os jogadores'}
      disabled={readOnly}
      className="aria-pressed:text-label"
      onClick={() => void interaction.getState().setTokensHidden([token], !token.hidden)}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

function MainMark() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-label">
      <StarIcon aria-hidden="true" className="size-3 fill-current" />
      Principal
    </span>
  );
}

function playedText(token: TokenDto, members: readonly SessionMemberDto[]): string {
  const played = playedByText(token, members);
  return played.charAt(0).toUpperCase() + played.slice(1);
}
