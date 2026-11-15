import type { CampaignVisibilityDto } from '@lorkarium/contracts';
import { GlobeIcon, LockIcon, type LucideIcon } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { PUBLIC_VISIBILITY_HINT } from '@/features/campaigns/campaign-messages';

type VisibilityCard = Readonly<{
  value: CampaignVisibilityDto;
  label: string;
  hint: string;
  Icon: LucideIcon;
}>;

const VISIBILITY_CARDS: readonly VisibilityCard[] = [
  { value: 'private', label: 'Privada', hint: 'Só entra quem tiver o código.', Icon: LockIcon },
  {
    value: 'public',
    label: 'Pública',
    hint: PUBLIC_VISIBILITY_HINT,
    Icon: GlobeIcon,
  },
];

export type VisibilityFieldProps = Readonly<{
  value: CampaignVisibilityDto;
  onChange: (value: CampaignVisibilityDto) => void;
  /** The plan's hint when it has no private table: "Privada" is disabled and says so. */
  privateLock?: string | null;
}>;

/** "Privada" / "Pública" as two cards side by side (stacked on a phone), each saying what it
 *  means; a radio group: arrows move the choice.
 *
 *  Example: `<VisibilityField value={visibility} onChange={setVisibility} />` */
export function VisibilityField(props: VisibilityFieldProps): React.JSX.Element {
  const { value, onChange, privateLock = null } = props;
  const id = useId();
  return (
    <div className="flex flex-col gap-2.5">
      <span id={`${id}-legend`} className="text-[13px] text-label">
        Visibilidade
      </span>
      <RadioGroupPrimitive.Root
        aria-labelledby={`${id}-legend`}
        value={value}
        onValueChange={(next) => onChange(next === 'public' ? 'public' : 'private')}
        className="grid gap-2 sm:grid-cols-2"
      >
        {VISIBILITY_CARDS.map((card) => (
          <VisibilityOption
            key={card.value}
            card={lockedCardOf(card, privateLock)}
            idPrefix={`${id}-${card.value}`}
          />
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

type ShownCard = VisibilityCard & Readonly<{ disabled: boolean }>;

function lockedCardOf(card: VisibilityCard, privateLock: string | null): ShownCard {
  if (card.value !== 'private' || privateLock === null) return { ...card, disabled: false };
  return { ...card, hint: privateLock, disabled: true };
}

function VisibilityOption({
  card,
  idPrefix,
}: Readonly<{ card: ShownCard; idPrefix: string }>): React.JSX.Element {
  const { Icon } = card;
  return (
    <RadioGroupPrimitive.Item
      value={card.value}
      disabled={card.disabled}
      aria-labelledby={`${idPrefix}-label`}
      aria-describedby={`${idPrefix}-hint`}
      className="flex items-start gap-3 rounded-md border border-input p-3.5 text-left text-muted-foreground outline-offset-2 transition-colors hover:border-placeholder focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:text-foreground motion-reduce:transition-none"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.8} />
      <span className="flex flex-col gap-0.5">
        <span id={`${idPrefix}-label`} className="text-sm font-semibold">
          {card.label}
        </span>
        <span id={`${idPrefix}-hint`} className="text-[13px] text-muted-foreground">
          {card.hint}
        </span>
      </span>
    </RadioGroupPrimitive.Item>
  );
}
