import type { CampaignStatusDto } from '@lorkarium/contracts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABEL } from '@/lib/campaign-status';
import type { ExploreSearch, ExploreVisibilityFilter } from './explore-filters';

export type ExploreFilterFieldsProps = Readonly<{
  search: ExploreSearch;
  onSearch: (search: ExploreSearch) => void;
  readerIsAdmin: boolean;
}>;

type Choice<T extends string> = Readonly<{ value: T; label: string }>;

const STATUS_CHOICES: readonly Choice<CampaignStatusDto | 'all'>[] = [
  { value: 'all', label: 'Todos' },
  ...CAMPAIGN_STATUSES.map((status) => ({ value: status, label: CAMPAIGN_STATUS_LABEL[status] })),
];

const VISIBILITY_CHOICES: readonly Choice<ExploreVisibilityFilter>[] = [
  { value: 'all', label: 'Todas' },
  { value: 'public', label: 'Públicas' },
  { value: 'private', label: 'Privadas' },
];

/** The fields of the "Filtros" panel: status, who is online and, for an admin, the visibility.
 *  They change the draft only; "Pesquisar" applies it.
 *
 *  Example: `<ExploreFilterFields search={draft} onSearch={setDraft} readerIsAdmin />` */
export function ExploreFilterFields(props: ExploreFilterFieldsProps): React.JSX.Element {
  const { search, onSearch } = props;
  return (
    <div className="flex flex-col gap-4">
      <ChoiceGroup
        legend="Status"
        choices={STATUS_CHOICES}
        value={search.status}
        onValue={(status) => onSearch({ ...search, status })}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className={LEGEND_CLASS}>Online</legend>
        <CheckRow
          id="explore-master-online"
          label="Com mestre online"
          checked={search.masterOnline}
          onChecked={(masterOnline) => onSearch({ ...search, masterOnline })}
        />
        <CheckRow
          id="explore-players-online"
          label="Com jogadores online"
          checked={search.playersOnline}
          onChecked={(playersOnline) => onSearch({ ...search, playersOnline })}
        />
      </fieldset>
      {props.readerIsAdmin && (
        <ChoiceGroup
          legend="Visibilidade"
          choices={VISIBILITY_CHOICES}
          value={search.visibility}
          onValue={(visibility) => onSearch({ ...search, visibility })}
        />
      )}
    </div>
  );
}

const LEGEND_CLASS = 'mb-2 text-xs font-semibold tracking-[0.12em] text-label uppercase';

type ChoiceGroupProps<T extends string> = Readonly<{
  legend: string;
  choices: readonly Choice<T>[];
  value: T;
  onValue: (value: T) => void;
}>;

function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>): React.JSX.Element {
  const byValue = (raw: string): T | undefined =>
    props.choices.find((choice) => choice.value === raw)?.value;
  return (
    <fieldset>
      <legend className={LEGEND_CLASS}>{props.legend}</legend>
      <RadioGroup
        value={props.value}
        onValueChange={(raw) => {
          const next = byValue(raw);
          if (next) props.onValue(next);
        }}
        className="grid grid-cols-2 gap-2"
      >
        {props.choices.map((choice) => {
          const id = `explore-${props.legend}-${choice.value}`;
          return (
            <div key={choice.value} className="flex items-center gap-2">
              <RadioGroupItem id={id} value={choice.value} />
              <Label htmlFor={id} className="font-normal">
                {choice.label}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}

type CheckRowProps = Readonly<{
  id: string;
  label: string;
  checked: boolean;
  onChecked: (checked: boolean) => void;
}>;

function CheckRow({ id, label, checked, onChecked }: CheckRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChecked(next === true)} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
