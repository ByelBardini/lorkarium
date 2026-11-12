import type { AccountPlanDto, ProfileDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { useRevalidator } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { PlanSeal } from '@/components/plan-seal';
import { Button } from '@/components/ui/button';
import type { AccountLoadFailure, AccountResult } from '@/services/account-failure';
import { PlanGridTable } from './plan-grid-table';
import { campaignsUsageLabel, storageUsageLabel } from './plan-grid';
import { PLAN_NAMES } from '@/lib/plan-seal';
import { SectionHeading } from './section-heading';

/** What of the account, besides the plan, picks the seal and says why there is no plan limit. */
export type PlanSectionAccount = Pick<ProfileDto, 'admin' | 'lorkariumOwner'>;

export type PlanSectionProps = Readonly<{
  plan: AccountResult<AccountPlanDto, AccountLoadFailure>;
  account: PlanSectionAccount;
}>;

/** "Seu plano": the plan, what the account already spends of it and the grid of every plan. A
 *  failed read stays inside the section, so the rest of "Minha conta" still works.
 *
 *  Example: `<PlanSection plan={loaderData.plan} account={loaderData.profile} />` */
export function PlanSection({ plan, account }: PlanSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6 border-t border-divider pt-8">
      <SectionHeading id={titleId} title="Seu plano">
        O que você pode criar como dono de mesa e quanto já usa.
      </SectionHeading>
      {plan.ok ? (
        <PlanSummary plan={plan.value} account={account} />
      ) : (
        <PlanLoadAlert failure={plan.failure} />
      )}
    </section>
  );
}

type PlanSummaryProps = Readonly<{ plan: AccountPlanDto; account: PlanSectionAccount }>;

function PlanSummary({ plan, account }: PlanSummaryProps): React.JSX.Element {
  const scopeNote = noPlanLimitNote(plan, account);
  const { admin, lorkariumOwner } = account;
  const seal = { plan: plan.plan, admin, lorkariumOwner };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <h3 className="font-display text-xl font-semibold">{PLAN_NAMES[plan.plan]}</h3>
          <PlanSeal holder={seal} className="text-xl" />
        </div>
        {scopeNote !== null && <p className="text-sm">{scopeNote}</p>}
        <p className="text-sm text-muted-foreground">{customizationNote(plan.customization)}</p>
      </div>
      <PlanUsage plan={plan} />
      <PlanGridTable current={plan.limits.plan} />
    </div>
  );
}

function PlanUsage({
  plan: { limits, usage },
}: Readonly<{ plan: AccountPlanDto }>): React.JSX.Element {
  return (
    <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Mesas como dono</dt>
      <dd className="tabular-nums">
        {campaignsUsageLabel(usage.campaignsOwned, limits.maxCampaigns)}
      </dd>
      <dt className="text-muted-foreground">Armazenamento</dt>
      <dd className="tabular-nums">
        {storageUsageLabel(usage.storageBytes, limits.maxStorageBytes)}
      </dd>
    </dl>
  );
}

// The effective limits are Amigo do Dono's for the plan itself, for the Dono do Lorkarium and for
// an admin, whatever the plan; the reason follows the seal's order.
function noPlanLimitNote(plan: AccountPlanDto, account: PlanSectionAccount): string | null {
  if (plan.limits.plan !== 'amigo_do_dono') return null;
  if (account.lorkariumOwner)
    return 'Dono do Lorkarium: sem limite de plano, valem só os limites técnicos.';
  if (account.admin)
    return 'Conta de administrador: sem limite de plano, valem só os limites técnicos.';
  return 'Sem limite de plano: valem só os limites técnicos.';
}

function customizationNote(open: boolean): string {
  if (open)
    return 'Personalizações da conta liberadas: cor própria, textura do dado e foto animada.';
  return 'Personalizações da conta (cor própria, textura do dado e foto animada) vêm no Apoiador, no Narrador e na Lenda.';
}

function PlanLoadAlert({ failure }: Readonly<{ failure: AccountLoadFailure }>): React.JSX.Element {
  const revalidator = useRevalidator();
  const loading = revalidator.state === 'loading';
  return (
    <Alert variant="destructive" className="flex flex-col items-start gap-3 px-3.5 py-3 text-sm">
      <p>{failureText(failure)}</p>
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void revalidator.revalidate()}
      >
        Tentar de novo
      </Button>
    </Alert>
  );
}

function failureText(failure: AccountLoadFailure): string {
  if (failure.kind === 'offline') return 'Sem conexão. Seu plano aparece quando a internet voltar.';
  return 'Não deu para carregar seu plano.';
}
