import { XIcon } from 'lucide-react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { closedTableMessage } from '@/features/campaigns/campaign-messages';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';

export type DeletedTableNoticeProps = Readonly<{ openTables: StoreApi<OpenTablesStore> }>;

/** The notice of a table the server closed while it was open in this tab (deleted by its master,
 *  or left), on top of whatever screen the person is on, until they close it.
 *
 *  Example: `<DeletedTableNotice openTables={openTables} />` */
export function DeletedTableNotice({
  openTables,
}: DeletedTableNoticeProps): React.JSX.Element | null {
  const notice = useOpenTables(openTables, (state) => state.deletedNotice);
  if (!notice) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-destructive/60 bg-destructive/10 px-4 py-2 text-sm text-destructive-text sm:px-8 lg:px-12"
    >
      <p className="flex-1">{closedTableMessage(notice)}</p>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Fechar aviso"
        onClick={() => openTables.getState().dismissDeletedNotice()}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
