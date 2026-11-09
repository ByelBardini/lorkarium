import {
  DOCUMENT_NAME_MAX_LENGTH,
  SCENE_NAME_MAX_LENGTH,
  SHEET_TEMPLATE_NAME_MAX_LENGTH,
  UNNAMED_DOCUMENT_NAME,
  UNNAMED_SCENE_NAME,
  UNNAMED_SHEET_TEMPLATE_NAME,
  type CreateSheetRequestDto,
  type SceneVisibilityDto,
  type LibraryImageDto,
  type LibraryMapSummaryDto,
  type SheetTemplateSummaryDto,
} from '@lorkarium/contracts';
import {
  CheckCircle2Icon,
  FileCode2Icon,
  FileTextIcon,
  FolderIcon,
  Grid2X2Icon,
  ImageIcon,
  MapIcon,
  ScrollTextIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { AssetsApi } from '@/services/assets-api';
import type { LibraryApi } from '@/services/library-api';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import { LibraryImageForm } from './library-image-form';
import { LibraryMapForm } from './library-map-form';
import { NamedItemForm, NewFolderForm, NewItemFooter } from './new-item-fields';
import { NewSheetForm } from './new-sheet-form';
import type { SheetPlayer } from './use-sheet-holder-names';

type NamedItemKind = 'grid' | 'document' | 'sheetTemplate';
type NewItemKind = NamedItemKind | 'folder' | 'image' | 'map' | 'sheet';

/** How each type of item is born in the folder given (`null` = the root); `''` = no name typed. */
export type NewItemCreators = Readonly<
  Record<NamedItemKind, (folderId: string | null, name: string) => void> & {
    folder: (parentId: string | null, name: string, visibility: SceneVisibilityDto) => void;
    sheet: (request: CreateSheetRequestDto) => void;
    importSheetTemplate: (folderId: string | null) => void;
    imageSaved: (image: LibraryImageDto) => void;
    mapSaved: (map: LibraryMapSummaryDto) => void;
  }
>;

export type NewItemDialogProps = Readonly<{
  campaignId: string;
  folderId: string | null;
  /** The name of the folder where the item goes. */
  destination: string;
  templates: readonly SheetTemplateSummaryDto[];
  players: readonly SheetPlayer[];
  assets: AssetsApi;
  api: LibraryApi;
  mapsApi: LibraryMapsApi;
  live: boolean;
  create: NewItemCreators;
  onClose: () => void;
}>;

const KINDS: readonly Readonly<{ kind: NewItemKind; label: string; icon: LucideIcon }>[] = [
  { kind: 'grid', label: 'Grid', icon: Grid2X2Icon },
  { kind: 'image', label: 'Imagem', icon: ImageIcon },
  { kind: 'map', label: 'Mapa', icon: MapIcon },
  { kind: 'document', label: 'Documento', icon: FileTextIcon },
  { kind: 'sheet', label: 'Ficha', icon: ScrollTextIcon },
  { kind: 'sheetTemplate', label: 'Modelo de ficha', icon: FileCode2Icon },
  { kind: 'folder', label: 'Pasta', icon: FolderIcon },
];

const NAMED_ITEMS: Readonly<Record<NamedItemKind, { maxLength: number; blankName?: string }>> = {
  grid: { maxLength: SCENE_NAME_MAX_LENGTH, blankName: UNNAMED_SCENE_NAME },
  document: { maxLength: DOCUMENT_NAME_MAX_LENGTH, blankName: UNNAMED_DOCUMENT_NAME },
  sheetTemplate: {
    maxLength: SHEET_TEMPLATE_NAME_MAX_LENGTH,
    blankName: UNNAMED_SHEET_TEMPLATE_NAME,
  },
};

/** The one way to create something in the library: pick the type on a card, fill what it asks
 *  right below and "Criar". Opened by the header (the root) and by the tree menu (its folder).
 *
 *  Example: `<NewItemDialog folderId={null} destination="Sem pasta" create={creators} … />` */
export function NewItemDialog(props: NewItemDialogProps): React.JSX.Element {
  const [kind, setKind] = useState<NewItemKind | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && props.onClose()}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={(event) => saving && event.preventDefault()}
      >
        <DialogTitle>Novo item</DialogTitle>
        <DialogDescription>Vai para {props.destination}.</DialogDescription>
        <KindCards picked={kind} disabled={saving} onPick={setKind} />
        {kind === null ? (
          <NewItemFooter canCreate={false} onCancel={props.onClose} />
        ) : (
          <KindForm key={kind} {...props} kind={kind} onSavingChange={setSaving} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type KindCardsProps = Readonly<{
  picked: NewItemKind | null;
  disabled: boolean;
  onPick: (kind: NewItemKind) => void;
}>;

function KindCards({ picked, disabled, onPick }: KindCardsProps): React.JSX.Element {
  return (
    <div role="group" aria-label="Tipo do item" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {KINDS.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          aria-pressed={picked === kind}
          disabled={disabled}
          onClick={() => onPick(kind)}
          className={cn(
            'relative flex h-24 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            picked === kind ? 'border-primary' : 'border-border hover:border-muted-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-6" />
          {label}
          {picked === kind && (
            <CheckCircle2Icon
              aria-hidden="true"
              className="absolute top-2 right-2 size-4 text-primary"
            />
          )}
        </button>
      ))}
    </div>
  );
}

type KindFormProps = NewItemDialogProps &
  Readonly<{ kind: NewItemKind; onSavingChange: (saving: boolean) => void }>;

function KindForm({ kind, create, ...props }: KindFormProps): React.JSX.Element {
  const { folderId, onClose } = props;
  if (kind === 'sheet') return <NewSheetForm {...props} onCreate={create.sheet} />;
  if (kind === 'folder')
    return (
      <NewFolderForm
        live={props.live}
        onCreate={(name, visibility) => create.folder(folderId, name, visibility)}
        onClose={onClose}
      />
    );
  if (kind === 'map')
    return (
      <LibraryMapForm
        {...props}
        api={props.mapsApi}
        onSaved={(map) => {
          create.mapSaved(map);
          onClose();
        }}
      />
    );
  if (kind === 'image')
    return (
      <LibraryImageForm
        {...props}
        onSaved={(image) => {
          create.imageSaved(image);
          onClose();
        }}
      />
    );
  return (
    <NamedItemForm
      {...NAMED_ITEMS[kind]}
      live={props.live}
      onCreate={(name) => create[kind](folderId, name)}
      onClose={onClose}
    >
      {kind === 'sheetTemplate' && (
        <Button
          type="button"
          variant="link"
          className="self-start px-0"
          disabled={!props.live}
          onClick={() => {
            create.importSheetTemplate(folderId);
            onClose();
          }}
        >
          Importar de um arquivo
        </Button>
      )}
    </NamedItemForm>
  );
}
