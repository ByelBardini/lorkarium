import type { RoundCycleVisibilityDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { withChooserToggled, withSeerToggled, type RoundCycleDraft } from '@/lib/round-cycle-form';

/** A player of the table who may see or choose. */
export type CyclePlayer = Readonly<{ userId: string; name: string }>;

export type CycleAudienceFieldsProps = Readonly<{
  draft: RoundCycleDraft;
  players: readonly CyclePlayer[];
  onChange: (draft: RoundCycleDraft) => void;
}>;

type VisibilityOption = Readonly<{ value: RoundCycleVisibilityDto; label: string; help: string }>;

const VISIBILITY: readonly VisibilityOption[] = [
  { value: 'everyone', label: 'Todos na mesa', help: 'Mestre e jogadores veem a fase.' },
  { value: 'some', label: 'Só alguns jogadores', help: 'Os outros não sabem do ciclo.' },
  { value: 'masters', label: 'Só o mestre', help: 'Bom para o ciclo de um inimigo.' },
];

/** "Quem vê" (everyone, some players, the masters, as option cards) and "Quem pode escolher a
 *  próxima fase": who chooses also sees, and who stops seeing stops choosing.
 *
 *  Example: `<CycleAudienceFields draft={draft} players={players} onChange={setDraft} />` */
export function CycleAudienceFields({ draft, players, onChange }: CycleAudienceFieldsProps) {
  const setVisibility = (value: string): void => {
    const visibility = VISIBILITY.find((option) => option.value === value)?.value;
    if (visibility) onChange({ ...draft, visibility });
  };
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium text-label">Quem vê</legend>
        <RadioGroup value={draft.visibility} onValueChange={setVisibility} className="gap-1.5">
          {VISIBILITY.map((option) => (
            <VisibilityCard
              key={option.value}
              option={option}
              checked={draft.visibility === option.value}
            />
          ))}
        </RadioGroup>
        {draft.visibility === 'some' && (
          <PlayerChecks
            legend="Jogadores que veem"
            players={players}
            checked={draft.seerIds}
            onToggle={(userId) => onChange(withSeerToggled(draft, userId))}
          />
        )}
      </fieldset>
      <PlayerChecks
        legend="Quem pode escolher a próxima fase"
        hint="O mestre sempre pode."
        players={players}
        checked={draft.chooserIds}
        onToggle={(userId) => onChange(withChooserToggled(draft, userId))}
      />
    </>
  );
}

function VisibilityCard({
  option,
  checked,
}: Readonly<{ option: VisibilityOption; checked: boolean }>) {
  const id = useId();
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5',
        checked ? 'border-primary bg-card' : 'border-border hover:bg-card',
      )}
    >
      <RadioGroupItem id={id} value={option.value} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span>{option.label}</span>
        <span className="text-xs font-normal text-muted-foreground">{option.help}</span>
      </span>
    </Label>
  );
}

type PlayerChecksProps = Readonly<{
  legend: string;
  hint?: string;
  players: readonly CyclePlayer[];
  checked: readonly string[];
  onToggle: (userId: string) => void;
}>;

function PlayerChecks({ legend, hint, players, checked, onToggle }: PlayerChecksProps) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[13px] font-medium text-label">{legend}</legend>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {players.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum jogador na mesa ainda.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {players.map((player) => (
          <div key={player.userId} className="flex items-center gap-2">
            <Checkbox
              id={`${id}-${player.userId}`}
              checked={checked.includes(player.userId)}
              onCheckedChange={() => onToggle(player.userId)}
            />
            <Label htmlFor={`${id}-${player.userId}`} className="font-normal">
              {player.name}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
