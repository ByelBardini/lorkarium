import type { UserReportDto } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { REPORT_REASON_LABEL } from './admin-messages';

export type ReportsTableProps = Readonly<{
  reports: readonly UserReportDto[];
  /** True while one report is being closed: every button waits. */
  busy: boolean;
  onClose: (reportId: string, status: 'resolved' | 'dismissed') => void;
  /** The reported person's @, as a link that opens their profile card. */
  targetOf: (target: UserReportDto['target']) => React.ReactNode;
}>;

const HEAD =
  'px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-placeholder uppercase';
const CELL = 'px-3.5 py-3 align-top text-sm text-label';

/** The open reports, oldest first: reason, text, who reported, who was reported, and the two
 *  ways to close it.
 *
 *  Example: `<ReportsTable reports={page.reports} busy={false} onClose={close} targetOf={(t) => `@${t.username}`} />` */
export function ReportsTable(props: ReportsTableProps): React.JSX.Element {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Denúncias abertas</caption>
        <thead>
          <tr>
            {['Motivo', 'Texto', 'Denunciante', 'Denunciado', 'Data'].map((title) => (
              <th key={title} scope="col" className={HEAD}>
                {title}
              </th>
            ))}
            <th scope="col" className={HEAD}>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.reports.map((report) => (
            <ReportRow key={report.id} report={report} {...props} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportRow({
  report,
  busy,
  onClose,
  targetOf,
}: Readonly<{ report: UserReportDto }> & ReportsTableProps): React.JSX.Element {
  return (
    <tr className="border-t border-divider">
      <td className={`${CELL} font-semibold whitespace-nowrap text-foreground`}>
        {REPORT_REASON_LABEL[report.reason]}
      </td>
      <td className={`${CELL} max-w-md break-words`}>
        {report.details ?? <span className="text-muted-foreground">Sem texto</span>}
      </td>
      <td className={`${CELL} whitespace-nowrap`}>@{report.reporter.username}</td>
      <td className={`${CELL} whitespace-nowrap`}>{targetOf(report.target)}</td>
      <td className={`${CELL} whitespace-nowrap tabular-nums`}>
        {new Date(report.createdAt).toLocaleDateString('pt-BR')}
      </td>
      <td className={`${CELL} text-right whitespace-nowrap`}>
        <div className="flex justify-end gap-2">
          <Button size="sm" disabled={busy} onClick={() => onClose(report.id, 'resolved')}>
            Resolver
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onClose(report.id, 'dismissed')}
          >
            Arquivar
          </Button>
        </div>
      </td>
    </tr>
  );
}
