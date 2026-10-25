import type { SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { EyeIcon, EyeOffIcon, StarIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { isListedIn } from '@/lib/main-token';
import { playedByText } from '@/lib/played-by';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { TokenAvatar } from './token-avatar';

export type DockHeaderProps = Readonly<{
  token: TokenDto;
  /** It is the viewer's main token: marked, and never closed (it is what the dock falls back to). */
  isMain: boolean;
  /** Only the master hides a token from the players (absent: not the master). */
  isMaster?: boolean;
  viewerId: string;
  members: readonly SessionMemberDto[];
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The head of the dock: avatar, name, who plays it, the "Principal" mark on the main token, the
 *  star that makes a token one is listed in the control of the main one, the master's
 *  "Invisível para os jogadores" switch, and "Fechar ficha" on any other token (back to the main
 *  one).
 *
 *  Example: `<DockHeader token={kael} isMain={false} viewerId={bia} members={members} interaction={interaction} />` */
export function DockHeader(props: DockHeaderProps): React.JSX.Element {
  const { token, isMain, viewerId, members, interaction } = props;
  const nameRef = useRef<HTMLHeadingElement>(null);
  const canChoose = !isMain && isListedIn(token, viewerId);
  return (
    <header className="flex items-center gap-3">
      <TokenAvatar token={token} />
      <span className="flex min-w-0 flex-1 flex-col">
        <h3 ref={nameRef} tabIndex={-1} className="truncate font-display text-xl font-semibold">
          {token.name}
        </h3>
        <span className="truncate text-xs text-muted-foreground">{playedText(token, members)}</span>
      </span>
      {isMain && <MainMark />}
      {props.isMaster && <HiddenToggle token={token} interaction={interaction} />}
      {canChoose && (
        <MainTokenToggle
          token={token}
          interaction={interaction}
          onChosen={() => nameRef.current?.focus()}
        />
      )}
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

type MainTokenToggleProps = Readonly<{
  token: TokenDto;
  interaction: StoreApi<BoardInteractionStore>;
  onChosen: () => void;
}>;

// The star leaves once the choice is confirmed, so the focus goes to the name before it does.
function MainTokenToggle({ token, interaction, onChosen }: MainTokenToggleProps) {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  async function choose(): Promise<void> {
    const sent = interaction
      .getState()
      .command((commands, scope) => commands.setMainToken(scope, token.id));
    if (await sent) onChosen();
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Tornar ${token.name} meu principal`}
      disabled={readOnly}
      onClick={() => void choose()}
    >
      <StarIcon aria-hidden="true" />
    </Button>
  );
}

function playedText(token: TokenDto, members: readonly SessionMemberDto[]): string {
  const played = playedByText(token, members);
  return played.charAt(0).toUpperCase() + played.slice(1);
}
