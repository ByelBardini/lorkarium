import type { SheetTemplateSummaryDto } from '@lorkarium/contracts';
import { ContextMenuItem } from '@/components/ui/context-menu';
import { DeleteConfirmDialog } from './delete-scene-dialog';
import type { MenuActions, TreeMaster } from './library-tree-menu';

type NewTemplateItemProps = Readonly<{
  master: TreeMaster;
  folderId: string | null;
  label: string;
}>;

/** "Novo modelo de ficha" in a folder (`null` = the root); absent when the master cannot create.
 *
 *  Example: `<NewTemplateItem master={master} folderId={null} label="Novo modelo de ficha" />` */
export function NewTemplateItem({ master, folderId, label }: NewTemplateItemProps) {
  if (!master.createSheetTemplate) return null;
  return (
    <ContextMenuItem
      disabled={!master.live}
      onSelect={() => master.createSheetTemplate?.(folderId)}
    >
      {label}
    </ContextMenuItem>
  );
}

/** "Importar modelo de ficha" in a folder (`null` = the root): opens the `.lksheet` picker.
 *
 *  Example: `<ImportTemplateItem master={master} folderId={null} label="Importar modelo de ficha" />` */
export function ImportTemplateItem({ master, folderId, label }: NewTemplateItemProps) {
  if (!master.importSheetTemplate) return null;
  return (
    <ContextMenuItem
      disabled={!master.live}
      onSelect={() => master.importSheetTemplate?.(folderId)}
    >
      {label}
    </ContextMenuItem>
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
