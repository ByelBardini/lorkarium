import { PLAN_SEAL_ICONS } from '@/components/plan-seal-icon-map';
import { memberColorCss } from '@/lib/member-color';
import { planSealOf, type PlanSealHolder } from '@/lib/plan-seal';

/** The person's seal drawn large and faint over the right half of the card; nothing for Grátis.
 *  Decorative: the seal is already named beside the @.
 *
 *  Example: `<ProfileCardSealWatermark holder={card} />` */
export function ProfileCardSealWatermark({
  holder,
}: Readonly<{ holder: PlanSealHolder }>): React.JSX.Element | null {
  const seal = planSealOf(holder);
  if (seal === null) return null;
  const Icon = PLAN_SEAL_ICONS[seal.kind];
  return (
    <span
      aria-hidden="true"
      data-testid="seal-watermark"
      data-seal={seal.kind}
      style={{ color: memberColorCss(seal.color) }}
      className="pointer-events-none absolute top-[18%] -right-[8%] -z-10 aspect-square w-[62%] opacity-[0.07]"
    >
      <Icon className="size-full [stroke-width:1]" />
    </span>
  );
}
