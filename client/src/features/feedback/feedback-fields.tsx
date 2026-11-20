import { FEEDBACK_KINDS, FEEDBACK_PLATFORMS, FEEDBACK_TEXT_MAX_LENGTH } from '@lorkarium/contracts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { FeedbackDraft } from './feedback-draft';
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_PLATFORM_LABEL,
  FEEDBACK_REQUIRED_TEXT,
  FEEDBACK_SECTIONS,
  type FeedbackSection,
} from './feedback-messages';

export type FeedbackFieldsProps = Readonly<{
  idPrefix: string;
  draft: FeedbackDraft;
  /** The field shown as missing after a send, or `null`. */
  missing: string | null;
  onChange: (draft: FeedbackDraft) => void;
}>;

/** The id of a field of the form, for the label and the focus on a missing one.
 *
 *  Example: `feedbackFieldId(':r1:', 'steps') // ':r1:-steps'` */
export function feedbackFieldId(idPrefix: string, key: string): string {
  return `${idPrefix}-${key}`;
}

/** The kind (bug or suggestion), its sections, where it happened and the version.
 *
 *  Example: `<FeedbackFields idPrefix={id} draft={draft} missing={null} onChange={setDraft} />` */
export function FeedbackFields(props: FeedbackFieldsProps): React.JSX.Element {
  const { draft, onChange } = props;
  return (
    <>
      <ChoiceGroup
        legend="O que você quer fazer"
        idPrefix={`${props.idPrefix}-kind`}
        options={FEEDBACK_KINDS.map((kind) => [kind, FEEDBACK_KIND_LABEL[kind]])}
        value={draft.kind}
        onChange={(kind) =>
          onChange({ ...draft, kind: FEEDBACK_KINDS.find((k) => k === kind) ?? draft.kind })
        }
      />
      {FEEDBACK_SECTIONS[draft.kind].map((section) => (
        <SectionField key={section.key} section={section} {...props} />
      ))}
      <ChoiceGroup
        legend="Onde"
        idPrefix={`${props.idPrefix}-platform`}
        options={FEEDBACK_PLATFORMS.map((platform) => [
          platform,
          FEEDBACK_PLATFORM_LABEL[platform],
        ])}
        value={draft.platform}
        onChange={(platform) =>
          onChange({
            ...draft,
            platform: FEEDBACK_PLATFORMS.find((p) => p === platform) ?? draft.platform,
          })
        }
      />
      <VersionField {...props} />
    </>
  );
}

function SectionField({
  section,
  idPrefix,
  draft,
  missing,
  onChange,
}: FeedbackFieldsProps & Readonly<{ section: FeedbackSection }>): React.JSX.Element {
  const id = feedbackFieldId(idPrefix, section.key);
  const invalid = missing === section.key;
  const write = (text: string): void =>
    onChange({ ...draft, sections: { ...draft.sections, [section.key]: text } });
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{section.label}</Label>
      <Textarea
        id={id}
        value={draft.sections[section.key]}
        maxLength={FEEDBACK_TEXT_MAX_LENGTH}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => write(event.target.value)}
      />
      {invalid && <MissingNote id={`${id}-error`} />}
    </div>
  );
}

function VersionField({
  idPrefix,
  draft,
  missing,
  onChange,
}: FeedbackFieldsProps): React.JSX.Element {
  const id = feedbackFieldId(idPrefix, 'appVersion');
  const invalid = missing === 'appVersion';
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Navegador ou versão do app</Label>
      <Input
        id={id}
        value={draft.appVersion}
        maxLength={100}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => onChange({ ...draft, appVersion: event.target.value })}
      />
      {invalid && <MissingNote id={`${id}-error`} />}
    </div>
  );
}

function MissingNote({ id }: Readonly<{ id: string }>): React.JSX.Element {
  return (
    <p id={id} className="text-xs text-destructive-text">
      {FEEDBACK_REQUIRED_TEXT}
    </p>
  );
}

type ChoiceGroupProps = Readonly<{
  legend: string;
  idPrefix: string;
  options: readonly (readonly [value: string, label: string])[];
  value: string;
  onChange: (value: string) => void;
}>;

function ChoiceGroup({
  legend,
  idPrefix,
  options,
  value,
  onChange,
}: ChoiceGroupProps): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={`${idPrefix}-legend`} className="mb-2 text-[13px] text-label">
        {legend}
      </legend>
      <RadioGroup
        aria-labelledby={`${idPrefix}-legend`}
        value={value}
        onValueChange={onChange}
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map(([option, label]) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroupItem id={`${idPrefix}-${option}`} value={option} />
            <Label htmlFor={`${idPrefix}-${option}`} className="cursor-pointer text-sm">
              {label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
