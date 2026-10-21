import type { TokenBarDto } from '@lorkarium/contracts';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseBarAmount, parseBarInput, parseBarMax } from '@/lib/bar-input';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';

export type BarFieldProps = Readonly<{
  tokenId: string;
  tokenName: string;
  bar: TokenBarDto;
  interaction: StoreApi<BoardInteractionStore>;
  disabled: boolean;
}>;

const HOW_TO_WRITE = 'Escreva −7 para tirar, +5 para somar ou 12 para definir.';

/** The adjust fields of one bar: "−7" subtracts, "+5" adds, "12" sets, Enter sends; with a plain
 *  amount typed, "Dano" takes it and "Cura" adds it; − and + step by one; "Máx." sets a new
 *  maximum. The fields empty on send: the value shown is always the confirmed one.
 *
 *  Example: `<BarField tokenId={token.id} tokenName={token.name} bar={bar} interaction={interaction} disabled={readOnly} />` */
export function BarField({ tokenId, tokenName, bar, interaction, disabled }: BarFieldProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const name = `${bar.label} de ${tokenName}`;
  const adjust = interaction.getState().adjustBar;
  const amount = parseBarAmount(text);
  const submit = (): void => {
    const parsed = parseBarInput(text);
    setInvalid(parsed.kind === 'invalid');
    if (parsed.kind === 'invalid') return;
    setText('');
    void adjust(tokenId, bar.id, parsed.change);
  };
  const hit = (sign: 1 | -1) => (): void => {
    if (amount === null) return;
    setText('');
    void adjust(tokenId, bar.id, { op: 'add', amount: sign * amount });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <StepButton
          label={`Tirar 1 de ${name}`}
          disabled={disabled}
          icon={MinusIcon}
          onClick={() => void adjust(tokenId, bar.id, { op: 'add', amount: -1 })}
        />
        <Input
          id={id}
          aria-label={name}
          value={text}
          disabled={disabled}
          placeholder="−7, +5, 12"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={`${id}-how`}
          className="h-9 w-20 text-sm"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submit();
          }}
        />
        <span id={`${id}-how`} className="sr-only">
          {HOW_TO_WRITE}
        </span>
        <StepButton
          label={`Somar 1 a ${name}`}
          disabled={disabled}
          icon={PlusIcon}
          onClick={() => void adjust(tokenId, bar.id, { op: 'add', amount: 1 })}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-1"
          aria-label={`Dano em ${name}`}
          disabled={disabled || amount === null}
          onClick={hit(-1)}
        >
          Dano
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Cura em ${name}`}
          disabled={disabled || amount === null}
          onClick={hit(1)}
        >
          Cura
        </Button>
      </div>
      <BarMaxField
        name={name}
        max={bar.max}
        disabled={disabled}
        onSubmit={(value) => void adjust(tokenId, bar.id, { op: 'max', value })}
      />
    </div>
  );
}

type BarMaxFieldProps = Readonly<{
  name: string;
  max: number;
  disabled: boolean;
  onSubmit: (max: number) => void;
}>;

// The current maximum is the placeholder: the field holds only what is about to be sent.
function BarMaxField({ name, max, disabled, onSubmit }: BarMaxFieldProps): React.JSX.Element {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = (): void => {
    const parsed = parseBarMax(text);
    setInvalid(parsed === null);
    if (parsed === null) return;
    setText('');
    onSubmit(parsed);
  };
  return (
    <label className="flex items-center gap-1.5 self-end text-xs text-muted-foreground">
      Máx.
      <Input
        aria-label={`Máximo de ${name}`}
        value={text}
        disabled={disabled}
        placeholder={String(max)}
        inputMode="numeric"
        aria-invalid={invalid ? true : undefined}
        className="h-9 w-20 text-sm"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          submit();
        }}
      />
    </label>
  );
}

type StepButtonProps = Readonly<{
  label: string;
  disabled: boolean;
  icon: React.ComponentType<{ 'aria-hidden'?: boolean | 'true' }>;
  onClick: () => void;
}>;

function StepButton({ label, disabled, icon: Icon, onClick }: StepButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
