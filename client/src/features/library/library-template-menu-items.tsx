import type { SheetTemplateSummaryDto } from '@lorkarium/contracts';
import { useId } from 'react';
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { planHintIdOf } from '@/features/plans/plan-gate';
import { DeleteConfirmDialog } from './delete-scene-dialog';
import { useLibraryPlanGates } from './library-plan-gates';
import type { MenuActions, TreeMaster } from './library-tree-menu';

type CreateItemsProps = Readonly<{ master: TreeMaster; folderId: string | null }>;

/** What the root and a folder offer to create: "Novo item" there, or a `.lksheet` read into it.
 *
 *  Example: `<CreateItems master={master} folderId={folder.id} />` */
export function CreateItems({ master, folderId }: CreateItemsProps) {
  const templateGate = useLibraryPlanGates().sheetTemplate;
  const hintId = useId();
  return (
    <>
      <ContextMenuItem disabled={!master.live} onSelect={() => master.createItem(folderId)}>
        Criar novo item
      </ContextMenuItem>
      {master.importSheetTemplate && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!master.live || !templateGate.open}
            aria-describedby={planHintIdOf(templateGate, hintId)}
            onSelect={() => master.importSheetTemplate?.(folderId)}
          >
            Importar modelo…
          </ContextMenuItem>
          {!templateGate.open && (
            <ContextMenuLabel id={hintId} className="max-w-56 text-xs font-normal">
              {templateGate.hint}
            </ContextMenuLabel>
          )}
        </>
      )}
    </>
  );
}

/** The menu over a sheet template in the tree.
 *
 *  Example: `<TemplateItems {...props} template={template} />` */
export function TemplateItems(
  props: MenuActions & Readonly<{ template: SheetTemplateSummaryDto }>,
) {
  const { master, template } = props;
  return (
    <>
      {master.exportSheetTemplate && (
        <ContextMenuItem
          disabled={!master.live}
          onSelect={() => master.exportSheetTemplate?.(template.id)}
        >
          Exportar modelo
        </ContextMenuItem>
      )}
      <ContextMenuItem
        variant="destructive"
        disabled={!master.live}
        onSelect={() => props.setTask({ kind: 'deleteTemplate', template })}
      >
        Excluir modelo
      </ContextMenuItem>
    </>
  );
}

type TemplateTaskProps = Readonly<{
  master: TreeMaster;
  template: SheetTemplateSummaryDto;
  onClose: () => void;
}>;

/** Asks before deleting a template; the server refuses one still tied to sheets.
 *
 *  Example: `<DeleteTemplateTask master={master} template={template} onClose={close} />` */
export function DeleteTemplateTask({ master, template, onClose }: TemplateTaskProps) {
  return (
    <DeleteConfirmDialog
      title={`Excluir ${template.name}?`}
      description="O código do modelo some para todos os mestres. Um modelo ligado a fichas não pode ser excluído."
      onClose={onClose}
      onConfirm={() =>
        void master.submit({ intent: 'removeSheetTemplate', templateId: template.id })
      }
    />
  );
}
