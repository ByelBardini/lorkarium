import type { TokenSideDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Input } from '@/components/ui/input';
import { sideRingVar } from '@/lib/token-side';
import { ControlField } from './control-field';
import { SizeField } from './size-field';
import {
  automaticInitials,
  renameToken,
  type TokenFormErrors,
  type TokenFormValues,
  type TokenPlayer,
} from './token-form-state';
import { SIDE_OPTIONS } from './token-messages';

export type TokenBasicsTabProps = Readonly<{
  form: TokenFormValues;
  errors: TokenFormErrors;
  players: readonly TokenPlayer[];
  /** The creator on a player's own token: always in "Quem controla". */
  lockedIds?: readonly string[];
  onChange: (form: TokenFormValues) => void;
}>;

const SIDE_SEGMENTS: readonly SegmentOption<TokenSideDto>[] = SIDE_OPTIONS.map((option) => ({
  ...option,
  mark: (
    <span
      aria-hidden="true"
      className="size-3 rounded-full"
      style={{ boxShadow: `inset 0 0 0 2px ${sideRingVar(option.value)}` }}
    />
  ),
}));

/** "Básico" of the token dialog: name and initials ("auto" while they follow the name), side,
 *  size (a new token starts at 1 × 1) and the players who control it.
 *
 *  Example: `<TokenBasicsTab form={form} errors={errors} players={players} onChange={setForm} />` */
export function TokenBasicsTab(props: TokenBasicsTabProps): React.JSX.Element {
  const { form, errors, players, onChange } = props;
  return (
    <div className="flex flex-col gap-6">
      <NameFields form={form} errors={errors} onChange={onChange} />
      <SegmentField
        legend="Lado"
        value={form.side}
        options={SIDE_SEGMENTS}
        fill
        onChange={(side) => onChange({ ...form, side })}
      />
      <SizeField
        size={{ width: form.width, height: form.height }}
        onChange={(size) => onChange({ ...form, ...size })}
      />
      <ControlField
        controllerIds={form.controllerIds}
        players={players}
        lockedIds={props.lockedIds}
        onChange={(controllerIds) => onChange({ ...form, controllerIds })}
      />
    </div>
  );
}

type NameFieldsProps = Pick<TokenBasicsTabProps, 'form' | 'errors' | 'onChange'>;

function NameFields({ form, errors, onChange }: NameFieldsProps): React.JSX.Element {
  const nameId = useId();
  const initialsId = useId();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
      <FormField id={nameId} label="Nome" error={errors.name}>
        <Input
          id={nameId}
          value={form.name}
          maxLength={60}
          placeholder="Ex.: Ogro das Cinzas"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${nameId}-error` : undefined}
          onChange={(event) => onChange(renameToken(form, event.target.value))}
        />
      </FormField>
      <div className="flex flex-col gap-1">
        <FormField id={initialsId} label="Iniciais" error={errors.initials}>
          <Input
            id={initialsId}
            value={form.initials}
            maxLength={3}
            className="text-center font-semibold tracking-[0.12em] uppercase"
            aria-invalid={errors.initials ? true : undefined}
            aria-describedby={errors.initials ? `${initialsId}-error` : undefined}
            onChange={(event) =>
              onChange({
                ...form,
                initials: event.target.value.toUpperCase(),
                initialsEdited: true,
              })
            }
          />
        </FormField>
        <InitialsMode form={form} onChange={onChange} />
      </div>
    </div>
  );
}

function InitialsMode({ form, onChange }: Pick<NameFieldsProps, 'form' | 'onChange'>) {
  if (!form.initialsEdited) {
    return (
      <span className="text-[10px] font-semibold tracking-[0.12em] text-primary uppercase">
        auto
      </span>
    );
  }
  return (
    <button
      type="button"
      className="self-start text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
      onClick={() => onChange(automaticInitials(form))}
    >
      Voltar às iniciais automáticas
    </button>
  );
}
