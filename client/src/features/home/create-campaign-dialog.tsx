import type { CampaignDetailDto, CreateCampaignRequestDto } from '@lorkarium/contracts';
import { useFetcher } from 'react-router';
import { CopyCodeButton } from '@/components/copy-code-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCampaignCode } from '@/lib/campaign-code';
import type { Clipboard } from '@/services/clipboard';
import { CreateCampaignForm } from './create-campaign-form';
import type { HomeActionRequest, HomeActionResult } from './home-action';

export type CreateCampaignDialogProps = Readonly<{ clipboard: Clipboard; onClose: () => void }>;

/** "Nova mesa": the form, then the code to hand out. Mounted only while open, so every opening
 *  starts from an empty form.
 *
 *  Example: `{dialog === 'create' && <CreateCampaignDialog clipboard={clipboard} onClose={close} />}` */
export function CreateCampaignDialog({
  clipboard,
  onClose,
}: CreateCampaignDialogProps): React.JSX.Element {
  const fetcher = useFetcher<HomeActionResult>();
  const created = fetcher.data && 'created' in fetcher.data ? fetcher.data.created : null;
  const failure = fetcher.data && 'failure' in fetcher.data ? fetcher.data.failure : null;
  const send = (input: CreateCampaignRequestDto): void => {
    const body: HomeActionRequest = { intent: 'create', input };
    void fetcher.submit(body, { method: 'post', encType: 'application/json' });
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={!created}
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
      >
        {created ? (
          <CreatedStep campaign={created} clipboard={clipboard} onClose={onClose} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nova mesa</DialogTitle>
              <DialogDescription>
                Você vai ser o mestre. Dá para ajustar o resto depois.
              </DialogDescription>
            </DialogHeader>
            <CreateCampaignForm
              submitting={fetcher.state !== 'idle'}
              failure={failure}
              onSubmit={send}
              onCancel={onClose}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type CreatedStepProps = Readonly<{
  campaign: CampaignDetailDto;
  clipboard: Clipboard;
  onClose: () => void;
}>;

function CreatedStep({ campaign, clipboard, onClose }: CreatedStepProps): React.JSX.Element {
  const code = campaign.joinCode ? formatCampaignCode(campaign.joinCode) : null;
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>Mesa criada</DialogTitle>
        <DialogDescription>
          “{campaign.name}” está pronta. Passe o código para quem vai jogar.
        </DialogDescription>
      </DialogHeader>
      {code && (
        <div className="flex flex-col gap-3 border-y border-border py-5">
          <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Código da mesa
          </span>
          <span className="font-brand text-[28px] tracking-[0.2em] text-primary">{code}</span>
          <CopyCodeButton code={code} clipboard={clipboard} />
        </div>
      )}
      <div className="flex justify-end">
        <Button size="lg" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
