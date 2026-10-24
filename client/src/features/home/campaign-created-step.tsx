import type { CampaignDetailDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { CopyCodeButton } from '@/components/copy-code-button';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnterCampaignButton } from '@/features/campaigns/enter-campaign-button';
import { formatCampaignCode } from '@/lib/campaign-code';
import type { Clipboard } from '@/services/clipboard';
import { CREATED_NEXT_STEPS } from './create-campaign-messages';

const OVERLINE = 'text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase';

export type CampaignCreatedStepProps = Readonly<{
  campaign: CampaignDetailDto;
  /** The password just typed: the server never sends it back, so this is the one time it shows. */
  password: string | null;
  clipboard: Clipboard;
  onCreateAnother: () => void;
}>;

/** "Mesa criada": the code in large type with "Copiar código", the password (if any), three next
 *  steps, "Criar outra" and "Entrar na mesa".
 *
 *  Example: `<CampaignCreatedStep campaign={created} password={null} clipboard={c} onCreateAnother={reset} />` */
export function CampaignCreatedStep(props: CampaignCreatedStepProps): React.JSX.Element {
  const { campaign } = props;
  return (
    <div className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Mesa criada</DialogTitle>
        <DialogDescription>
          “{campaign.name}” está pronta. Passe o código para quem vai jogar.
        </DialogDescription>
      </DialogHeader>
      <CreatedCodeBlock campaign={campaign} password={props.password} clipboard={props.clipboard} />
      <NextSteps />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-end">
        <Button variant="outline" size="lg" onClick={props.onCreateAnother}>
          Criar outra
        </Button>
        <EnterCampaignButton campaignId={campaign.id} />
      </div>
    </div>
  );
}

type CreatedCodeBlockProps = Omit<CampaignCreatedStepProps, 'onCreateAnother'>;

function CreatedCodeBlock({
  campaign,
  password,
  clipboard,
}: CreatedCodeBlockProps): React.JSX.Element | null {
  const code = campaign.joinCode ? formatCampaignCode(campaign.joinCode) : null;
  if (!code) return null;
  return (
    <div className="flex flex-col gap-3 border-y border-border py-5">
      <span className={OVERLINE}>Código da mesa</span>
      <span className="font-brand text-[34px] leading-none tracking-[0.2em] break-all text-primary sm:text-[40px]">
        {code}
      </span>
      <CopyCodeButton code={code} clipboard={clipboard} />
      {password && (
        <p className="text-sm text-muted-foreground">
          Senha: <strong className="font-semibold text-foreground">{password}</strong> · passe junto
          com o código.
        </p>
      )}
    </div>
  );
}

function NextSteps(): React.JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className={OVERLINE}>
        Próximos passos
      </h3>
      <ol className="flex flex-col gap-2.5">
        {CREATED_NEXT_STEPS.map((step, index) => (
          <li key={step} className="flex items-start gap-3 text-sm text-label">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-sm bg-muted text-xs font-semibold text-primary"
            >
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}
