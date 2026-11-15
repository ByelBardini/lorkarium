import type { UserReportDto, UserReportsPageDto } from '@lorkarium/contracts';
import { useFetcher } from 'react-router';
import { Alert } from '@/components/ui/alert';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { adminFailureMessage } from './admin-messages';
import type { ResolveReportIntent, ResolveReportResult } from './reports-action';
import { ReportsTable } from './reports-table';

export type ReportsPageProps = Readonly<{
  page: UserReportsPageDto;
  targetOf: (target: UserReportDto['target']) => React.ReactNode;
}>;

// A report closed by another admin answers 404: the generic "conta ou convite" would mislead.
function closeFailureMessage(failure: UserAdminFailure): string {
  if (failure.kind === 'not_found') return 'Essa denúncia já foi fechada.';
  return adminFailureMessage(failure);
}

/** "Denúncias": the open reports queue; resolving or dismissing one reloads the queue without it.
 *
 *  Example: `<ReportsPage page={page} targetOf={(target) => `@${target.username}`} />` */
export function ReportsPage({ page, targetOf }: ReportsPageProps): React.JSX.Element {
  const fetcher = useFetcher<ResolveReportResult>();
  const busy = fetcher.state !== 'idle';
  const result = busy ? undefined : fetcher.data;
  const close = (reportId: string, status: ResolveReportIntent['status']): void => {
    const intent: ResolveReportIntent = { reportId, status };
    void fetcher.submit(intent, { method: 'post', encType: 'application/json' });
  };
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · Denúncias</title>
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-[42px] leading-[1.05] font-medium">Denúncias</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {page.total} aberta{page.total === 1 ? '' : 's'}, da mais antiga para a mais nova. A
          punição é manual, pela suspensão em Usuários.
        </p>
      </header>
      {result && 'failure' in result && (
        <Alert variant="destructive" className="max-w-xl px-3.5 py-3 text-sm">
          {closeFailureMessage(result.failure)}
        </Alert>
      )}
      {page.reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma denúncia aberta.</p>
      ) : (
        <ReportsTable reports={page.reports} busy={busy} onClose={close} targetOf={targetOf} />
      )}
    </div>
  );
}
