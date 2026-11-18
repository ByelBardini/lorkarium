import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BillingStatusView, BillingTone } from './billing-admin-view';

const TONE_CLASSES: Readonly<Record<BillingTone, string>> = {
  success: 'text-chart-4',
  waiting: 'text-chart-2',
  problem: 'text-destructive-text',
  past: 'text-muted-foreground',
};

export const BILLING_TABLE_HEAD =
  'px-2 pb-2 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-placeholder uppercase first:pl-0 last:pr-0';
export const BILLING_TABLE_CELL =
  'px-2 py-3 align-middle text-sm whitespace-nowrap first:pl-0 last:pr-0';

/** A billing status as a dot and its label in spaced caps, both in the tone; the label always
 *  says it, the color never alone (the `StatusBadge` of the campaigns, for payments).
 *
 *  Example: `<BillingStatusMark view={paymentStatusViewOf('approved')} />` */
export function BillingStatusMark({ view }: Readonly<{ view: BillingStatusView }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase',
        TONE_CLASSES[view.tone],
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {view.label}
    </span>
  );
}

type AttemptsToggleProps = Readonly<{
  count: number;
  open: boolean;
  onToggle: () => void;
}>;

/** "Mostrar 4 tentativas não concluídas": the attempts that moved no money, folded by default.
 *
 *  Example: `<AttemptsToggle count={4} open={open} onToggle={() => setOpen(!open)} />` */
export function AttemptsToggle({ count, open, onToggle }: AttemptsToggleProps) {
  if (count === 0) return null;
  const noun = count === 1 ? 'tentativa não concluída' : 'tentativas não concluídas';
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-expanded={open}
      className="self-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      onClick={onToggle}
    >
      <ChevronDownIcon
        aria-hidden="true"
        className={cn('transition-transform', open && 'rotate-180')}
      />
      {open ? 'Ocultar' : 'Mostrar'} {count} {noun}
    </Button>
  );
}
