import { SCREENSHOT_MIME_TYPES } from '@lorkarium/contracts';
import { ImagePlusIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { ScreenshotShot, ScreenshotShots } from './use-screenshot-shots';

const ACCEPT = SCREENSHOT_MIME_TYPES.join(',');

export type ScreenshotShotsFieldProps = Readonly<{ shots: ScreenshotShots; disabled: boolean }>;

/** "Prints (opcional)": up to 5 screenshots with their thumbnails, each removable and with the
 *  error of its own upload; a refused pick is said once above the list.
 *
 *  Example: `<ScreenshotShotsField shots={useScreenshotShots({ upload, limitText })} disabled={sending} />` */
export function ScreenshotShotsField({
  shots,
  disabled,
}: ScreenshotShotsFieldProps): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] text-label">Prints (opcional, até 5)</legend>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        aria-label="Anexar prints"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          shots.add([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <ImagePlusIcon aria-hidden="true" />
        Anexar print
      </Button>
      {shots.refusal && (
        <p role="alert" className="text-xs text-destructive-text">
          {shots.refusal}
        </p>
      )}
      {shots.shots.length > 0 && <ShotList shots={shots} disabled={disabled} />}
    </fieldset>
  );
}

function ShotList({ shots, disabled }: ScreenshotShotsFieldProps): React.JSX.Element {
  return (
    <ul aria-label="Prints" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {shots.shots.map((shot, index) => (
        <ShotItem
          key={shot.key}
          shot={shot}
          label={`Print ${index + 1}`}
          disabled={disabled}
          onRemove={() => shots.remove(shot.key)}
        />
      ))}
    </ul>
  );
}

type ShotItemProps = Readonly<{
  shot: ScreenshotShot;
  label: string;
  disabled: boolean;
  onRemove: () => void;
}>;

function ShotItem({ shot, label, disabled, onRemove }: ShotItemProps): React.JSX.Element {
  return (
    <li aria-label={label} className="relative flex flex-col gap-1">
      <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
        <img src={shot.previewUrl} alt={label} className="size-full object-cover" />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="icon-xs"
        className="absolute top-1 right-1"
        aria-label={`Remover ${label.toLowerCase()}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <XIcon aria-hidden="true" />
      </Button>
      {shot.error && (
        <p className="text-[11px] leading-tight text-destructive-text">{shot.error}</p>
      )}
    </li>
  );
}
