import type { AssetDto, SceneBackgroundDto, SceneDto, SceneVisionDto } from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { ChoiceField } from '@/components/choice-field';
import { FormField } from '@/components/form-field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { decimalText, digitsOnly } from '@/lib/numeric-text';
import { cellsForImage, heightForWidth, isProportional } from '@/lib/scene-proportion';
import type { AssetsApi } from '@/services/assets-api';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';
import { DISCONNECTED_COMMAND, boardCommandFailureMessage } from './board-messages';
import {
  VISION_HINT,
  VISION_OPTIONS,
  gridFormOf,
  keepProportion,
  parseGridForm,
  unitOptionsOf,
  wholeOf,
  withCells,
  type GridForm,
  type GridFormErrors,
  type GridFormField,
} from './grid-form';
import { SceneBackgroundField } from './scene-background-field';

export type ConfigureSceneDialogProps = Readonly<{
  campaignId: string;
  scene: SceneDto;
  commands: TableBoardCommands;
  assets: AssetsApi;
  /** `false` while reconnecting: there is no queue, so nothing is sent. */
  connected: boolean;
  onClose: () => void;
}>;

/** "Configurar cena" (master): the background image, then size, cell distance and unit,
 *  visibility and opacity of the grid, and the vision of the tokens. Mounted only while open, so every opening starts from the scene as it
 *  is now.
 *
 *  Example: `{sceneDialog && <ConfigureSceneDialog campaignId={id} scene={scene} commands={commands} assets={assets} connected={live} onClose={close} />}` */
export function ConfigureSceneDialog(props: ConfigureSceneDialogProps): React.JSX.Element {
  const { campaignId, scene, commands, assets, connected, onClose } = props;
  const look = useSceneLook(scene);
  const [errors, setErrors] = useState<GridFormErrors>({});
  const [failure, setFailure] = useState<BoardCommandFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (): Promise<void> => {
    const parsed = parseGridForm(look.form);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSaving(true);
    const backgroundAssetId = look.background?.assetId ?? null;
    const result = await commands.configureScene(
      campaignId,
      parsed.grid,
      backgroundAssetId,
      look.vision,
    );
    setSaving(false);
    if (result.ok) return onClose();
    setFailure(result.failure);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar cena</DialogTitle>
          <DialogDescription>Todos na mesa veem a mudança na hora.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <SceneBackgroundField
            campaignId={campaignId}
            assets={assets}
            background={look.background}
            locked={look.locked}
            onBackground={look.chooseBackground}
            onLocked={look.setLocked}
          />
          <GridFields form={look.form} errors={errors} onChange={look.changeForm} />
          <ChoiceField
            legend="Visão dos tokens"
            value={look.vision}
            options={VISION_OPTIONS}
            onChange={look.setVision}
            hint={VISION_HINT}
          />
          {failure && (
            <Alert variant="destructive" className="px-3.5 py-3 text-sm">
              {boardCommandFailureMessage(failure)}
            </Alert>
          )}
          {!connected && (
            <p className="text-[13px] text-muted-foreground">{DISCONNECTED_COMMAND}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !connected} aria-busy={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SceneLook = Readonly<{
  form: GridForm;
  vision: SceneVisionDto;
  setVision: (vision: SceneVisionDto) => void;
  background: SceneBackgroundDto | null;
  locked: boolean;
  changeForm: (form: GridForm) => void;
  chooseBackground: (asset: AssetDto | null) => void;
  setLocked: (locked: boolean) => void;
}>;

// The grid fields and the background move together: with the lock on, the cells follow the image.
function useSceneLook(scene: SceneDto): SceneLook {
  const [form, setForm] = useState(() => gridFormOf(scene));
  const [background, setBackground] = useState(scene.background);
  const [vision, setVision] = useState(scene.vision);
  const [locked, setLockedState] = useState(
    () => !scene.background || isProportional(scene, scene.background),
  );
  const chooseBackground = (asset: AssetDto | null): void => {
    if (!asset) return setBackground(null);
    const image = { assetId: asset.id, width: asset.width, height: asset.height };
    setBackground(image);
    setLockedState(true);
    setForm(withCells(form, cellsForImage(image, wholeOf(form.widthCells) ?? scene.widthCells)));
  };
  const setLocked = (next: boolean): void => {
    setLockedState(next);
    const width = wholeOf(form.widthCells);
    if (!next || !background || !width) return;
    setForm({ ...form, heightCells: String(heightForWidth(background, width)) });
  };
  const changeForm = (next: GridForm): void =>
    setForm(locked && background ? keepProportion(form, next, background) : next);
  return { form, vision, setVision, background, locked, changeForm, chooseBackground, setLocked };
}

type GridFieldsProps = Readonly<{
  form: GridForm;
  errors: GridFormErrors;
  onChange: (form: GridForm) => void;
}>;

type NumericField = Exclude<GridFormField, 'cellUnit'>;

// Text, not type="number": no spinner arrows, and what is typed is filtered to a number as it goes.
const KEEP: Readonly<Record<'numeric' | 'decimal', (typed: string) => string>> = {
  numeric: digitsOnly,
  decimal: decimalText,
};

function GridFields({ form, errors, onChange }: GridFieldsProps): React.JSX.Element {
  const visibleId = useId();
  const field = (name: NumericField, label: string, inputMode: 'numeric' | 'decimal') => (
    <TextField
      label={label}
      value={form[name]}
      error={errors[name]}
      inputMode={inputMode}
      onChange={(value) => onChange({ ...form, [name]: KEEP[inputMode](value) })}
    />
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {field('widthCells', 'Largura (casas)', 'numeric')}
        {field('heightCells', 'Altura (casas)', 'numeric')}
        {field('cellDistance', 'Distância de uma casa', 'decimal')}
        <UnitField
          value={form.cellUnit}
          error={errors.cellUnit}
          onChange={(cellUnit) => onChange({ ...form, cellUnit })}
        />
      </div>
      {field('gridOpacity', 'Opacidade do grid (%)', 'numeric')}
      <div className="flex items-center gap-3">
        <Checkbox
          id={visibleId}
          checked={form.gridVisible}
          onCheckedChange={(checked) => onChange({ ...form, gridVisible: checked === true })}
        />
        <Label htmlFor={visibleId} className="text-sm text-label">
          Grid visível
        </Label>
      </div>
    </>
  );
}

type UnitFieldProps = Readonly<{
  value: string;
  error: string | undefined;
  onChange: (unit: string) => void;
}>;

function UnitField({ value, error, onChange }: UnitFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <FormField id={id} label="Unidade" error={error}>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/20"
      >
        {unitOptionsOf(value).map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </FormField>
  );
}

type TextFieldProps = Readonly<{
  label: string;
  value: string;
  error: string | undefined;
  inputMode: 'numeric' | 'decimal';
  onChange: (value: string) => void;
}>;

function TextField({ label, value, error, inputMode, onChange }: TextFieldProps) {
  const id = useId();
  return (
    <FormField id={id} label={label} error={error}>
      <Input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}
