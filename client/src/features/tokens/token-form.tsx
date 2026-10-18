import { useId } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { ImagePicker } from '@/components/image-picker';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AssetsApi } from '@/services/assets-api';
import { BarsEditor } from './bars-editor';
import { decimalText } from '@/lib/numeric-text';
import { SIDE_OPTIONS } from './token-messages';
import { renameToken, type TokenFormErrors, type TokenFormValues } from './token-form-state';

/** Someone at the table who may control a token. */
export type TokenPlayer = Readonly<{ userId: string; name: string }>;

export type TokenFormProps = Readonly<{
  form: TokenFormValues;
  errors: TokenFormErrors;
  players: readonly TokenPlayer[];
  /** Where the "Imagem" field sends a chosen image. */
  image: Readonly<{ campaignId: string; assets: AssetsApi }>;
  onChange: (form: TokenFormValues) => void;
}>;

/** The fields of a token: name and initials (filled from the name until edited), its image,
 *  side, size, who controls it, and its bars.
 *
 *  Example: `<TokenForm form={form} errors={errors} players={players} image={{ campaignId, assets }} onChange={setForm} />` */
export function TokenForm(props: TokenFormProps): React.JSX.Element {
  const { form, errors, players, image, onChange } = props;
  const nameId = useId();
  const initialsId = useId();
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[1fr_6rem] gap-4">
        <FormField id={nameId} label="Nome" error={errors.name}>
          <Input
            id={nameId}
            value={form.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
            onChange={(event) => onChange(renameToken(form, event.target.value))}
          />
        </FormField>
        <FormField id={initialsId} label="Iniciais" error={errors.initials}>
          <Input
            id={initialsId}
            value={form.initials}
            maxLength={3}
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
      </div>
      <ImagePicker
        campaignId={image.campaignId}
        purpose="token"
        assets={image.assets}
        value={form.imageAssetId}
        onChange={(asset) => onChange({ ...form, imageAssetId: asset?.id ?? null })}
        label="Imagem"
      />
      <ChoiceField
        legend="Lado"
        value={form.side}
        options={SIDE_OPTIONS}
        onChange={(side) => onChange({ ...form, side })}
      />
      <SizeFields form={form} errors={errors} onChange={onChange} />
      <ControllersField form={form} players={players} onChange={onChange} />
      <BarsEditor form={form} errors={errors.bars} onChange={onChange} />
    </div>
  );
}

// Text, not type="number": no spinner arrows, and "1,5" is typed the Brazilian way.
function SizeFields({
  form,
  errors,
  onChange,
}: Pick<TokenFormProps, 'form' | 'errors' | 'onChange'>): React.JSX.Element {
  const widthId = useId();
  const heightId = useId();
  const field = (id: string, side: 'width' | 'height', label: string) => (
    <FormField id={id} label={label} error={errors[side]}>
      <Input
        id={id}
        inputMode="decimal"
        value={form[side]}
        aria-invalid={errors[side] ? true : undefined}
        aria-describedby={errors[side] ? `${id}-error` : undefined}
        onChange={(event) => onChange({ ...form, [side]: decimalText(event.target.value) })}
      />
    </FormField>
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      {field(widthId, 'width', 'Largura (casas)')}
      {field(heightId, 'height', 'Altura (casas)')}
    </div>
  );
}

function ControllersField({
  form,
  players,
  onChange,
}: Pick<TokenFormProps, 'form' | 'players' | 'onChange'>): React.JSX.Element {
  const toggle = (userId: string, checked: boolean): void => {
    const others = form.controllerIds.filter((id) => id !== userId);
    onChange({ ...form, controllerIds: checked ? [...others, userId] : others });
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[13px] text-label">Quem controla</legend>
      {players.length === 0 && (
        <p className="text-[13px] text-muted-foreground">Nenhum jogador na mesa ainda.</p>
      )}
      {players.map((player) => (
        <PlayerCheck
          key={player.userId}
          player={player}
          checked={form.controllerIds.includes(player.userId)}
          onCheckedChange={(checked) => toggle(player.userId, checked)}
        />
      ))}
    </fieldset>
  );
}

type PlayerCheckProps = Readonly<{
  player: TokenPlayer;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}>;

function PlayerCheck({ player, checked, onCheckedChange }: PlayerCheckProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="text-sm text-foreground">
        {player.name}
      </Label>
    </div>
  );
}
