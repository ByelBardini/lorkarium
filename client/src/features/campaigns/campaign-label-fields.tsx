import {
  CAMPAIGN_TAG_MAX_LENGTH,
  CAMPAIGN_TAGS_MAX,
  campaignTagKey,
  type ContentWarningDto,
} from '@lorkarium/contracts';
import { CheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { addTag, hasRoomForTag, removeLastTag, removeTag } from '@/lib/campaign-tags';
import {
  CONTENT_WARNINGS,
  CONTENT_WARNING_LABEL,
  TAG_SUGGESTIONS,
  toggleContentWarning,
} from '@/lib/content-warnings';
import { cn } from '@/lib/utils';

const LABEL_BUTTON =
  'inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[13px] outline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none';

export type ContentWarningsFieldProps = Readonly<{
  value: readonly ContentWarningDto[];
  onChange: (warnings: readonly ContentWarningDto[]) => void;
}>;

/** The fixed content warnings as toggle buttons (`aria-pressed`), in the contract's order.
 *
 *  Example: `<ContentWarningsField value={values.contentWarnings} onChange={(contentWarnings) => change({ contentWarnings })} />` */
export function ContentWarningsField({
  value,
  onChange,
}: ContentWarningsFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-[13px] text-label">
        Avisos de conteúdo
      </span>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        className="flex flex-wrap gap-2"
      >
        {CONTENT_WARNINGS.map((warning) => (
          <WarningToggle
            key={warning}
            warning={warning}
            pressed={value.includes(warning)}
            onToggle={() => onChange(toggleContentWarning(value, warning))}
          />
        ))}
      </div>
      <p id={`${id}-hint`} className="text-[13px] text-placeholder">
        Aparecem em destaque antes de alguém entrar. Marque o que a mesa pode ter.
      </p>
    </div>
  );
}

type WarningToggleProps = Readonly<{
  warning: ContentWarningDto;
  pressed: boolean;
  onToggle: () => void;
}>;

function WarningToggle({ warning, pressed, onToggle }: WarningToggleProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        LABEL_BUTTON,
        pressed
          ? 'border-destructive/60 bg-destructive/10 text-destructive-text'
          : 'border-input text-muted-foreground hover:text-foreground',
      )}
    >
      {pressed && <CheckIcon aria-hidden="true" className="size-3.5" />}
      {CONTENT_WARNING_LABEL[warning]}
    </button>
  );
}

export type CampaignTagsFieldProps = Readonly<{
  value: readonly string[];
  onChange: (tags: readonly string[]) => void;
}>;

/** Free tags: Enter or comma adds what was typed, Backspace on the empty field takes the last one,
 *  each chip has its own remove button, and the suggestions add with one click. At the limit the
 *  field and the suggestions hide.
 *
 *  Example: `<CampaignTagsField value={values.tags} onChange={(tags) => change({ tags })} />` */
export function CampaignTagsField({ value, onChange }: CampaignTagsFieldProps): React.JSX.Element {
  const id = useId();
  const room = hasRoomForTag(value);
  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-[13px] text-label">
        Tags
      </span>
      {value.length > 0 && (
        <ul aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <TagChip key={tag} tag={tag} onRemove={() => onChange(removeTag(value, tag))} />
          ))}
        </ul>
      )}
      {room && <TagInput tags={value} onChange={onChange} />}
      <p className="text-[13px] text-placeholder">O estilo da mesa. Até {CAMPAIGN_TAGS_MAX}.</p>
      {room && <TagSuggestions tags={value} onChange={onChange} />}
    </div>
  );
}

function TagChip({ tag, onRemove }: Readonly<{ tag: string; onRemove: () => void }>) {
  return (
    <li className="inline-flex items-center gap-1 rounded-sm bg-muted py-0.5 pr-0.5 pl-2 text-[13px] text-foreground">
      {tag}
      <button
        type="button"
        aria-label={`Remover a tag ${tag}`}
        onClick={onRemove}
        className="grid size-6 place-items-center rounded-sm text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <XIcon aria-hidden="true" className="size-3.5" />
      </button>
    </li>
  );
}

type TagEditProps = Readonly<{
  tags: readonly string[];
  onChange: (tags: readonly string[]) => void;
}>;

// Enter would submit the settings form: it adds the tag instead.
function TagInput({ tags, onChange }: TagEditProps): React.JSX.Element {
  const [typed, setTyped] = useState('');
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Backspace' && typed === '' && tags.length > 0) {
      onChange(removeLastTag(tags));
      return;
    }
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    const next = addTag(tags, typed);
    if (next !== tags) onChange(next);
    setTyped('');
  };
  return (
    <Input
      aria-label="Nova tag"
      placeholder="Escreva e aperte Enter"
      value={typed}
      maxLength={CAMPAIGN_TAG_MAX_LENGTH}
      onChange={(event) => setTyped(event.target.value)}
      onKeyDown={onKeyDown}
      className="h-10"
    />
  );
}

function TagSuggestions({ tags, onChange }: TagEditProps): React.JSX.Element | null {
  const taken = new Set(tags.map(campaignTagKey));
  const open = TAG_SUGGESTIONS.filter((tag) => !taken.has(campaignTagKey(tag)));
  if (open.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[13px] text-placeholder">Sugestões:</span>
      {open.map((tag) => (
        <button
          key={tag}
          type="button"
          aria-label={`Adicionar a tag ${tag}`}
          onClick={() => onChange(addTag(tags, tag))}
          className={cn(
            LABEL_BUTTON,
            'h-7 border-dashed border-input text-muted-foreground hover:text-foreground',
          )}
        >
          <PlusIcon aria-hidden="true" className="size-3" />
          {tag}
        </button>
      ))}
    </div>
  );
}
