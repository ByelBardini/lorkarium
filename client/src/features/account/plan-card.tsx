import type { UserPlan } from '@lorkarium/contracts';
import { BrandIcon } from '@/components/brand-mark';
import { PLAN_SEAL_ICONS } from '@/components/plan-seal-icon-map';
import { memberColorCss } from '@/lib/member-color';
import { PLAN_NAMES, planSealOf, type PlanSealHolder } from '@/lib/plan-seal';

export type PlanCardProps = Readonly<{ holder: PlanSealHolder }>;

const PLAN_MESSAGES: Readonly<Record<UserPlan, string>> = {
  free: 'Você joga com o essencial do Lorkarium. Quer mesas maiores? Compare os planos abaixo.',
  apoiador: 'Obrigado por apoiar o Lorkarium! É graças a você que a mesa continua de pé.',
  narrador: 'Mais mesas, mais espaço e efeitos para contar histórias maiores.',
  lenda: 'Sua lenda não cabe em limites pequenos: tudo o que o Lorkarium oferece, em escala épica.',
  amigo_do_dono: 'Amigo da casa: suas mesas não têm limite de plano.',
};

const OWNER_MESSAGE = 'A casa é sua: sem limite de plano, valem só os limites técnicos.';
const ADMIN_MESSAGE = 'Conta de administrador: sem limite de plano, valem só os limites técnicos.';

// The Dono and an admin see who they are, never the stored plan (it gives them no limit).
function headlineOf(holder: PlanSealHolder): Readonly<{ title: string; message: string }> {
  if (holder.lorkariumOwner) return { title: 'Dono do Lorkarium', message: OWNER_MESSAGE };
  if (holder.admin) return { title: 'Administrador', message: ADMIN_MESSAGE };
  return { title: PLAN_NAMES[holder.plan], message: PLAN_MESSAGES[holder.plan] };
}

/** The headline card of "Seu plano": the big seal, the plan's name in its color and the plan's
 *  own sentence. The Dono do Lorkarium and an admin see who they are, never the stored plan.
 *
 *  Example: `<PlanCard holder={{ plan: 'lenda', admin: false, lorkariumOwner: false }} />` */
export function PlanCard({ holder }: PlanCardProps): React.JSX.Element {
  const seal = planSealOf(holder);
  const { title, message } = headlineOf(holder);
  const color = seal === null ? undefined : memberColorCss(seal.color);
  return (
    <div className="flex items-center gap-7 rounded-xl border border-border bg-card px-8 py-7">
      <PlanCardSymbol holder={holder} color={color} />
      <div className="flex min-w-0 flex-col gap-2">
        <h3
          className="font-display text-5xl font-semibold tracking-wide uppercase"
          style={{ color }}
        >
          {title}
        </h3>
        <p className="text-base text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

type PlanCardSymbolProps = Readonly<{ holder: PlanSealHolder; color: string | undefined }>;

// Grátis has no seal: the logo's crystal stands in, muted, so the card keeps its shape.
function PlanCardSymbol({ holder, color }: PlanCardSymbolProps): React.JSX.Element {
  const seal = planSealOf(holder);
  if (seal === null) return <BrandIcon className="size-24 shrink-0 opacity-40 grayscale" />;
  const Icon = PLAN_SEAL_ICONS[seal.kind];
  return (
    <span role="img" aria-label={seal.accessibleName} title={seal.accessibleName} style={{ color }}>
      <Icon className="size-24" />
    </span>
  );
}
