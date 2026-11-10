import { SHEET_TEMPLATE_ENTRY_PATH } from '@lorkarium/contracts';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FilePlusIcon,
  PencilIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addTemplateFile,
  moveTemplateFile,
  removeTemplateFile,
  renameTemplateFile,
  type TemplateFile,
  type TemplateFilesChange,
  type TemplateFilesProblem,
} from '@/lib/sheet-template-files';
import { cn } from '@/lib/utils';
import { templateFilesProblemMessage } from './sheet-template-messages';

export type SheetFileTreeProps = Readonly<{
  files: readonly TemplateFile[];
  selected: string;
  onSelect: (path: string) => void;
  onChange: (files: readonly TemplateFile[]) => void;
}>;

type Naming = Readonly<{ mode: 'add' } | { mode: 'rename'; from: string }>;

/** The files of a template, in the order CSS and JS run: pick one to edit; create, rename,
 *  remove and reorder them (the entry page `index.html` is never renamed nor removed). A path the
 *  contract refuses or one already taken is said, and nothing changes.
 *
 *  Example: `<SheetFileTree files={draft.files} selected={path} onSelect={setPath} onChange={(files) => onEdit({ files })} />` */
export function SheetFileTree(props: SheetFileTreeProps): React.JSX.Element {
  const [naming, setNaming] = useState<Naming | null>(null);
  const [problem, setProblem] = useState<TemplateFilesProblem | null>(null);
  const apply = (change: TemplateFilesChange, select?: string): boolean => {
    if (!change.ok) {
      setProblem(change.problem);
      return false;
    }
    setProblem(null);
    props.onChange(change.files);
    if (select !== undefined) props.onSelect(select);
    return true;
  };
  const name = (path: string): void => {
    const change =
      naming?.mode === 'rename'
        ? renameTemplateFile(props.files, naming.from, path)
        : addTemplateFile(props.files, path);
    if (apply(change, path)) setNaming(null);
  };
  return (
    <div className="flex min-h-0 w-48 shrink-0 flex-col border-r border-border bg-panel">
      <FileActions {...props} onNaming={setNaming} onApply={apply} />
      {naming && (
        <FileNameForm
          naming={naming}
          onSubmit={name}
          onCancel={() => {
            setNaming(null);
            setProblem(null);
          }}
        />
      )}
      {problem && (
        <p role="alert" className="px-2 py-1 text-xs text-destructive-text">
          {templateFilesProblemMessage(problem)}
        </p>
      )}
      <FileList {...props} />
    </div>
  );
}

type FileActionsProps = SheetFileTreeProps &
  Readonly<{
    onNaming: (naming: Naming) => void;
    onApply: (change: TemplateFilesChange, select?: string) => boolean;
  }>;

function FileActions(props: FileActionsProps): React.JSX.Element {
  const { files, selected } = props;
  const entry = selected === SHEET_TEMPLATE_ENTRY_PATH;
  const move = (offset: number): void => {
    props.onChange(moveTemplateFile(files, selected, offset));
  };
  const remove = (): void => {
    props.onApply(removeTemplateFile(files, selected), SHEET_TEMPLATE_ENTRY_PATH);
  };
  return (
    <div role="toolbar" aria-label="Arquivos" className="flex gap-0.5 border-b border-border p-1">
      <IconButton
        label="Novo arquivo"
        icon={FilePlusIcon}
        onClick={() => props.onNaming({ mode: 'add' })}
      />
      <IconButton
        label="Renomear arquivo"
        icon={PencilIcon}
        disabled={entry}
        onClick={() => props.onNaming({ mode: 'rename', from: selected })}
      />
      <IconButton label="Subir arquivo" icon={ArrowUpIcon} onClick={() => move(-1)} />
      <IconButton label="Descer arquivo" icon={ArrowDownIcon} onClick={() => move(1)} />
      <IconButton label="Apagar arquivo" icon={Trash2Icon} disabled={entry} onClick={remove} />
    </div>
  );
}

type IconButtonProps = Readonly<{
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}>;

function IconButton({ label, icon: Icon, onClick, disabled }: IconButtonProps): React.JSX.Element {
  return (
    <Button
      aria-label={label}
      title={label}
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

type FileNameFormProps = Readonly<{
  naming: Naming;
  onSubmit: (path: string) => void;
  onCancel: () => void;
}>;

function FileNameForm({ naming, onSubmit, onCancel }: FileNameFormProps): React.JSX.Element {
  const [path, setPath] = useState(naming.mode === 'rename' ? naming.from : '');
  const label = naming.mode === 'rename' ? 'Novo caminho do arquivo' : 'Caminho do novo arquivo';
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit(path.trim());
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-1 border-b border-border p-2">
      <Input
        aria-label={label}
        value={path}
        placeholder="paginas/perfil.html"
        onChange={(event) => setPath(event.target.value)}
        className="h-8 font-mono text-xs"
        autoFocus
      />
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={path.trim() === ''}>
          {naming.mode === 'rename' ? 'Renomear' : 'Criar'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FileList({ files, selected, onSelect }: SheetFileTreeProps): React.JSX.Element {
  return (
    <ul aria-label="Arquivos do modelo" className="min-h-0 flex-1 overflow-y-auto py-1">
      {files.map(({ path }) => (
        <li key={path}>
          <button
            type="button"
            aria-current={path === selected ? 'true' : undefined}
            onClick={() => onSelect(path)}
            className={cn(
              'w-full truncate px-3 py-1 text-left font-mono text-xs hover:bg-muted/60',
              path === selected && 'bg-card text-primary',
            )}
          >
            {path}
          </button>
        </li>
      ))}
    </ul>
  );
}
