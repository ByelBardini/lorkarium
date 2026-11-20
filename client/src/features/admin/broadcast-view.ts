import {
  BILLING_PLANS,
  type BillingPlan,
  type MailBroadcastDto,
  type MailBroadcastSegmentDto,
} from '@lorkarium/contracts';
import { PLAN_NAMES } from '@/lib/plan-seal';

const COUNT = new Intl.NumberFormat('pt-BR');
const DATE = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** The `<select>` value of a segment: `all`, `paid` or `plan:<plan>`. */
export type SegmentChoice = 'all' | 'paid' | `plan:${BillingPlan}`;

export const SEGMENT_CHOICES: readonly SegmentChoice[] = [
  'all',
  'paid',
  ...BILLING_PLANS.map((plan) => `plan:${plan}` as const),
];

/** Example: `segmentOf('plan:lenda') // { plan: 'lenda' }` */
export function segmentOf(choice: SegmentChoice): MailBroadcastSegmentDto {
  if (choice === 'all' || choice === 'paid') return choice;
  return { plan: choice.slice('plan:'.length) as BillingPlan };
}

/** Example: `segmentLabel({ plan: 'lenda' }) // 'Quem paga o plano Lenda'` */
export function segmentLabel(segment: MailBroadcastSegmentDto): string {
  if (segment === 'all') return 'Todas as contas ativas';
  if (segment === 'paid') return 'Quem tem plano pago';
  return `Quem paga o plano ${PLAN_NAMES[segment.plan]}`;
}

/** Example: `countText(1240) // '1.240'` */
export function countText(count: number): string {
  return COUNT.format(count);
}

/** Example: `audienceLabel(1300) // 'Vai para 1.300 contas.'` */
export function audienceLabel(audience: number): string {
  return `Vai para ${countText(audience)} ${audience === 1 ? 'conta' : 'contas'}.`;
}

/** The text area split into paragraphs: a blank line ends one; blank paragraphs are dropped.
 *
 *  Example: `paragraphsOf('Um.\n\nDois.') // ['Um.', 'Dois.']` */
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Where a notice stands, for the list: a draft, the progress, or finished.
 *
 *  Example: `progressLabel(sending) // '1.240 de 1.300 enviados · 3 falhas'` */
export function progressLabel(broadcast: MailBroadcastDto): string {
  if (broadcast.confirmedAt === null || broadcast.total === null) return 'Rascunho, não enviado';
  const parts = [`${countText(broadcast.sent)} de ${countText(broadcast.total)} enviados`];
  if (broadcast.failed > 0) parts.push(plural(broadcast.failed, 'falha', 'falhas'));
  if (broadcast.skipped > 0)
    parts.push(plural(broadcast.skipped, 'conta excluída', 'contas excluídas'));
  return parts.join(' · ');
}

/** Example: `stateLabel(finished) // 'Concluído em 19/11/2026'` */
export function stateLabel(broadcast: MailBroadcastDto): string {
  if (broadcast.finishedAt) return `Concluído em ${DATE.format(new Date(broadcast.finishedAt))}`;
  if (broadcast.confirmedAt) return 'Enviando';
  return 'Rascunho';
}

function plural(count: number, one: string, many: string): string {
  return `${countText(count)} ${count === 1 ? one : many}`;
}
