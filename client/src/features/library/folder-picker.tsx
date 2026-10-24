import type { SceneFolderDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { FolderNode, TreeScene } from '@/lib/folder-tree';
import type { LibraryTree } from './folder-tree-nav';

const INDENT = '   ';

type PickerOption = Readonly<{ id: string; label: string }>;

export type FolderPickerProps = Readonly<{
  label: string;
  tree: LibraryTree;
  /** `null` = "Sem pasta". */
  value: string | null;
  onChange: (folderId: string | null) => void;
  /** Leaves out the folders a moved folder cannot enter. */
  allows?: (folderId: string) => boolean;
  disabled?: boolean;
}>;

/** Where a grid (or a folder) goes: "Sem pasta" and the whole tree, indented by level. The way
 *  to move by keyboard and screen reader; dragging is the other.
 *
 *  Example: `<FolderPicker label="Pasta" tree={tree} value={scene.folderId} onChange={move} />` */
export function FolderPicker(props: FolderPickerProps): React.JSX.Element {
  const id = useId();
  const options = optionsOf(props.tree.roots).filter((option) => props.allows?.(option.id) ?? true);
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-semibold tracking-[0.06em] text-label uppercase">
        {props.label}
      </label>
      <select
        id={id}
        value={props.value ?? ''}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value || null)}
        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50"
      >
        <option value="">Sem pasta</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function optionsOf<S extends TreeScene>(
  nodes: readonly FolderNode<SceneFolderDto, S>[],
): PickerOption[] {
  return nodes.flatMap((node) => [
    { id: node.folder.id, label: `${INDENT.repeat(node.depth - 1)}${node.folder.name}` },
    ...optionsOf(node.children),
  ]);
}
