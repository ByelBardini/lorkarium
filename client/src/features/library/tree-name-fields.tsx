import { useRef, type MouseEvent } from 'react';
import { Input } from '@/components/ui/input';
import { useDraftField } from '@/lib/use-draft-field';

// A field inside a tree item: its clicks are not the item's (pick, expand).
function keepClickInField(event: MouseEvent<HTMLInputElement>): void {
  event.stopPropagation();
}

export type RenameFieldProps = Readonly<{
  label: string;
  confirmed: string;
  maxLength: number;
  /** Sends the new name (only a changed, non-blank one gets here). */
  onSave: (name: string) => void;
  /** The field closed; `byKey` = Enter or Esc (the focus goes back to the item). */
  onDone: (byKey: boolean) => void;
}>;

/** Renaming in place over the confirmed name: Enter or leaving sends it when it changed, Esc
 *  puts the confirmed name back; either way the field closes.
 *
 *  Example: `<RenameField label="Nome da pasta" confirmed="Ato 1" maxLength={80} onSave={rename} onDone={close} />` */
export function RenameField(props: RenameFieldProps): React.JSX.Element {
  const byKey = useRef(false);
  const binding = useDraftField({
    confirmed: props.confirmed,
    save: (draft) => {
      const name = draft.trim();
      if (name !== '' && name !== props.confirmed) props.onSave(name);
      return Promise.resolve(name !== '');
    },
  });
  return (
    <Input
      aria-label={props.label}
      autoFocus
      maxLength={props.maxLength}
      {...binding}
      onKeyDown={(event) => {
        byKey.current = event.key === 'Enter' || event.key === 'Escape';
        binding.onKeyDown(event);
      }}
      onBlur={() => {
        binding.onBlur();
        props.onDone(byKey.current);
      }}
      onClick={keepClickInField}
      className="h-8 text-[13px]"
    />
  );
}
