import type { UserReportDto } from '@lorkarium/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { reportAttachmentUrlOf } from '@/lib/report-attachment-url';
import { REPORT_REASON_LABEL } from './admin-messages';
import { reportPartyLabel } from './reports-text';
import { ScreenshotGallery } from './screenshot-gallery';

export type ReportDetailDialogProps = Readonly<{ report: UserReportDto; onClose: () => void }>;

/** One report as a whole: who, whom (with the name of the time), the table, the text, the admin's
 *  note and the screenshots, each opening at its full size in a new tab.
 *
 *  Example: `<ReportDetailDialog report={report} onClose={close} />` */
export function ReportDetailDialog({
  report,
  onClose,
}: ReportDetailDialogProps): React.JSX.Element {
  const sentAt = new Date(report.createdAt).toLocaleString('pt-BR');
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{`Denúncia de ${reportPartyLabel(report.reporter)}`}</DialogTitle>
          <DialogDescription>{`${REPORT_REASON_LABEL[report.reason]} · ${sentAt}`}</DialogDescription>
        </DialogHeader>
        <ReportFacts report={report} />
        <ScreenshotGallery
          shots={report.attachments}
          urlOf={(shotId) => reportAttachmentUrlOf(report.id, shotId)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReportFacts({ report }: Readonly<{ report: UserReportDto }>): React.JSX.Element {
  const { target } = report;
  const facts: ReadonlyArray<readonly [string, string]> = [
    ['Denunciado', `${reportPartyLabel(target)} · ${target.name}`],
    ['Mesa', report.campaignName ?? 'Sem mesa'],
    ['Texto', report.details ?? 'Sem texto'],
    ...(report.adminNote ? [['Nota do admin', report.adminNote] as const] : []),
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {facts.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-label">{term}</dt>
          <dd className="break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
