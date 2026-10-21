import type { SessionMemberDto } from '@lorkarium/contracts';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Checkbox } from '@/components/ui/checkbox';
import {
  groupInitiativeKey,
  withChecked,
  withInitiative,
  withSplit,
  type PrepChoices,
  type PrepItem,
} from '@/lib/combat-prep';
import { cn } from '@/lib/utils';
import { TokenAvatar } from '@/features/tokens/token-avatar';
import { PrepInitiativeField } from './prep-initiative-field';
import { PrepTokenRow } from './prep-token-row';

type Acting = 'together' | 'each';

const ACTING: readonly SegmentOption<Acting>[] = [
  { value: 'together', label: 'Juntos' },
  { value: 'each', label: 'Cada um' },
];

export type PrepGroupRowProps = Readonly<{
  group: Extract<PrepItem, { kind: 'group' }>;
  members: readonly SessionMemberDto[];
  choices: PrepChoices;
  onChoicesChange: (choices: PrepChoices) => void;
}>;

/** The same creature twice or more ("Bandido ×6"): one checkbox for all (mixed when only some are
 *  in), "Juntos" (one initiative, one turn) or "Cada um" (each member below, with its own).
 *
 *  Example: `<PrepGroupRow group={bandits} members={members} choices={choices} onChoicesChange={set} />` */
export function PrepGroupRow({ group, members, choices, onChoicesChange }: PrepGroupRowProps) {
  const ids = group.tokens.map(({ id }) => id);
  const inCount = ids.filter((id) => !choices.unchecked.includes(id)).length;
  const each = choices.split.includes(group.key);
  const [first] = group.tokens;
  const togetherKey = groupInitiativeKey(group.key);
  return (
    <li className="flex flex-col">
      <div className={cn('flex items-center gap-3 py-2', inCount === 0 && 'opacity-50')}>
        <Checkbox
          aria-label={`Incluir o grupo ${group.label}`}
          checked={checkedStateOf(inCount, ids.length)}
          onCheckedChange={() => onChoicesChange(withChecked(choices, ids, inCount === 0))}
        />
        {first && <TokenAvatar token={first} />}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold">
            {group.label}
            <span className="ml-1.5 font-normal text-muted-foreground">{`×${ids.length}`}</span>
          </span>
          <span className="text-xs text-muted-foreground">{`${inCount} de ${ids.length} marcados`}</span>
          <SegmentField
            compact
            legend={`Iniciativa de ${group.label}`}
            value={each ? 'each' : 'together'}
            options={ACTING}
            onChange={(acting) => onChoicesChange(withSplit(choices, group.key, acting === 'each'))}
          />
        </span>
        {!each && (
          <PrepInitiativeField
            name={group.label}
            text={choices.initiatives[togetherKey] ?? ''}
            onChange={(text) => onChoicesChange(withInitiative(choices, togetherKey, text))}
          />
        )}
      </div>
      {each && (
        <ul aria-label={`Membros de ${group.label}`} className="flex flex-col">
          {group.tokens.map((token) => (
            <PrepTokenRow
              key={token.id}
              member
              token={token}
              members={members}
              checked={!choices.unchecked.includes(token.id)}
              onCheckedChange={(on) => onChoicesChange(withChecked(choices, [token.id], on))}
              initiative={choices.initiatives[token.id] ?? ''}
              onInitiativeChange={(text) =>
                onChoicesChange(withInitiative(choices, token.id, text))
              }
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function checkedStateOf(inCount: number, total: number): boolean | 'indeterminate' {
  if (inCount === 0) return false;
  return inCount === total ? true : 'indeterminate';
}
