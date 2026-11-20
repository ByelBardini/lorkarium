import type { FeedbackEntryDto } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { FEEDBACK_KIND_TAG, FEEDBACK_PLATFORM_TAG, feedbackSummaryOf } from './feedback-admin-text';
import { reportShotsLabel } from './reports-text';

export type FeedbackTableProps = Readonly<{
  entries: readonly FeedbackEntryDto[];
  /** True while one entry is being published or archived: every button waits. */
  busy: boolean;
  onOpen: (entry: FeedbackEntryDto) => void;
  onPublish: (entry: FeedbackEntryDto) => void;
  onArchive: (entry: FeedbackEntryDto) => void;
}>;

const HEAD =
  'px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-placeholder uppercase';
const CELL = 'px-3.5 py-3 align-top text-sm text-label';
const TITLES = ['Tipo', 'Resumo', 'Onde', 'Prints', 'Quem enviou', 'Data'];

/** The waiting entries, oldest first: kind, first line, where, screenshots, the sender's @ and
 *  what the admin does with it (open, publish, archive).
 *
 *  Example: `<FeedbackTable entries={page.entries} busy={false} onOpen={…} onPublish={…} onArchive={…} />` */
export function FeedbackTable(props: FeedbackTableProps): React.JSX.Element {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Relatos esperando análise</caption>
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
          {props.entries.map((entry) => (
            <FeedbackRow key={entry.id} entry={entry} {...props} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeedbackRow({
  entry,
  busy,
  onOpen,
  onPublish,
  onArchive,
}: FeedbackTableProps & Readonly<{ entry: FeedbackEntryDto }>): React.JSX.Element {
  return (
    <tr className="border-t border-divider">
      <td className={`${CELL} font-semibold whitespace-nowrap text-foreground`}>
        {FEEDBACK_KIND_TAG[entry.content.kind]}
      </td>
      <td className={`${CELL} max-w-md break-words`}>{feedbackSummaryOf(entry.content)}</td>
      <td className={`${CELL} whitespace-nowrap`}>
        {`${FEEDBACK_PLATFORM_TAG[entry.platform]} · ${entry.appVersion}`}
      </td>
      <td className={`${CELL} whitespace-nowrap`}>{reportShotsLabel(entry.attachments.length)}</td>
      <td className={`${CELL} whitespace-nowrap`}>{`@${entry.sender.username}`}</td>
      <td className={`${CELL} whitespace-nowrap tabular-nums`}>
        {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
      </td>
      <td className={`${CELL} text-right whitespace-nowrap`}>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => onOpen(entry)}>
            Abrir
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onPublish(entry)}>
            Publicar no GitHub
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onArchive(entry)}>
            Arquivar
          </Button>
        </div>
      </td>
    </tr>
  );
}
