import type { CampaignSummaryDto, JoinCampaignRequestDto } from '@lorkarium/contracts';
import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { HomeActionRequest, HomeActionResult } from './home-action';
import { JoinCampaignForm } from './join-campaign-form';

export type JoinCampaignDialogProps = Readonly<{
  onClose: () => void;
  onJoined: (campaign: CampaignSummaryDto) => void;
}>;

/** "Entrar numa mesa": the code, and the password only when the campaign asks for it.
 *  Mounted only while open, so every opening starts clean.
 *
 *  Example: `{dialog === 'join' && <JoinCampaignDialog onClose={close} onJoined={openDetail} />}` */
export function JoinCampaignDialog({
  onClose,
  onJoined,
}: JoinCampaignDialogProps): React.JSX.Element {
  const fetcher = useFetcher<HomeActionResult>();
  const settled = fetcher.state === 'idle' ? fetcher.data : undefined;
  const joined = settled && 'joined' in settled ? settled.joined : null;
  const failure = settled && 'failure' in settled ? settled.failure : null;
  useEffect(() => {
    if (joined) onJoined(joined);
  }, [joined, onJoined]);
  const send = (input: JoinCampaignRequestDto): void => {
    const body: HomeActionRequest = { intent: 'join', input };
    void fetcher.submit(body, { method: 'post', encType: 'application/json' });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entrar numa mesa</DialogTitle>
          <DialogDescription>Use o código que o mestre te passou.</DialogDescription>
        </DialogHeader>
        <JoinCampaignForm
          submitting={fetcher.state !== 'idle'}
          failure={failure}
          onSubmit={send}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
