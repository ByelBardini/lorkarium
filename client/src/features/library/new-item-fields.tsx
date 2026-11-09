import { SCENE_FOLDER_NAME_MAX_LENGTH, type SceneVisibilityDto } from '@lorkarium/contracts';
import { useId, useState, type ReactNode } from 'react';
import { SegmentField } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type NameFieldProps = Readonly<{
  value: string;
  onChange: (name: string) => void;
  maxLength: number;
  placeholder?: string;
  disabled?: boolean;
}>;

/** The "Nome" of the item being created; it takes the focus as soon as the type is chosen.
 *
 *  Example: `<NameField value={name} onChange={setName} maxLength={60} />` */
export function NameField(props: NameFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Nome</Label>
      <Input
        id={id}
        autoFocus
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
      />
    </div>
  );
}

type NewItemFooterProps = Readonly<{
  canCreate: boolean;
  /** "Salvando…" while the item is on its way. */
  createLabel?: string;
  cancelDisabled?: boolean;
  onCancel: () => void;
}>;

/** "Criar" and "Cancelar", the same for every type of item.
 *
 *  Example: `<NewItemFooter canCreate={valid} onCancel={close} />` */
export function NewItemFooter(props: NewItemFooterProps): React.JSX.Element {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <Button type="submit" className="min-w-28" disabled={!props.canCreate}>
        {props.createLabel ?? 'Criar'}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-w-28"
        disabled={props.cancelDisabled}
        onClick={props.onCancel}
      >
        Cancelar
      </Button>
    </div>
  );
}

type NamedItemFormProps = Readonly<{
  maxLength: number;
  /** What the server calls an item left blank; absent, the name is required. */
  blankName?: string;
  live: boolean;
  /** The name trimmed (`''` = left blank); the form closes right after. */
  onCreate: (name: string) => void;
  onClose: () => void;
  children?: ReactNode;
}>;

/** The form of a type that only asks for a name: grid, document, sheet template and folder.
 *
 *  Example: `<NamedItemForm maxLength={40} live onCreate={send} onClose={close} />` */
export function NamedItemForm(props: NamedItemFormProps): React.JSX.Element {
  const [name, setName] = useState('');
  const canCreate = props.live && (props.blankName !== undefined || name.trim() !== '');
  const send = (): void => {
    if (!canCreate) return;
    props.onCreate(name.trim());
    props.onClose();
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <NameField
        value={name}
        onChange={setName}
        maxLength={props.maxLength}
        placeholder={props.blankName}
      />
      {props.children}
      <NewItemFooter canCreate={canCreate} onCancel={props.onClose} />
    </form>
  );
}

type NewFolderFormProps = Readonly<{
  live: boolean;
  onCreate: (name: string, visibility: SceneVisibilityDto) => void;
  onClose: () => void;
}>;

/** The "Pasta" of "Novo item": a name and who sees what goes inside it (public unless chosen).
 *
 *  Example: `<NewFolderForm live onCreate={send} onClose={close} />` */
export function NewFolderForm(props: NewFolderFormProps): React.JSX.Element {
  const [visibility, setVisibility] = useState<SceneVisibilityDto>('public');
  return (
    <NamedItemForm
      maxLength={SCENE_FOLDER_NAME_MAX_LENGTH}
      live={props.live}
      onCreate={(name) => props.onCreate(name, visibility)}
      onClose={props.onClose}
    >
      <SegmentField
        legend="Quem vê na biblioteca"
        fill
        value={visibility}
        onChange={setVisibility}
        hint={visibility === 'private' ? FOLDER_PRIVATE_HINT : undefined}
        options={[
          { value: 'public', label: 'Pública' },
          { value: 'private', label: 'Privada' },
        ]}
      />
    </NamedItemForm>
  );
}

const FOLDER_PRIVATE_HINT = 'Só os mestres veem o que estiver dentro, até os itens públicos.';
