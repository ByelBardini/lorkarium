import { useState } from 'react';
import { useFetcher } from 'react-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Clipboard } from '@/services/clipboard';
import { CampaignCreatedStep } from './campaign-created-step';
import { CreateCampaignForm } from './create-campaign-form';
import type { HomeActionRequest, HomeActionResult } from './home-action';
import type { CreateCampaignSubmission } from './use-create-campaign-form';

export type CreateCampaignDialogProps = Readonly<{ clipboard: Clipboard; onClose: () => void }>;

/** "Nova mesa": the form, then the code to hand out. Mounted only while open, so every opening
 *  starts from an empty form; "Criar outra" starts a new round (a fresh fetcher and form).
 *
 *  Example: `{dialog === 'create' && <CreateCampaignDialog clipboard={clipboard} onClose={close} />}` */
export function CreateCampaignDialog({
  clipboard,
  onClose,
}: CreateCampaignDialogProps): React.JSX.Element {
  const [round, setRound] = useState(0);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg md:max-w-4xl">
        <CreateCampaignRound
          key={round}
          round={round}
          clipboard={clipboard}
          onClose={onClose}
          onCreateAnother={() => setRound((current) => current + 1)}
        />
      </DialogContent>
    </Dialog>
  );
}

type CreateCampaignRoundProps = CreateCampaignDialogProps &
  Readonly<{ round: number; onCreateAnother: () => void }>;

function CreateCampaignRound(props: CreateCampaignRoundProps): React.JSX.Element {
  const fetcher = useFetcher<HomeActionResult>({ key: `create-campaign-${props.round}` });
  const [password, setPassword] = useState<string | null>(null);
  const created = fetcher.data && 'created' in fetcher.data ? fetcher.data.created : null;
  const failure = fetcher.data && 'failure' in fetcher.data ? fetcher.data.failure : null;
  const send = (submission: CreateCampaignSubmission): void => {
    setPassword(submission.password);
    const body: HomeActionRequest = { intent: 'create', input: submission.input };
    void fetcher.submit(body, { method: 'post', encType: 'application/json' });
  };
  if (created) {
    return (
      <CampaignCreatedStep
        campaign={created}
        password={password}
        clipboard={props.clipboard}
        onCreateAnother={props.onCreateAnother}
      />
    );
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova mesa</DialogTitle>
      </DialogHeader>
      <CreateCampaignForm
        submitting={fetcher.state !== 'idle'}
        failure={failure}
        onSubmit={send}
        onCancel={props.onClose}
      />
    </>
  );
}
