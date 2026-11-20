import { useState } from 'react';
import type { FeedbackWhere } from '@/lib/feedback-platform';
import type { FeedbackApi } from '@/services/feedback-api';
import { FeedbackDialog } from './feedback-dialog';

export type FeedbackDialogHost = Readonly<{ open: () => void; dialog: React.JSX.Element }>;

/** The "Relatar bug ou sugerir" dialog of the shell: `open` for the user menu, `dialog` to render
 *  beside the frame.
 *
 *  Example: `const feedback = useFeedbackDialog(deps); <AppShell onFeedback={feedback.open} />{feedback.dialog}` */
export function useFeedbackDialog(
  deps: Readonly<{ feedbackApi: FeedbackApi; feedbackWhere: FeedbackWhere }>,
): FeedbackDialogHost {
  const [isOpen, setOpen] = useState(false);
  const dialog = (
    <FeedbackDialog
      api={deps.feedbackApi}
      where={deps.feedbackWhere}
      open={isOpen}
      onOpenChange={setOpen}
    />
  );
  return { open: () => setOpen(true), dialog };
}
