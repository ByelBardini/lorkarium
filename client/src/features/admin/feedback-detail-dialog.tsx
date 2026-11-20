import type { FeedbackEntryDto } from '@lorkarium/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { feedbackAttachmentUrlOf } from '@/lib/feedback-attachment-url';
import {
  FEEDBACK_KIND_TAG,
  FEEDBACK_PLATFORM_TAG,
  feedbackSectionsOf,
} from './feedback-admin-text';
import { ScreenshotGallery } from './screenshot-gallery';

export type FeedbackDetailDialogProps = Readonly<{ entry: FeedbackEntryDto; onClose: () => void }>;

/** One entry as the sender wrote it: the sections, where and the version, and the screenshots
 *  (which never go to GitHub), each opening at its full size in a new tab.
 *
 *  Example: `<FeedbackDetailDialog entry={entry} onClose={close} />` */
export function FeedbackDetailDialog({
  entry,
  onClose,
}: FeedbackDetailDialogProps): React.JSX.Element {
  const sentAt = new Date(entry.createdAt).toLocaleString('pt-BR');
  const where = `${FEEDBACK_PLATFORM_TAG[entry.platform]} · ${entry.appVersion}`;
  const facts = [...feedbackSectionsOf(entry.content), ['Onde', where] as const];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{`${FEEDBACK_KIND_TAG[entry.content.kind]} de @${entry.sender.username}`}</DialogTitle>
          <DialogDescription>{sentAt}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-label">{term}</dt>
              <dd className="break-words whitespace-pre-wrap text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <ScreenshotGallery
          shots={entry.attachments}
          urlOf={(shotId) => feedbackAttachmentUrlOf(entry.id, shotId)}
        />
      </DialogContent>
    </Dialog>
  );
}
