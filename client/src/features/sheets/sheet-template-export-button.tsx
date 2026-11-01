import { DownloadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSheetTemplateExport, type SheetTemplateExportPorts } from './use-sheet-template-export';

const UNSAVED_EXPORT_NOTE = 'Exporta a versão salva; salve antes para levar o que mudou';

type ExportButtonProps = Readonly<{
  ports: SheetTemplateExportPorts | undefined;
  templateId: string;
  live: boolean;
  /** Unsaved code: the button says the file carries the saved version. */
  dirty: boolean;
}>;

/** "Exportar modelo" of the editor's header: downloads the saved version as a `.lksheet`;
 *  absent without the ports.
 *
 *  Example: `<SheetTemplateExportButton ports={exportPorts} templateId={id} live dirty={model.dirty} />` */
export function SheetTemplateExportButton(props: ExportButtonProps): React.JSX.Element | null {
  const exporter = useSheetTemplateExport(props.ports);
  if (!props.ports) return null;
  return (
    <>
      {exporter.problem && (
        <p role="status" className="text-xs text-destructive-text">
          {exporter.problem}
        </p>
      )}
      <Button
        aria-label="Exportar modelo"
        aria-description={props.dirty ? UNSAVED_EXPORT_NOTE : undefined}
        title={props.dirty ? UNSAVED_EXPORT_NOTE : 'Exportar modelo'}
        variant="ghost"
        size="icon-sm"
        disabled={!props.live || exporter.busy}
        onClick={() => void exporter.exportTemplate(props.templateId)}
      >
        <DownloadIcon aria-hidden="true" />
      </Button>
    </>
  );
}
