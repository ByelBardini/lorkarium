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
}>;

/** "Privada" / "Pública" as two cards side by side (stacked on a phone), each saying what it
 *  means; a radio group: arrows move the choice.
 *
 *  Example: `<VisibilityField value={visibility} onChange={setVisibility} />` */
export function VisibilityField({ value, onChange }: VisibilityFieldProps): React.JSX.Element {
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
          <VisibilityOption key={card.value} card={card} idPrefix={`${id}-${card.value}`} />
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

function VisibilityOption({
  card,
  idPrefix,
}: Readonly<{ card: VisibilityCard; idPrefix: string }>): React.JSX.Element {
  const { Icon } = card;
  return (
    <RadioGroupPrimitive.Item
      value={card.value}
      aria-labelledby={`${idPrefix}-label`}
      aria-describedby={`${idPrefix}-hint`}
      className="flex items-start gap-3 rounded-md border border-input p-3.5 text-left text-muted-foreground outline-offset-2 transition-colors hover:border-placeholder focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:text-foreground motion-reduce:transition-none"
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
