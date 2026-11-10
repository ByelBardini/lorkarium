import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  SAMPLE_SHEET_PREVIEW_DATA,
  previewBarsText,
  previewValuesText,
  readPreviewBarsText,
  readPreviewCharacter,
  readPreviewValuesText,
  type PreviewDataReading,
  type SheetPreviewData,
} from '@/lib/sheet-preview-data';
import { previewDataProblemMessage, type PreviewDataPart } from './sheet-template-messages';

export type SheetPreviewTestDataProps = Readonly<{
  data: SheetPreviewData;
  onChange: (data: SheetPreviewData) => void;
}>;

/** The preview's test data, folded under the frame: the character's name, AC and DC, its bars and
 *  the sheet's values in JSON. A text the preview cannot take says why and changes nothing; what
 *  the frame changes (`character.set`, `values.*`, `bars.*`) shows here.
 *
 *  Example: `<SheetPreviewTestData data={testData} onChange={setTestData} />` */
export function SheetPreviewTestData({
  data,
  onChange,
}: SheetPreviewTestDataProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <section aria-label="Dados de teste" className="shrink-0 rounded-sm border border-border">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        className="w-full justify-start"
        onClick={() => setOpen(!open)}
      >
        <Chevron aria-hidden="true" />
        Dados de teste
      </Button>
      {open && <TestDataFields data={data} onChange={onChange} />}
    </section>
  );
}

function TestDataFields({ data, onChange }: SheetPreviewTestDataProps): React.JSX.Element {
  return (
    <div className="flex max-h-80 flex-col gap-3 overflow-y-auto border-t border-border p-3">
      <CharacterFields data={data} onChange={onChange} />
      <JsonField
        {...{ label: 'Barras (JSON)', part: 'bars', value: data.bars }}
        {...{ show: previewBarsText, read: readPreviewBarsText }}
        onValid={(bars) => onChange({ ...data, bars })}
      />
      <JsonField
        {...{ label: 'Valores (JSON)', part: 'values', value: data.values }}
        {...{ show: previewValuesText, read: readPreviewValuesText }}
        onValid={(values) => onChange({ ...data, values })}
      />
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange(SAMPLE_SHEET_PREVIEW_DATA)}
      >
        Voltar ao exemplo
      </Button>
    </div>
  );
}

type SyncedText = Readonly<{
  text: string;
  setText: (text: string) => void;
  /** The text the panel will be shown for the value just taken: its echo resets nothing. */
  taken: (shown: string) => void;
}>;

// The text as typed, put back to `shown` only when the data changed elsewhere (the frame, the
// sample): a valid text the master typed in another spacing stays as typed.
function useSyncedText(shown: string): SyncedText {
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  if (shown !== seen) {
    setSeen(shown);
    setText(shown);
  }
  return { text, setText, taken: setSeen };
}

type JsonFieldProps<T> = Readonly<{
  label: string;
  part: PreviewDataPart;
  value: T;
  show: (value: T) => string;
  read: (text: string) => PreviewDataReading<T>;
  onValid: (value: T) => void;
}>;

function JsonField<T>(props: JsonFieldProps<T>): React.JSX.Element {
  const { label, part, show, read } = props;
  const id = useId();
  const field = useSyncedText(show(props.value));
  const reading = read(field.text);
  const edit = (text: string): void => {
    field.setText(text);
    const next = read(text);
    if (!next.ok) return;
    props.onValid(next.value);
    field.taken(show(next.value));
  };
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        spellCheck={false}
        aria-invalid={!reading.ok}
        className="min-h-20 font-mono text-xs"
        value={field.text}
        onChange={(event) => edit(event.target.value)}
      />
      {!reading.ok && <Problem text={previewDataProblemMessage(part, reading.problem)} />}
    </div>
  );
}

type CharacterKey = 'name' | 'armorClass' | 'difficultyClass';

function CharacterFields({ data, onChange }: SheetPreviewTestDataProps): React.JSX.Element {
  const { character } = data;
  const fields: Readonly<Record<CharacterKey, SyncedText>> = {
    name: useSyncedText(character.name),
    armorClass: useSyncedText(statText(character.armorClass)),
    difficultyClass: useSyncedText(statText(character.difficultyClass)),
  };
  const typed = {
    name: fields.name.text,
    armorClass: fields.armorClass.text,
    difficultyClass: fields.difficultyClass.text,
  };
  const reading = readPreviewCharacter(typed);
  const edit = (key: CharacterKey) => (text: string) => {
    fields[key].setText(text);
    const next = readPreviewCharacter({ ...typed, [key]: text });
    if (!next.ok) return;
    onChange({ ...data, character: next.value });
    fields[key].taken(key === 'name' ? next.value.name : statText(next.value[key]));
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-semibold text-muted-foreground">Personagem</legend>
      <TextField label="Nome do personagem" value={typed.name} onChange={edit('name')} />
      <div className="flex gap-2">
        <TextField label="CA" number value={typed.armorClass} onChange={edit('armorClass')} />
        <TextField
          label="CD"
          number
          value={typed.difficultyClass}
          onChange={edit('difficultyClass')}
        />
      </div>
      {!reading.ok && <Problem text={previewDataProblemMessage('character', reading.problem)} />}
    </fieldset>
  );
}

function statText(stat: number | null): string {
  return stat === null ? '' : String(stat);
}

type TextFieldProps = Readonly<{
  label: string;
  value: string;
  number?: boolean;
  onChange: (text: string) => void;
}>;

function TextField({ label, value, number, onChange }: TextFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={number ? 'number' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Problem({ text }: Readonly<{ text: string }>): React.JSX.Element {
  return (
    <p role="alert" className="text-xs text-destructive-text">
      {text}
    </p>
  );
}
