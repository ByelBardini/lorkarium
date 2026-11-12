import { Check, Sparkles } from 'lucide-react';
import { useId } from 'react';
import { PLAN_SEAL_ICONS } from '@/components/plan-seal-icon-map';
import { memberColorCss } from '@/lib/member-color';
import type { PlanSealHolder } from '@/lib/plan-seal';
import { cn } from '@/lib/utils';
import { PLAN_AMOUNT_ROWS, PLAN_FEATURE_ROWS, type PlanGridRow } from './plan-grid';
import { planGain, planGridColumns, type PlanGridColumn } from './plan-grid-columns';

/** The grid of the plans side by side, the account's own column marked "Seu plano"
 *  (`aria-current`): the marks on top, the numbers below with the gain over the plan before.
 *
 *  Example: `<PlanGridTable holder={{ plan: 'free', admin: false, lorkariumOwner: false }} />` */
export function PlanGridTable({ holder }: Readonly<{ holder: PlanSealHolder }>): React.JSX.Element {
  const titleId = useId();
  const columns = planGridColumns(holder);
  return (
    <div className="flex flex-col gap-3">
      <h4 id={titleId} className="font-display text-lg font-semibold">
        Limites por plano
      </h4>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table aria-labelledby={titleId} className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="w-[30%] px-5 py-4 text-left text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                Recurso
              </th>
              {columns.map((column) => (
                <PlanColumnHeader key={column.key} column={column} />
              ))}
            </tr>
          </thead>
          <tbody>
            <PlanRowGroup title="Recursos" rows={PLAN_FEATURE_ROWS} columns={columns} />
            <PlanRowGroup title="Quantidades" rows={PLAN_AMOUNT_ROWS} columns={columns} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

type PlanRowGroupProps = Readonly<{
  title: string;
  rows: readonly PlanGridRow[];
  columns: readonly PlanGridColumn[];
}>;

function PlanRowGroup({ title, rows, columns }: PlanRowGroupProps): React.JSX.Element {
  return (
    <>
      <tr className="border-b border-divider/50 bg-muted/30">
        <th
          scope="colgroup"
          colSpan={columns.length + 1}
          className="px-5 py-2 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          {title}
        </th>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b border-divider/50 hover:bg-muted/40">
          <th scope="row" className="px-5 py-2.5 text-left font-normal">
            {row.label}
          </th>
          {columns.map((column, index) => (
            <td key={column.key} className={cellClass(column.current)}>
              <PlanGridValue text={row.cellOf(column.limits)} gain={gainOf(row, columns, index)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function gainOf(
  row: PlanGridRow,
  columns: readonly PlanGridColumn[],
  index: number,
): string | null {
  const before = columns[index - 1];
  const column = columns[index];
  if (row.amountOf === undefined || before === undefined || column === undefined) return null;
  return planGain(row.amountOf(before.limits), row.amountOf(column.limits));
}

type PlanGridValueProps = Readonly<{ text: string; gain: string | null }>;

const UNBOUNDED_TEXTS: readonly string[] = ['ilimitado', 'sem limite'];

// "sim"/"não" read as a mark at a glance; the word stays for screen readers and search.
function PlanGridValue({ text, gain }: PlanGridValueProps): React.JSX.Element {
  if (text === 'sim')
    return (
      <>
        <Check aria-hidden="true" className="mx-auto size-4 text-primary" />
        <span className="sr-only">sim</span>
      </>
    );
  if (text === 'não')
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground/60">
          —
        </span>
        <span className="sr-only">não</span>
      </>
    );
  if (UNBOUNDED_TEXTS.includes(text)) return <UnboundedValue text={text} />;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {text}
      {gain !== null && <span className="text-[11px] font-semibold text-emerald-400">{gain}</span>}
    </span>
  );
}

function UnboundedValue({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Sparkles aria-hidden="true" className="size-3 text-amber-300" />
      <span className="bg-gradient-to-r from-amber-200 via-yellow-50 to-amber-400 bg-clip-text text-transparent">
        {text}
      </span>
    </span>
  );
}

function PlanColumnHeader({ column }: Readonly<{ column: PlanGridColumn }>): React.JSX.Element {
  return (
    <th
      scope="col"
      aria-current={column.current || undefined}
      className={cellClass(column.current, 'py-4')}
    >
      <span className="flex flex-col items-center gap-1.5">
        <PlanHeaderSymbol column={column} />
        <span className="font-semibold">{column.name}</span>
        {column.current && (
          <span className="text-[10px] font-semibold tracking-[0.12em] text-primary uppercase">
            Seu plano
          </span>
        )}
      </span>
    </th>
  );
}

// Decorative: the column name already says the plan; Grátis keeps an empty slot so names align.
function PlanHeaderSymbol({
  column: { seal },
}: Readonly<{ column: PlanGridColumn }>): React.JSX.Element {
  if (seal === null) return <span aria-hidden="true" className="size-6" />;
  const Icon = PLAN_SEAL_ICONS[seal.kind];
  return (
    <span aria-hidden="true" style={{ color: memberColorCss(seal.color) }}>
      <Icon className="size-6" />
    </span>
  );
}

function cellClass(current: boolean, extra = 'py-2.5'): string {
  return cn(
    'border-l border-divider/50 px-3 text-center align-middle tabular-nums',
    extra,
    current && 'bg-primary/10',
  );
}
