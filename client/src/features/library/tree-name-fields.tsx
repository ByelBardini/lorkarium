import { SCENE_FOLDER_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDraftField } from '@/lib/use-draft-field';

// A field inside a tree item: its clicks are not the item's (pick, expand).
function keepClickInField(event: MouseEvent<HTMLInputElement>): void {
  event.stopPropagation();
}

export type NewNameEntryProps = Readonly<{
  label: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}>;

/** The name of something not created yet (a folder): Enter saves a non-blank name, Esc,
 *  leaving it or leaving it blank gives up.
 *
 *  Example: `<NewNameEntry label="Nome da nova pasta" onSave={create} onCancel={close} />` */
export function NewNameEntry({ label, onSave, onCancel }: NewNameEntryProps): React.JSX.Element {
  const [name, setName] = useState('');
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter' && name.trim() !== '') onSave(name.trim());
    else onCancel();
  };
  return (
    <Input
      aria-label={label}
      autoFocus
      value={name}
      maxLength={SCENE_FOLDER_NAME_MAX_LENGTH}
      onChange={(event) => setName(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onCancel}
      onClick={keepClickInField}
      className="h-9 text-[13px]"
    />
  );
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

export type NewFolderButtonProps = Readonly<{ live: boolean; onStart: () => void }>;

/** "Nova pasta" over the tree: opens the name field of the new folder in the tree.
 *
 *  Example: `<NewFolderButton live onStart={() => startNewFolder(parentId)} />` */
export function NewFolderButton({ live, onStart }: NewFolderButtonProps): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Nova pasta"
      title="Nova pasta"
      disabled={!live}
      onClick={onStart}
    >
      <PlusIcon aria-hidden="true" />
    </Button>
  );
}
