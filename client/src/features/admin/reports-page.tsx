import type { AdminUserDto, UserReportDto, UserReportsPageDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Alert } from '@/components/ui/alert';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { adminFailureMessage } from './admin-messages';
import type { ResolveReportIntent, ResolveReportResult } from './reports-action';
import { ReportDetailDialog } from './reports-detail-dialog';
import { ReportResolveDialog } from './reports-resolve-dialog';
import { ReportsTable, type ReportsTableProps } from './reports-table';
import { UsersDialog, type OpenDialog, type UsersDialogProps } from './users-dialog';

/** What "Aplicar medida" needs: the accounts as the backoffice lists them (the reported one is
 *  found there) and what the measure and deletion dialogs of Usuários use. */
export type ReportsMeasureProps = Readonly<{
  users: readonly AdminUserDto[];
  dialogs: Pick<
    UsersDialogProps,
    'clipboard' | 'badgesApi' | 'billingApi' | 'sanctionsApi' | 'twoFactorOn'
  >;
}>;

export type ReportsPageProps = Readonly<{
  page: UserReportsPageDto;
  targetOf: ReportsTableProps['targetOf'];
  measure: ReportsMeasureProps;
}>;

type ReportsDialog =
  | Readonly<{ kind: 'detail' | 'resolve'; report: UserReportDto }>
  | Readonly<{ kind: 'measure'; dialog: OpenDialog }>;

// A report closed by another admin answers 404: the generic "conta ou convite" would mislead.
function closeFailureMessage(failure: UserAdminFailure): string {
  if (failure.kind === 'not_found') return 'Essa denúncia já foi fechada.';
  return adminFailureMessage(failure);
}

/** "Denúncias": the open reports queue; opening one shows its screenshots, a measure taken from it
 *  is tied to it, and resolving (with a note) or dismissing reloads the queue without it.
 *
 *  Example: `<ReportsPage page={page} targetOf={(target) => `@${target.username}`} measure={measure} />` */
export function ReportsPage({ page, targetOf, measure }: ReportsPageProps): React.JSX.Element {
  const fetcher = useFetcher<ResolveReportResult>();
  const [open, setOpen] = useState<ReportsDialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = fetcher.state !== 'idle';
  const result = busy ? undefined : fetcher.data;
  const close = (intent: ResolveReportIntent): void => {
    setOpen(null);
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  const measureOf = (report: UserReportDto): (() => void) | null => {
    const user = measure.users.find((each) => each.id === report.target.id);
    if (!user) return null;
    const dialog: OpenDialog = { kind: 'sanction', user, draft: { reportId: report.id } };
    return () => setOpen({ kind: 'measure', dialog });
  };
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · Denúncias</title>
      <ReportsHeader total={page.total} />
      {result && 'failure' in result && (
        <Alert variant="destructive" className="max-w-xl px-3.5 py-3 text-sm">
          {closeFailureMessage(result.failure)}
        </Alert>
      )}
      {notice && (
        <p role="status" className="text-sm text-foreground">
          {notice}
        </p>
      )}
      {page.reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma denúncia aberta.</p>
      ) : (
        <ReportsTable
          reports={page.reports}
          busy={busy}
          onOpen={(report) => setOpen({ kind: 'detail', report })}
          onResolve={(report) => setOpen({ kind: 'resolve', report })}
          onDismiss={(reportId) => close({ reportId, status: 'dismissed' })}
          onMeasureOf={measureOf}
          targetOf={targetOf}
        />
      )}
      {open && (
        <OpenReportsDialog
          open={open}
          measure={measure}
          onResolve={(reportId, note) => close({ reportId, status: 'resolved', note })}
          onMeasured={(message) => {
            setNotice(message);
            setOpen(null);
          }}
          onSwitch={(dialog) => setOpen({ kind: 'measure', dialog })}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function ReportsHeader({ total }: Readonly<{ total: number }>): React.JSX.Element {
  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="font-display text-[42px] leading-[1.05] font-medium">Denúncias</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        {total} aberta{total === 1 ? '' : 's'}, da mais antiga para a mais nova. "Aplicar medida"
        liga a medida à denúncia; a denúncia só sai da fila ao resolver ou arquivar.
      </p>
    </header>
  );
}

type OpenReportsDialogProps = Readonly<{
  open: ReportsDialog;
  measure: ReportsMeasureProps;
  onResolve: (reportId: string, note: string) => void;
  onMeasured: (message: string) => void;
  onSwitch: (dialog: OpenDialog) => void;
  onClose: () => void;
}>;

function OpenReportsDialog({ open, measure, ...on }: OpenReportsDialogProps): React.JSX.Element {
  if (open.kind === 'detail')
    return <ReportDetailDialog report={open.report} onClose={on.onClose} />;
  if (open.kind !== 'measure') {
    const { id } = open.report;
    return (
      <ReportResolveDialog onResolve={(note) => on.onResolve(id, note)} onClose={on.onClose} />
    );
  }
  return (
    <UsersDialog
      {...measure.dialogs}
      dialog={open.dialog}
      onDone={on.onMeasured}
      onSwitch={on.onSwitch}
      onClose={on.onClose}
    />
  );
}
