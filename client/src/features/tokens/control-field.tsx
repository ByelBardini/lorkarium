import { CheckIcon } from 'lucide-react';
import { useId } from 'react';
import { initialsOf } from '@/lib/token-initials';
import { cn } from '@/lib/utils';
import type { TokenPlayer } from './token-form-state';
import { CONTROL_HINT, MASTER_CONTROLS_HINT, NO_PLAYERS_HINT } from './token-messages';

export type ControlFieldProps = Readonly<{
  controllerIds: readonly string[];
  players: readonly TokenPlayer[];
  onChange: (controllerIds: readonly string[]) => void;
}>;

/** "Quem controla": one button per player of the table, pressed when that player controls the
 *  token (several may). Nobody pressed is the master's alone, who controls everything anyway.
 *
 *  Example: `<ControlField controllerIds={form.controllerIds} players={players} onChange={setControllers} />` */
export function ControlField({ controllerIds, players, onChange }: ControlFieldProps) {
  const id = useId();
  const toggle = (userId: string): void => {
    const others = controllerIds.filter((chosen) => chosen !== userId);
    onChange(others.length === controllerIds.length ? [...controllerIds, userId] : others);
  };
  return (
    <div role="group" aria-labelledby={`${id}-legend`} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span id={`${id}-legend`} className="text-[13px] text-label">
          Quem controla
        </span>
        <span className="text-xs text-muted-foreground">{MASTER_CONTROLS_HINT}</span>
      </div>
      {players.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{NO_PLAYERS_HINT}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {players.map((player) => (
            <PlayerToggle
              key={player.userId}
              player={player}
              pressed={controllerIds.includes(player.userId)}
              onToggle={() => toggle(player.userId)}
            />
          ))}
        </div>
      )}
      <p className="text-xs leading-relaxed text-placeholder">{CONTROL_HINT}</p>
    </div>
  );
}

type PlayerToggleProps = Readonly<{
  player: TokenPlayer;
  pressed: boolean;
  onToggle: () => void;
}>;

function PlayerToggle({ player, pressed, onToggle }: PlayerToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-md border pr-3.5 pl-1.5 text-sm font-medium outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
        pressed
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-input text-muted-foreground hover:text-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground"
      >
        {initialsOf(player.name)}
      </span>
      {player.name}
      {pressed && <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />}
    </button>
  );
}
