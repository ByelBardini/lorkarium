import type { ConditionDefinitionDto, ConditionLookDto } from '@lorkarium/contracts';
import { paletteColorAt } from '@/lib/condition-colors';
import { CONDITION_TONE_GROUPS } from '@/lib/condition-names';
import { cn } from '@/lib/utils';
import { ConditionMark } from '@/features/combat/condition-marks';

export type ConditionCardGridProps = Readonly<{
  /** Already filtered and in list order (`conditionsInListOrder`). */
  shown: readonly ConditionDefinitionDto[];
  /** The whole list: an empty table says so; an empty search, something else. */
  total: number;
  onOpen: (definition: ConditionDefinitionDto) => void;
}>;

const LOOK_TEXT: Readonly<Record<ConditionLookDto, string>> = {
  invisible: 'Translúcido no token',
  unconscious: 'Desacordado no token',
};

// The tone reads at a glance on the card's left edge, as on the condition tag.
const TONE_EDGE: Readonly<Record<ConditionDefinitionDto['tone'], string>> = {
  benefit: 'border-l-primary/60',
  harm: 'border-l-destructive/60',
  incapacitating: 'border-l-destructive',
};

/** The table's conditions as cards filling the page width, one grid per nature: mark and name,
 *  what else it does (look on the token, "até ×N" when it stacks) and the start of its
 *  description. A card opens the condition's editor.
 *
 *  Example: `<ConditionCardGrid shown={shown} total={definitions.length} onOpen={open} />` */
export function ConditionCardGrid(props: ConditionCardGridProps): React.JSX.Element {
  if (props.total === 0) return <EmptyText text="A mesa não tem condições." />;
  if (props.shown.length === 0) return <EmptyText text="Nenhuma condição com esse nome." />;
  return (
    <div className="flex flex-col gap-8">
      {CONDITION_TONE_GROUPS.map(({ tone, title }) => {
        const members = props.shown.filter((definition) => definition.tone === tone);
        if (members.length === 0) return null;
        return <ToneGrid key={tone} title={title} members={members} onOpen={props.onOpen} />;
      })}
    </div>
  );
}

function EmptyText({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

type ToneGridProps = Readonly<{
  title: string;
  members: readonly ConditionDefinitionDto[];
  onOpen: (definition: ConditionDefinitionDto) => void;
}>;

function ToneGrid({ title, members, onOpen }: ToneGridProps): React.JSX.Element {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        {title} <span className="tabular-nums">· {members.length}</span>
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
        {members.map((definition) => (
          <li key={definition.id} className="flex">
            <ConditionCard definition={definition} onOpen={() => onOpen(definition)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type ConditionCardProps = Readonly<{ definition: ConditionDefinitionDto; onOpen: () => void }>;

function ConditionCard({ definition, onOpen }: ConditionCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={`Editar ${definition.name}`}
      onClick={onOpen}
      className={cn(
        'group flex min-h-28 w-full flex-col gap-2 border border-l-2 border-border bg-card p-4 text-left',
        'outline-offset-2 hover:border-input focus-visible:outline-2 focus-visible:outline-ring',
        definition.color === null && TONE_EDGE[definition.tone],
      )}
      style={edgeStyleOf(definition)}
    >
      <span className="flex items-center gap-2.5">
        <ConditionMark
          icon={definition.icon}
          tone={definition.tone}
          color={definition.color}
          imageAssetId={definition.imageAssetId}
        />
        <span className="truncate font-display text-lg text-foreground group-hover:text-primary">
          {definition.name}
        </span>
      </span>
      <CardTraits definition={definition} />
      <CardDescription description={definition.description} />
    </button>
  );
}

// The master's color takes the edge over the tone, at the same strength the tone uses.
function edgeStyleOf({ color, tone }: ConditionDefinitionDto): React.CSSProperties | undefined {
  if (color === null) return undefined;
  return { borderLeftColor: paletteColorAt(color, tone === 'incapacitating' ? 1 : 0.6) };
}

function CardTraits({ definition }: Readonly<{ definition: ConditionDefinitionDto }>) {
  const traits = [
    definition.look ? LOOK_TEXT[definition.look] : null,
    definition.maxStacks === null ? null : `Acumula até ×${definition.maxStacks}`,
  ].filter((trait): trait is string => trait !== null);
  if (traits.length === 0) return null;
  return (
    <span className="text-[11px] tracking-[0.08em] text-label uppercase">{traits.join(' · ')}</span>
  );
}

function CardDescription({ description }: Readonly<{ description: string }>) {
  if (description === '') {
    return <span className="text-[13px] text-placeholder italic">Sem descrição</span>;
  }
  return <span className="line-clamp-3 text-[13px] text-muted-foreground">{description}</span>;
}
