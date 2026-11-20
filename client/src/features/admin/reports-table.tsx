import type { UserReportDto } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { REPORT_REASON_LABEL } from './admin-messages';
import { reportPartyLabel, reportShotsLabel } from './reports-text';

/** The reported side of a report whose account still exists. */
export type LiveReportTarget = Readonly<{ id: string; username: string }>;

export type ReportsTableProps = Readonly<{
  reports: readonly UserReportDto[];
  /** True while one report is being closed: every button waits. */
  busy: boolean;
  onOpen: (report: UserReportDto) => void;
  onResolve: (report: UserReportDto) => void;
  onDismiss: (reportId: string) => void;
  /** `null` when the reported account cannot take a measure here (deleted, or not listed). */
  onMeasureOf: (report: UserReportDto) => (() => void) | null;
  /** The reported person's @, as a link that opens their profile card. */
  targetOf: (target: LiveReportTarget) => React.ReactNode;
}>;

const HEAD =
  'px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-placeholder uppercase';
const CELL = 'px-3.5 py-3 align-top text-sm text-label';
const TITLES = ['Motivo', 'Texto', 'Mesa', 'Prints', 'Denunciante', 'Denunciado', 'Data'];

/** The open reports, oldest first: reason, text, table, screenshots, both sides, and what the
 *  admin does with it (open, measure, resolve, dismiss).
 *
 *  Example: `<ReportsTable reports={page.reports} busy={false} onOpen={…} onResolve={…} onDismiss={…} onMeasureOf={…} targetOf={…} />` */
export function ReportsTable(props: ReportsTableProps): React.JSX.Element {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Denúncias abertas</caption>
        <thead>
          <tr>
            {TITLES.map((title) => (
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

type ReportRowProps = Readonly<{ report: UserReportDto }> & ReportsTableProps;

function ReportRow({ report, targetOf, ...props }: ReportRowProps): React.JSX.Element {
  const { target } = report;
  return (
    <tr className="border-t border-divider">
      <td className={`${CELL} font-semibold whitespace-nowrap text-foreground`}>
        {REPORT_REASON_LABEL[report.reason]}
      </td>
      <td className={`${CELL} max-w-md break-words`}>
        {report.details ?? <span className="text-muted-foreground">Sem texto</span>}
      </td>
      <td className={CELL}>
        {report.campaignName ?? <span className="text-muted-foreground">Sem mesa</span>}
      </td>
      <td className={`${CELL} whitespace-nowrap`}>{reportShotsLabel(report.attachments.length)}</td>
      <td className={`${CELL} whitespace-nowrap`}>{reportPartyLabel(report.reporter)}</td>
      <td className={`${CELL} whitespace-nowrap`}>
        {target.id === null ? reportPartyLabel(target) : targetOf({ ...target, id: target.id })}
      </td>
      <td className={`${CELL} whitespace-nowrap tabular-nums`}>
        {new Date(report.createdAt).toLocaleDateString('pt-BR')}
      </td>
      <td className={`${CELL} text-right whitespace-nowrap`}>
        <ReportActions report={report} {...props} />
      </td>
    </tr>
  );
}

function ReportActions({
  report,
  busy,
  onOpen,
  onResolve,
  onDismiss,
  onMeasureOf,
}: Omit<ReportRowProps, 'targetOf' | 'reports'>): React.JSX.Element {
  const measure = onMeasureOf(report);
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => onOpen(report)}>
        Abrir
      </Button>
      {measure && (
        <Button size="sm" variant="outline" disabled={busy} onClick={measure}>
          Aplicar medida
        </Button>
      )}
      <Button size="sm" disabled={busy} onClick={() => onResolve(report)}>
        Resolver
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onDismiss(report.id)}>
        Arquivar
      </Button>
    </div>
  );
}
