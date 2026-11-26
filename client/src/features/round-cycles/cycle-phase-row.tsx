import { ArrowDownIcon, ArrowUpIcon, ImagePlusIcon, LoaderCircleIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';
import { useImageSender, type ImageSender } from '@/components/use-image-sender';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PhaseDraft } from '@/lib/round-cycle-form';
import { cn } from '@/lib/utils';
import type { AssetsApi } from '@/services/assets-api';
import { CyclePhaseImage } from './cycle-phase-image';

/** Where a phase's image goes: the table's assets, as a `round_cycle_phase` (a GIF plays on an
 *  owner whose plan animates the table's art). */
export type CycleImageTarget = Readonly<{ campaignId: string; assets: AssetsApi }>;

export type CyclePhaseRowProps = Readonly<{
  phase: PhaseDraft;
  /** 1-based, as the master reads it. */
  place: number;
  count: number;
  canRemove: boolean;
  images: CycleImageTarget;
  onChange: (change: Partial<Pick<PhaseDraft, 'name' | 'imageAssetId'>>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}>;

/** One phase of the cycle in the editor, on one line: its place, its image (a square that takes
 *  a click or a dropped file), its name, and the moves. Never under two phases.
 *
 *  Example: `<CyclePhaseRow phase={phase} place={1} count={4} canRemove images={images} onChange={…} onMove={…} onRemove={…} />` */
export function CyclePhaseRow(props: CyclePhaseRowProps): React.JSX.Element {
  const { phase, place, count, images, onChange } = props;
  const sender = useImageSender({
    campaignId: images.campaignId,
    purpose: 'round_cycle_phase',
    assets: images.assets,
    onSent: (asset) => onChange({ imageAssetId: asset.id }),
  });
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2 pr-1">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-sm bg-muted font-mono text-xs text-muted-foreground"
        >
          {place}
        </span>
        <PhaseImageButton {...props} sender={sender} />
        <Input
          aria-label={`Nome da fase ${place}`}
          placeholder="Nome da fase"
          value={phase.name}
          maxLength={32}
          onChange={(event) => props.onChange({ name: event.target.value })}
          className="h-10 min-w-0 flex-1"
        />
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Subir a fase ${place}`}
            disabled={place === 1}
            onClick={() => props.onMove(-1)}
          >
            <ArrowUpIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Descer a fase ${place}`}
            disabled={place === count}
            onClick={() => props.onMove(1)}
          >
            <ArrowDownIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Tirar a fase ${place}`}
            disabled={!props.canRemove}
            onClick={props.onRemove}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      </div>
      {sender.problem && (
        <p role="alert" className="pl-9 text-xs text-destructive-text">
          {sender.problem}
        </p>
      )}
    </li>
  );
}

// The square of the image: a click opens the file picker, a dropped file goes too; with an image,
// a small × takes it away. The refusal (type, size, plan) shows under the row.
function PhaseImageButton({
  phase,
  place,
  onChange,
  sender,
}: CyclePhaseRowProps & Readonly<{ sender: ImageSender }>) {
  const input = useRef<HTMLInputElement>(null);
  const label = `Imagem ou GIF da fase ${place}`;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          sender.sendFile(event.dataTransfer.files[0]);
        }}
        className={cn(
          'grid size-14 place-items-center overflow-hidden rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary',
          sender.problem ? 'border-destructive' : 'border-input',
        )}
      >
        {sender.busy && <LoaderCircleIcon aria-hidden="true" className="size-5 animate-spin" />}
        {!sender.busy && phase.imageAssetId !== null && (
          <CyclePhaseImage
            phase={{ phaseId: phase.key, name: phase.name, imageAssetId: phase.imageAssetId }}
            className="size-14 rounded-none border-0"
          />
        )}
        {!sender.busy && phase.imageAssetId === null && (
          <ImagePlusIcon aria-hidden="true" className="size-5" />
        )}
      </button>
      {phase.imageAssetId !== null && (
        <button
          type="button"
          aria-label={`Tirar a imagem da fase ${place}`}
          onClick={() => onChange({ imageAssetId: null })}
          className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-input bg-card text-muted-foreground hover:text-foreground"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={sender.accept}
        onChange={(event) => {
          sender.sendFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
