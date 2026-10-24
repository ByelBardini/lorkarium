import type { CombatDto, CombatEntryInput, SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { ChevronLeftIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  NO_PREP_CHOICES,
  blankSummaryOf,
  prepPlanOf,
  prepSectionsOf,
  prepSummaryOf,
  prepTokenIdsOf,
  withChecked,
  withInitiative,
  type PrepChoices,
  type PrepSection,
} from '@/lib/combat-prep';
import { PrepGroupRow } from './prep-group-row';
import { PrepTokenRow } from './prep-token-row';

export type CombatPrepMode = 'start' | 'add';

export type CombatPrepProps = Readonly<{
  /** `start`: "Quem entra na briga?"; `add`: only the tokens out of the running combat. */
  mode: CombatPrepMode;
  /** The tokens this viewer sees (the master sees all). */
  tokens: readonly TokenDto[];
  combat: CombatDto | null;
  members: readonly SessionMemberDto[];
  /** Disconnected: everything stays editable but the confirm button. */
  readOnly: boolean;
  onSubmit: (entries: readonly CombatEntryInput[]) => void;
  onCancel: () => void;
}>;

const COPY = {
  start: {
    title: 'Quem entra na briga?',
    back: 'Voltar sem iniciar',
    submit: 'Começar combate',
    hint: 'Desmarque quem fica de fora. Iniciativa em branco entra no fim da ordem.',
  },
  add: {
    title: 'Adicionar ao combate',
    back: 'Voltar sem adicionar',
    submit: 'Adicionar',
    hint: 'Cada um entra na sua vez, pela iniciativa.',
  },
} as const;

/** The preparation in the panel: who enters (all checked), the same creature grouped "Juntos" or
 *  "Cada um", the initiative typed per line, and a fixed footer with how many go in the order.
 *
 *  Example: `<CombatPrep mode="start" tokens={seen} combat={null} members={members} readOnly={false} onSubmit={start} onCancel={close} />` */
export function CombatPrep(props: CombatPrepProps): React.JSX.Element {
  const { tokens, combat } = props;
  const copy = COPY[props.mode];
  const sections = useMemo(() => prepSectionsOf(tokens, combat), [tokens, combat]);
  const [choices, setChoices] = useState<PrepChoices>(NO_PREP_CHOICES);
  const plan = useMemo(() => prepPlanOf(sections, choices), [sections, choices]);
  const blocked = props.readOnly || plan.entries.length === 0 || plan.invalidNames.length > 0;
  return (
    <section aria-label={copy.title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={copy.back}
            onClick={props.onCancel}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <h2 className="font-display text-2xl font-semibold">{copy.title}</h2>
        </div>
        <p className="text-[13px] text-muted-foreground">{copy.hint}</p>
        <AllToggle sections={sections} choices={choices} onChoicesChange={setChoices} />
      </header>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {sections.map((section) => (
          <PrepSectionList
            key={section.title}
            section={section}
            members={props.members}
            choices={choices}
            onChoicesChange={setChoices}
          />
        ))}
      </div>
      <footer className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="flex flex-col text-[13px]">
          <span className="text-label">{prepSummaryOf(plan)}</span>
          <PrepWarning blank={blankSummaryOf(plan)} invalid={plan.invalidNames} />
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={props.onCancel}>
            Cancelar
          </Button>
          <Button type="button" disabled={blocked} onClick={() => props.onSubmit(plan.entries)}>
            {copy.submit}
          </Button>
        </div>
      </footer>
    </section>
  );
}

type ChoicesProps = Readonly<{
  sections: readonly PrepSection[];
  choices: PrepChoices;
  onChoicesChange: (choices: PrepChoices) => void;
}>;

function AllToggle({ sections, choices, onChoicesChange }: ChoicesProps) {
  const ids = prepTokenIdsOf(sections);
  const all = choices.unchecked.length === 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-fit"
      onClick={() => onChoicesChange(withChecked(choices, ids, !all))}
    >
      {all ? 'Desmarcar todos' : 'Marcar todos'}
    </Button>
  );
}

type PrepSectionListProps = Readonly<{
  section: PrepSection;
  members: readonly SessionMemberDto[];
  choices: PrepChoices;
  onChoicesChange: (choices: PrepChoices) => void;
}>;

function PrepSectionList({ section, members, choices, onChoicesChange }: PrepSectionListProps) {
  return (
    <div className="flex flex-col">
      <h3 className="pt-3 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {section.title}
      </h3>
      <ul aria-label={section.title} className="flex flex-col">
        {section.items.map((item) =>
          item.kind === 'group' ? (
            <PrepGroupRow
              key={item.key}
              group={item}
              members={members}
              choices={choices}
              onChoicesChange={onChoicesChange}
            />
          ) : (
            <PrepTokenRow
              key={item.token.id}
              token={item.token}
              members={members}
              checked={!choices.unchecked.includes(item.token.id)}
              onCheckedChange={(on) => onChoicesChange(withChecked(choices, [item.token.id], on))}
              initiative={choices.initiatives[item.token.id] ?? ''}
              onInitiativeChange={(text) =>
                onChoicesChange(withInitiative(choices, item.token.id, text))
              }
            />
          ),
        )}
      </ul>
    </div>
  );
}

function PrepWarning({
  blank,
  invalid,
}: Readonly<{ blank: string | null; invalid: readonly string[] }>) {
  if (invalid.length > 0) {
    return (
      <span className="text-destructive-text">{`Iniciativa inválida em ${invalid.join(', ')}.`}</span>
    );
  }
  return blank ? <span className="text-muted-foreground">{blank}</span> : null;
}
