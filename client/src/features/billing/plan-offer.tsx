import { USER_PLANS } from '@lorkarium/contracts';
import { useId } from 'react';
import { BrandIcon } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { PLAN_SEAL_ICONS } from '@/components/plan-seal-icon-map';
import { memberColorCss } from '@/lib/member-color';
import { isAbovePlans, PLAN_NAMES, planSealOf, type PlanSealHolder } from '@/lib/plan-seal';
import { cn } from '@/lib/utils';
import type { OfferPrice } from './offer-price';
import { planHighlightsOf, type OfferedPlan } from './plan-highlights';

export type PlanOfferProps = Readonly<{
  plan: OfferedPlan;
  /** Null on Grátis (no price) or a plan missing from the catalog. */
  price: OfferPrice | null;
  /** Who looks: the higher of the admin's and the paid plan, and whether admin or Dono. */
  holder: PlanSealHolder;
  busy: boolean;
  onSubscribe: (price: OfferPrice) => void;
}>;

const PLAN_PITCH: Readonly<Record<OfferedPlan, string>> = {
  free: 'Para conhecer a mesa e jogar com um grupo pequeno. Toda conta começa aqui.',
  apoiador:
    'Apoia a casa e libera a personalização da sua conta e mais rolagens salvas. As mesas seguem o Grátis.',
  narrador: 'Mais mesas, mais espaço e os efeitos para contar histórias maiores.',
  lenda: 'Tudo o que o Lorkarium oferece, em escala épica.',
};

// The plan for whoever runs tables: the one the page leads with.
const HIGHLIGHTED: OfferedPlan = 'narrador';

/** One plan on "Planos": its seal, name, pitch, price in the chosen period and method, the action
 *  and what it promises. The account's own plan is marked and cannot be bought again.
 *
 *  Example: `<PlanOffer plan="lenda" price={offer} holder={holder} busy={false} onSubscribe={open} />` */
export function PlanOffer(props: PlanOfferProps): React.JSX.Element {
  const titleId = useId();
  const { plan } = props;
  const highlighted = plan === HIGHLIGHTED;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'relative flex flex-col gap-5 bg-card p-6',
        highlighted && 'z-10 bg-primary/5 outline-1 -outline-offset-1 outline-primary',
      )}
    >
      {highlighted && (
        <span className="absolute top-0 right-5 inline-flex h-6 items-center rounded-b-sm bg-primary px-2.5 text-[11px] font-bold tracking-wide text-primary-foreground">
          Para quem mestra
        </span>
      )}
      <div className="flex items-center gap-3">
        <OfferSeal plan={plan} />
        <h2 id={titleId} className="font-display text-[28px] leading-none font-semibold">
          {PLAN_NAMES[plan]}
        </h2>
      </div>
      <p className="min-h-[3.2em] text-sm leading-relaxed text-muted-foreground">
        {PLAN_PITCH[plan]}
      </p>
      <OfferPriceBlock price={props.price} free={plan === 'free'} />
      <OfferAction {...props} highlighted={highlighted} />
      <ul className="flex flex-col gap-2.5 border-t border-border pt-5">
        {planHighlightsOf(plan).map((line) => (
          <li key={line} className="flex gap-2.5 text-[13px] leading-snug text-label">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-primary" />
            {line}
          </li>
        ))}
      </ul>
    </article>
  );
}

function OfferSeal({ plan }: Readonly<{ plan: OfferedPlan }>): React.JSX.Element {
  const seal = plan === 'free' ? null : planSealOf({ plan, admin: false, lorkariumOwner: false });
  if (seal === null) return <BrandIcon className="size-8 shrink-0 opacity-40 grayscale" />;
  const Icon = PLAN_SEAL_ICONS[seal.kind];
  return (
    <span role="img" aria-label={seal.accessibleName} style={{ color: memberColorCss(seal.color) }}>
      <Icon className="size-8" />
    </span>
  );
}

type OfferPriceBlockProps = Readonly<{ price: OfferPrice | null; free: boolean }>;

function OfferPriceBlock({ price, free }: OfferPriceBlockProps): React.JSX.Element {
  if (free || price === null) {
    return (
      <div className="flex min-h-[98px] flex-col gap-1">
        <span className="min-h-5 text-[13px] text-muted-foreground">Sem custo</span>
        <PriceNumber reais="0" cents="" per="para sempre" />
        <span className="text-xs text-muted-foreground">Sem cartão e sem prazo.</span>
      </div>
    );
  }
  return (
    <div className="flex min-h-[98px] flex-col gap-1">
      <span className="min-h-5 text-[13px] text-muted-foreground line-through">{price.was}</span>
      <PriceNumber reais={price.reais} cents={price.cents} per="/mês" />
      <span className="text-xs leading-snug text-muted-foreground">
        {price.billed}
        {price.saving && <span className="text-primary"> · economiza {price.saving}</span>}
      </span>
    </div>
  );
}

type PriceNumberProps = Readonly<{ reais: string; cents: string; per: string }>;

function PriceNumber({ reais, cents, per }: PriceNumberProps): React.JSX.Element {
  return (
    <p className="flex items-baseline">
      <span className="mr-1.5 text-base font-semibold text-muted-foreground">R$</span>
      <span className="font-display text-[52px] leading-[0.9] font-semibold lining-nums">
        {reais}
      </span>
      <span className="text-lg font-bold">{cents}</span>
      <span className="ml-1 text-sm text-muted-foreground">{per}</span>
    </p>
  );
}

type OfferActionProps = PlanOfferProps & Readonly<{ highlighted: boolean }>;

type OfferStanding = 'current' | 'included' | 'upgrade' | 'new';

// Only a plan above the account's own is on sale: the effective plan never goes down by buying.
function standingOf(plan: OfferedPlan, holder: PlanSealHolder): OfferStanding {
  if (isAbovePlans(holder)) return 'included';
  const offered = USER_PLANS.indexOf(plan);
  const own = USER_PLANS.indexOf(holder.plan);
  if (offered === own) return 'current';
  if (offered < own) return 'included';
  return holder.plan === 'free' ? 'new' : 'upgrade';
}

function OfferAction({ plan, price, holder, busy, onSubscribe, highlighted }: OfferActionProps) {
  const standing = standingOf(plan, holder);
  if (standing === 'current' || standing === 'included') {
    return (
      <Button variant="outline" size="xl" disabled>
        {standing === 'current' ? 'Seu plano atual' : 'Incluído no seu plano'}
      </Button>
    );
  }
  if (price === null) return <div className="h-[50px]" aria-hidden="true" />;
  return (
    <Button
      variant={highlighted || standing === 'upgrade' ? 'default' : 'outline'}
      size="xl"
      disabled={busy}
      onClick={() => onSubscribe(price)}
    >
      {standing === 'upgrade' ? 'Fazer upgrade para' : 'Assinar'} {PLAN_NAMES[plan]}
    </Button>
  );
}
