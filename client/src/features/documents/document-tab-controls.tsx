import { useRef } from 'react';
import { DOCUMENT_TAB_NAME_MAX_LENGTH, type DocumentTabSummaryDto } from '@lorkarium/contracts';
import { EllipsisVerticalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { shiftedTabOrder } from '@/lib/tab-order';
import type { DocumentTabCommand } from '@/stores/document-editor-store';

/** The name field that replaces a tab while renaming: Enter or leaving saves, Escape gives up.
 *
 *  Example: `<TabNameInput name="Itens" onDone={(name) => name && rename(name)} />` */
export function TabNameInput(
  props: Readonly<{ name: string; onDone: (name: string | null) => void }>,
): React.JSX.Element {
  // Escape unmounts the field, and the blur that follows must not save what was abandoned.
  const done = useRef(false);
  const finish = (name: string | null): void => {
    if (done.current) return;
    done.current = true;
    props.onDone(name);
  };
  return (
    <Input
      autoFocus
      aria-label="Nome da aba"
      defaultValue={props.name}
      maxLength={DOCUMENT_TAB_NAME_MAX_LENGTH}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => finish(event.currentTarget.value.trim() || null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(event.currentTarget.value.trim() || null);
        if (event.key === 'Escape') finish(null);
      }}
      className="h-8 w-36 shrink-0 text-sm"
    />
  );
}

type DocumentTabMenuProps = Readonly<{
  tab: DocumentTabSummaryDto;
  order: readonly string[];
  canManage: boolean;
  onRename: () => void;
  onRemove: () => void;
  onRun: (command: DocumentTabCommand) => void;
}>;

/** One tab's actions. "Só mestres" is the master's alone; "Excluir" is missing on the last tab.
 *
 *  Example: `<DocumentTabMenu tab={tab} order={ids} canManage onRename={…} onRemove={…} onRun={…} />` */
export function DocumentTabMenu(props: DocumentTabMenuProps): React.JSX.Element {
  const { tab, order } = props;
  const move = (step: -1 | 1): void =>
    props.onRun({ kind: 'reorder', tabIds: shiftedTabOrder(order, tab.id, step) });
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Opções da aba ${tab.name}`}
          className="shrink-0 text-muted-foreground"
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
        <DropdownMenuItem onSelect={props.onRename}>Renomear</DropdownMenuItem>
        {order[0] !== tab.id && (
          <DropdownMenuItem onSelect={() => move(-1)}>Mover para a esquerda</DropdownMenuItem>
        )}
        {order.at(-1) !== tab.id && (
          <DropdownMenuItem onSelect={() => move(1)}>Mover para a direita</DropdownMenuItem>
        )}
        {props.canManage && (
          <DropdownMenuCheckboxItem
            checked={tab.visibility === 'masters'}
            onCheckedChange={(checked) =>
              props.onRun({
                kind: 'visibility',
                tabId: tab.id,
                visibility: checked ? 'masters' : 'document',
              })
            }
          >
            Só mestres
          </DropdownMenuCheckboxItem>
        )}
        {order.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={props.onRemove}>
              Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Confirms deleting a tab that has a body to lose. Example: `<RemoveTabDialog name="Itens" onAnswer={…} />` */
export function RemoveTabDialog(
  props: Readonly<{ name: string; onAnswer: (confirmed: boolean) => void }>,
): React.JSX.Element {
  return (
    <AlertDialog open onOpenChange={(open) => !open && props.onAnswer(false)}>
      <AlertDialogContent>
        <AlertDialogTitle>Excluir a aba “{props.name}”?</AlertDialogTitle>
        <AlertDialogDescription>O texto desta aba será apagado para todos.</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => props.onAnswer(true)}>Excluir aba</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
