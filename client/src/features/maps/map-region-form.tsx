import {
  MAP_REGION_DESCRIPTION_MAX_LENGTH,
  MAP_REGION_NAME_MAX_LENGTH,
  isHexColor,
  type DrawingPaletteDto,
  type HexColorDto,
  type MapRegionDto,
  type UpdateMapRegionRequestDto,
} from '@lorkarium/contracts';
import { LoaderCircleIcon, Trash2Icon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { COLOR_TILES } from '@/features/drawings/color-tiles';
import { PaletteColorField } from '@/features/drawings/palette-color-field';
import { DRAWING_COLORS } from '@/lib/drawing-style';
import { useDraftField } from '@/lib/use-draft-field';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import { MapLinkPicker, type LinkableLibrary } from './map-link-picker';
import { MAP_REGION_BLANK_NAME, mapRegionFailureMessage } from './map-messages';
import { MapPinIconField } from './map-pin-icon-field';

export type MapRegionFormProps = Readonly<{
  api: Pick<LibraryMapsApi, 'updateRegion' | 'removeRegion'>;
  campaignId: string;
  mapId: string;
  /** The region as the server last confirmed it: the owner replaces it on `onRegionChanged`. */
  region: MapRegionDto;
  library: LinkableLibrary;
  /** Without a connection every field is off. */
  live: boolean;
  onRegionChanged: (region: MapRegionDto) => void;
  onRegionRemoved: (regionId: string) => void;
}>;

/** The data of a place on a map: name and description saved on leaving the field; color, hidden
 *  and link saved at once; deleting asks first. Nothing changes until the server confirms.
 *
 *  Example: `<MapRegionForm api={api} campaignId={c} mapId={m} region={r} library={l} live onRegionChanged={set} onRegionRemoved={drop} />` */
export function MapRegionForm(props: MapRegionFormProps): React.JSX.Element {
  // By key: a draft or a refusal of one region must not show on the next.
  return <RegionFields key={props.region.id} {...props} />;
}

function RegionFields(props: MapRegionFormProps): React.JSX.Element {
  const { region, live, library, mapId } = props;
  const commands = useRegionCommands(props);
  const off = !live;
  return (
    <section aria-label={`Dados de ${region.name}`} className="flex flex-col gap-4">
      <NameField region={region} disabled={off} commands={commands} />
      <DescriptionField region={region} disabled={off} commands={commands} />
      <PaletteColorField
        legend="Cor"
        value={paletteChoiceOf(region.color)}
        tiles={COLOR_TILES}
        disabled={off}
        onChange={(choice) => commands.saveChoiceOfColor(choice)}
      />
      {region.geometry.shape === 'pin' && (
        <MapPinIconField
          value={region.icon}
          disabled={off}
          onChoose={(icon) => void (icon !== region.icon && commands.save({ icon }))}
        />
      )}
      <HiddenSwitch region={region} disabled={off} commands={commands} />
      <MapLinkPicker
        mapId={mapId}
        link={region.link}
        library={library}
        disabled={off}
        onChange={(link) => void commands.save({ link })}
      />
      {commands.failure && (
        <p role="alert" className="text-sm text-destructive-text">
          {commands.failure}
        </p>
      )}
      <DeleteRegion name={region.name} disabled={off} onConfirm={commands.remove} />
    </section>
  );
}

type RegionCommands = Readonly<{
  failure: string | null;
  save: (changes: UpdateMapRegionRequestDto) => Promise<boolean>;
  saveChoiceOfColor: (choice: DrawingPaletteDto | HexColorDto) => void;
  refuse: (message: string) => void;
  /** Answers the reason of a refusal, or `null` when the region is gone. */
  remove: () => Promise<string | null>;
}>;

function useRegionCommands(props: MapRegionFormProps): RegionCommands {
  const { api, campaignId, mapId, region, onRegionChanged, onRegionRemoved } = props;
  const [failure, setFailure] = useState<string | null>(null);
  const inOrder = useSerializedWork();
  const save = (changes: UpdateMapRegionRequestDto): Promise<boolean> =>
    inOrder(async () => {
      const answer = await api.updateRegion(campaignId, mapId, region.id, changes);
      if (answer.ok) onRegionChanged(answer.value);
      setFailure(answer.ok ? null : mapRegionFailureMessage(answer.failure.kind));
      return answer.ok;
    });
  const remove = (): Promise<string | null> =>
    inOrder(async () => {
      const answer = await api.removeRegion(campaignId, mapId, region.id);
      if (!answer.ok) return mapRegionFailureMessage(answer.failure.kind);
      onRegionRemoved(region.id);
      return null;
    });
  const saveChoiceOfColor = (choice: DrawingPaletteDto | HexColorDto): void => {
    const color = hexOfChoice(choice);
    if (color !== region.color) void save({ color });
  };
  return { failure, save, saveChoiceOfColor, refuse: setFailure, remove };
}

// Each PATCH answers the whole region and regions carry no version: an answer overtaken by a
// later one would bring the older region back. So a change leaves only after the previous landed.
function useSerializedWork(): <T>(work: () => Promise<T>) => Promise<T> {
  const last = useRef<Promise<unknown>>(Promise.resolve());
  return <T,>(work: () => Promise<T>): Promise<T> => {
    const next = last.current.then(work, work);
    last.current = next;
    return next;
  };
}

function paletteChoiceOf(color: HexColorDto): DrawingPaletteDto | HexColorDto {
  return DRAWING_COLORS.find(({ hex }) => hex === color)?.color ?? color;
}

function hexOfChoice(choice: DrawingPaletteDto | HexColorDto): HexColorDto {
  if (isHexColor(choice)) return choice;
  const hex = DRAWING_COLORS.find(({ color }) => color === choice)?.hex;
  if (hex !== undefined && isHexColor(hex)) return hex;
  throw new Error(`Region color "${choice}" has no hex: expected a color of DRAWING_COLORS`);
}

type RegionFieldProps = Readonly<{
  region: MapRegionDto;
  disabled: boolean;
  commands: RegionCommands;
}>;

function NameField({ region, disabled, commands }: RegionFieldProps): React.JSX.Element {
  const id = useId();
  const binding = useDraftField({
    confirmed: region.name,
    save: (typed) => saveRegionName(typed.trim(), region, commands),
  });
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Nome</Label>
      <Input id={id} {...binding} maxLength={MAP_REGION_NAME_MAX_LENGTH} disabled={disabled} />
    </div>
  );
}

async function saveRegionName(
  name: string,
  region: MapRegionDto,
  commands: RegionCommands,
): Promise<boolean> {
  if (name === region.name) return true;
  if (name !== '') return commands.save({ name });
  commands.refuse(MAP_REGION_BLANK_NAME);
  return false;
}

function DescriptionField({ region, disabled, commands }: RegionFieldProps): React.JSX.Element {
  const id = useId();
  const binding = useDraftField({
    confirmed: region.description,
    save: async (typed) => {
      const description = typed.trim();
      return description === region.description || commands.save({ description });
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Descrição</Label>
      <Textarea
        id={id}
        {...binding}
        // Enter is a new line here; only Esc goes to the draft.
        onKeyDown={(event) => event.key === 'Escape' && binding.onKeyDown(event)}
        maxLength={MAP_REGION_DESCRIPTION_MAX_LENGTH}
        disabled={disabled}
      />
    </div>
  );
}

function HiddenSwitch({ region, disabled, commands }: RegionFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id}>Oculta para jogadores</Label>
      <Switch
        id={id}
        checked={region.hidden}
        disabled={disabled}
        onCheckedChange={(hidden) => void commands.save({ hidden })}
      />
    </div>
  );
}

type DeleteRegionProps = Readonly<{
  name: string;
  disabled: boolean;
  onConfirm: () => Promise<string | null>;
}>;

function DeleteRegion({ name, disabled, onConfirm }: DeleteRegionProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const confirm = async (): Promise<void> => {
    setBusy(true);
    setFailure(await onConfirm());
    setBusy(false);
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={disabled}>
          <Trash2Icon aria-hidden="true" />
          Excluir lugar
        </Button>
      </AlertDialogTrigger>
      <DeleteRegionDialog name={name} busy={busy} failure={failure} onConfirm={confirm} />
    </AlertDialog>
  );
}

type DeleteRegionDialogProps = Readonly<{
  name: string;
  busy: boolean;
  failure: string | null;
  onConfirm: () => Promise<void>;
}>;

function DeleteRegionDialog(props: DeleteRegionDialogProps): React.JSX.Element {
  const { name, busy, failure, onConfirm } = props;
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{`Excluir ${name}?`}</AlertDialogTitle>
        <AlertDialogDescription>
          O desenho e o link somem do mapa. O item ligado continua na biblioteca.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {failure && (
        <p role="alert" className="text-sm text-destructive-text">
          {failure}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel size="lg" disabled={busy}>
          Manter
        </AlertDialogCancel>
        {/* Not an AlertDialogAction: it would close before the server answers. */}
        <Button
          size="lg"
          variant="destructive"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void onConfirm()}
        >
          {busy && <LoaderCircleIcon aria-hidden="true" className="animate-spin" />}
          {busy ? 'Excluindo…' : 'Excluir'}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
