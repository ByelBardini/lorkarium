import type { CampaignVisibilityDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export type VisibilityFieldProps = Readonly<{
  value: CampaignVisibilityDto;
  onChange: (value: CampaignVisibilityDto) => void;
}>;

/** "Privada" / "Pública", each with a line that says what it means.
 *
 *  Example: `<VisibilityField value={visibility} onChange={setVisibility} />` */
export function VisibilityField({ value, onChange }: VisibilityFieldProps): React.JSX.Element {
  const ids = { private: useId(), public: useId() };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] text-label">Visibilidade</legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next === 'public' ? 'public' : 'private')}
      >
        <VisibilityOption
          id={ids.private}
          value="private"
          label="Privada"
          hint="Só entra quem tiver o código."
        />
        <VisibilityOption
          id={ids.public}
          value="public"
          label="Pública"
          hint="Vai aparecer na busca de mesas quando ela existir; ainda se entra pelo código."
        />
      </RadioGroup>
    </fieldset>
  );
}

type VisibilityOptionProps = Readonly<{ id: string; value: string; label: string; hint: string }>;

function VisibilityOption({ id, value, label, hint }: VisibilityOptionProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <RadioGroupItem id={id} value={value} aria-describedby={`${id}-hint`} className="mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="cursor-pointer text-sm text-foreground">
          {label}
        </Label>
        <span id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </span>
      </div>
    </div>
  );
}
