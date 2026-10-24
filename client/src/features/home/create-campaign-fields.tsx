import { CAMPAIGN_DESCRIPTION_MAX_LENGTH, type CampaignStatusDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_HINT,
  CAMPAIGN_STATUS_LABEL,
  statusToneClass,
} from '@/lib/campaign-status';
import { cn } from '@/lib/utils';
import { SYSTEM_SUGGESTIONS } from './create-campaign-messages';
import type { CreateFieldBinding } from './use-create-campaign-form';

const STATUS_OPTIONS: readonly SegmentOption<CampaignStatusDto>[] = CAMPAIGN_STATUSES.map(
  (status) => ({
    value: status,
    label: CAMPAIGN_STATUS_LABEL[status],
    mark: (
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full bg-current', statusToneClass(status))}
      />
    ),
  }),
);

function describedBy(binding: CreateFieldBinding): string | undefined {
  return binding.error ? `${binding.id}-error` : undefined;
}

type TextControl = Readonly<{
  id: string;
  value: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}>;

function controlOf(binding: CreateFieldBinding): TextControl {
  return {
    id: binding.id,
    value: binding.value,
    'aria-invalid': binding.error !== undefined,
    'aria-describedby': describedBy(binding),
  };
}

type BindingProps = Readonly<{ binding: CreateFieldBinding }>;

/** "Nome da mesa": the one required field.
 *
 *  Example: `<CampaignNameField binding={bind('name')} />` */
export function CampaignNameField({ binding }: BindingProps): React.JSX.Element {
  return (
    <FormField id={binding.id} label="Nome da mesa" error={binding.error}>
      <Input
        {...controlOf(binding)}
        placeholder="Os Sinos de Vharn"
        onChange={(event) => binding.onValueChange(event.target.value)}
      />
    </FormField>
  );
}

/** "Sistema": typed, or one of the suggestions (a toggle: clicking the chosen one clears it).
 *
 *  Example: `<CampaignSystemField binding={bind('system')} />` */
export function CampaignSystemField({ binding }: BindingProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <FormField id={binding.id} label="Sistema (opcional)" error={binding.error}>
        <Input
          {...controlOf(binding)}
          placeholder="Qual sistema vocês vão jogar?"
          onChange={(event) => binding.onValueChange(event.target.value)}
        />
      </FormField>
      <div role="group" aria-label="Sugestões de sistema" className="flex flex-wrap gap-1.5">
        {SYSTEM_SUGGESTIONS.map((system) => (
          <SystemSuggestion key={system} system={system} binding={binding} />
        ))}
      </div>
    </div>
  );
}

function SystemSuggestion({
  system,
  binding,
}: BindingProps & Readonly<{ system: string }>): React.JSX.Element {
  const chosen = binding.value === system;
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={() => binding.onValueChange(chosen ? '' : system)}
      className="h-8 rounded-md border border-input px-3 text-xs font-medium text-muted-foreground outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-muted aria-pressed:text-foreground motion-reduce:transition-none"
    >
      {system}
    </button>
  );
}

type CampaignStatusFieldProps = Readonly<{
  value: CampaignStatusDto;
  onChange: (status: CampaignStatusDto) => void;
}>;

/** "Status": the 4 statuses of the contract as segments, the line under says what the chosen one
 *  tells the players.
 *
 *  Example: `<CampaignStatusField value={values.status} onChange={(status) => change({ status })} />` */
export function CampaignStatusField({
  value,
  onChange,
}: CampaignStatusFieldProps): React.JSX.Element {
  return (
    <SegmentField
      legend="Status"
      value={value}
      options={STATUS_OPTIONS}
      onChange={onChange}
      hint={CAMPAIGN_STATUS_HINT[value]}
    />
  );
}

/** "Sobre a mesa", with the count against the contract's limit.
 *
 *  Example: `<CampaignAboutField binding={bind('description')} />` */
export function CampaignAboutField({ binding }: BindingProps): React.JSX.Element {
  return (
    <FormField
      id={binding.id}
      label="Sobre a mesa (opcional)"
      error={binding.error}
      hint={`${binding.value.length}/${CAMPAIGN_DESCRIPTION_MAX_LENGTH}`}
    >
      <Textarea
        {...controlOf(binding)}
        placeholder="O clima da campanha, quando joga, o que esperar…"
        onChange={(event) => binding.onValueChange(event.target.value)}
      />
    </FormField>
  );
}

type CampaignPasswordFieldProps = BindingProps &
  Readonly<{ enabled: boolean; onEnabledChange: (enabled: boolean) => void }>;

/** "Pedir senha para entrar": a switch; on, the password field shows up already focused.
 *
 *  Example: `<CampaignPasswordField binding={bind('password')} enabled={on} onEnabledChange={setOn} />` */
export function CampaignPasswordField(props: CampaignPasswordFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-input p-3.5">
      <PasswordSwitchRow enabled={props.enabled} onEnabledChange={props.onEnabledChange} />
      {props.enabled && <PasswordInput binding={props.binding} />}
    </div>
  );
}

function PasswordSwitchRow(props: Omit<CampaignPasswordFieldProps, 'binding'>): React.JSX.Element {
  const switchId = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={switchId} className="text-sm text-foreground">
          Pedir senha para entrar
        </label>
        <span id={`${switchId}-hint`} className="text-[13px] text-muted-foreground">
          Além do código. Útil quando o código circula fora do grupo.
        </span>
      </div>
      <Switch
        id={switchId}
        checked={props.enabled}
        onCheckedChange={props.onEnabledChange}
        aria-describedby={`${switchId}-hint`}
      />
    </div>
  );
}

function PasswordInput({ binding }: BindingProps): React.JSX.Element {
  return (
    <FormField id={binding.id} label="Senha da mesa" error={binding.error}>
      <PasswordField
        id={binding.id}
        autoComplete="new-password"
        autoFocus
        value={binding.value}
        onValueChange={binding.onValueChange}
        invalid={binding.error !== undefined}
        describedBy={describedBy(binding)}
      />
    </FormField>
  );
}
