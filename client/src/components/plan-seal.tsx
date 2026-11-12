import { memberColorCss } from '@/lib/member-color';
import { planSealOf, type PlanSealHolder } from '@/lib/plan-seal';
import { cn } from '@/lib/utils';
import { PLAN_SEAL_ICONS } from './plan-seal-icon-map';

export type PlanSealProps = Readonly<{ holder: PlanSealHolder; className?: string }>;

/** A person's one seal as a symbol only, in the seal's color (inline: Tailwind builds no dynamic
 *  class) and as tall as the text around it; named in words for screen readers and in the
 *  `title` for the mouse ("Plano Lenda", "Administrador"). Nothing for Grátis without the mark.
 *
 *  Example: `<PlanSeal holder={member} />` */
export function PlanSeal({ holder, className }: PlanSealProps): React.JSX.Element | null {
  const seal = planSealOf(holder);
  if (seal === null) return null;
  const Icon = PLAN_SEAL_ICONS[seal.kind];
  return (
    <span
      data-seal={seal.kind}
      role="img"
      aria-label={seal.accessibleName}
      title={seal.accessibleName}
      style={{ color: memberColorCss(seal.color) }}
      className={cn('inline-flex shrink-0 self-center', className)}
    >
      <Icon className="size-[1.05em]" />
    </span>
  );
}
