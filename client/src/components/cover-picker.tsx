import type { CampaignCoverDto, DrawnCampaignCoverDto } from '@lorkarium/contracts';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import { CampaignCover } from '@/components/campaign-cover';
import { cn } from '@/lib/utils';

// Index = the `drawing` of the cover (the order of the art in `CampaignCover`).
const DRAWING_NAMES = ['Masmorra', 'Costa', 'Montanhas'] as const;

// Index + 1 = the `tone` of the cover (`chart-1..4`).
const TONES = [
  { name: 'Dourado', swatch: 'bg-chart-1' },
  { name: 'Aço', swatch: 'bg-chart-2' },
  { name: 'Brasa', swatch: 'bg-chart-3' },
  { name: 'Musgo', swatch: 'bg-chart-4' },
] as const;

const FIRST_DRAWN: DrawnCampaignCoverDto = { kind: 'drawn', drawing: 0, tone: 1 };

const ITEM_FOCUS =
  'outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50';

export type CoverPickerProps = Readonly<{
  value: CampaignCoverDto;
  onChange: (cover: CampaignCoverDto) => void;
  /** The image option under the drawings (the settings tab puts an `ImagePicker` here). */
  image?: React.ReactNode;
  /** A line under the picker (e.g. where the image can be sent later). */
  hint?: string;
  disabled?: boolean;
  className?: string;
}>;

/** The campaign cover as two radio groups, a row of drawings and a row of tones (arrows move the
 *  choice), plus an optional image slot. With an image chosen, no drawing nor tone is checked;
 *  picking one goes back to the last drawn cover with that change.
 *
 *  Example: `<CoverPicker value={draft.cover} onChange={(cover) => change({ cover })} />` */
export function CoverPicker(props: CoverPickerProps): React.JSX.Element {
  const id = useId();
  const drawn = props.value.kind === 'drawn' ? props.value : null;
  const [lastDrawn, setLastDrawn] = useState<DrawnCampaignCoverDto>(drawn ?? FIRST_DRAWN);
  const base = drawn ?? lastDrawn;
  const choose = (patch: Partial<Pick<DrawnCampaignCoverDto, 'drawing' | 'tone'>>): void => {
    const next: DrawnCampaignCoverDto = { ...base, ...patch };
    setLastDrawn(next);
    props.onChange(next);
  };
  return (
    <div className={cn('flex flex-col gap-3', props.className)}>
      <DrawingGroup
        labelId={`${id}-drawing`}
        cover={drawn}
        tone={base.tone}
        disabled={props.disabled}
        onPick={(drawing) => choose({ drawing })}
      />
      <ToneGroup
        labelId={`${id}-tone`}
        cover={drawn}
        disabled={props.disabled}
        onPick={(tone) => choose({ tone })}
      />
      {props.image}
      {props.hint && <p className="text-xs text-muted-foreground">{props.hint}</p>}
    </div>
  );
}

type GroupProps = Readonly<{
  labelId: string;
  cover: DrawnCampaignCoverDto | null;
  disabled?: boolean;
  onPick: (choice: number) => void;
}>;

function DrawingGroup(props: GroupProps & Readonly<{ tone: number }>): React.JSX.Element {
  return (
    <PickerGroup label="Desenho" {...props} value={props.cover?.drawing}>
      {DRAWING_NAMES.map((name, drawing) => (
        <RadioGroupPrimitive.Item
          key={name}
          value={String(drawing)}
          aria-label={name}
          className={cn(
            'min-w-0 flex-1 overflow-hidden rounded-md border-2 border-transparent hover:border-input data-[state=checked]:border-primary sm:max-w-60',
            ITEM_FOCUS,
          )}
        >
          <CampaignCover
            cover={{ kind: 'drawn', drawing, tone: props.tone }}
            className="aspect-[300/140] w-full"
          />
        </RadioGroupPrimitive.Item>
      ))}
    </PickerGroup>
  );
}

function ToneGroup(props: GroupProps): React.JSX.Element {
  return (
    <PickerGroup label="Tom" {...props} value={props.cover?.tone}>
      {TONES.map(({ name, swatch }, index) => (
        <RadioGroupPrimitive.Item
          key={name}
          value={String(index + 1)}
          aria-label={name}
          className={cn(
            'grid size-9 place-items-center rounded-md border-2 border-transparent hover:border-input data-[state=checked]:border-primary',
            ITEM_FOCUS,
          )}
        >
          <span aria-hidden="true" className={cn('size-5 rounded-sm', swatch)} />
        </RadioGroupPrimitive.Item>
      ))}
    </PickerGroup>
  );
}

type PickerGroupProps = Omit<GroupProps, 'cover'> &
  Readonly<{ label: string; value: number | undefined; children: React.ReactNode }>;

// `''` checks nothing: an image cover has no drawing nor tone.
function PickerGroup(props: PickerGroupProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={props.labelId} className="text-[13px] text-label">
        {props.label}
      </span>
      <RadioGroupPrimitive.Root
        aria-labelledby={props.labelId}
        value={props.value === undefined ? '' : String(props.value)}
        onValueChange={(next) => props.onPick(Number(next))}
        orientation="horizontal"
        disabled={props.disabled}
        className="flex gap-2"
      >
        {props.children}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
