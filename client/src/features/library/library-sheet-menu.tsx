import { sheetVisibilityDto, type SheetSummaryDto } from '@lorkarium/contracts';
import {
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { sheetKey } from '@/lib/library-entries';
import {
  DELETE_SHEET,
  GIVE_SHEET,
  NO_PLAYERS,
  OPEN_SHEET,
  OPEN_SHEET_WINDOW,
  RELEASE_FROM_HOLDER,
  SHEET_VISIBILITY_LABEL,
  SHEET_VISIBILITY_TITLE,
} from '@/features/sheets/sheet-messages';
import { DeleteConfirmDialog } from './delete-scene-dialog';
import type { LibraryIntent } from './library-intents';
import type { TreeMaster } from './library-tree-menu';

type SheetChanges = Extract<LibraryIntent, { intent: 'updateSheet' }>['changes'];

export type SheetTreeItemsProps = Readonly<{
  master: TreeMaster;
  sheet: SheetSummaryDto;
  startRename: (key: string) => void;
  askDelete: (sheet: SheetSummaryDto) => void;
}>;

/** The master's menu on a sheet of the tree: open it (tab or window), rename it in place, give it
 *  to a player, take it from its holder, choose who sees it, and delete it after a yes.
 *
 *  Example: `<SheetTreeItems master={master} sheet={sheet} startRename={rename} askDelete={ask} />` */
export function SheetTreeItems(props: SheetTreeItemsProps): React.JSX.Element {
  const { master, sheet } = props;
  const off = !master.live;
  const change = (changes: Omit<SheetChanges, 'actionId'>): void =>
    void master.submit({
      intent: 'updateSheet',
      sheetId: sheet.id,
      changes: { actionId: crypto.randomUUID(), ...changes },
    });
  return (
    <>
      <ContextMenuItem onSelect={() => master.openSheet?.(sheet, false)}>
        {OPEN_SHEET}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => master.openSheet?.(sheet, true)}>
        {OPEN_SHEET_WINDOW}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={off} onSelect={() => props.startRename(sheetKey(sheet.id))}>
        Renomear
      </ContextMenuItem>
      <GiveItems master={master} sheet={sheet} change={change} />
      <ContextMenuItem
        disabled={off || sheet.tokenId === null}
        onSelect={() => change({ holder: null })}
      >
        {RELEASE_FROM_HOLDER}
      </ContextMenuItem>
      <VisibilityItems master={master} sheet={sheet} change={change} />
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" disabled={off} onSelect={() => props.askDelete(sheet)}>
        {DELETE_SHEET}
      </ContextMenuItem>
    </>
  );
}

type ChangeProps = Readonly<{
  master: TreeMaster;
  sheet: SheetSummaryDto;
  change: (changes: Omit<SheetChanges, 'actionId'>) => void;
}>;

function GiveItems({ master, sheet, change }: ChangeProps): React.JSX.Element {
  const players = master.players ?? [];
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={!master.live}>{GIVE_SHEET}</ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {players.length === 0 && <ContextMenuItem disabled>{NO_PLAYERS}</ContextMenuItem>}
        {players.map((player) => (
          <ContextMenuItem
            key={player.userId}
            disabled={sheet.memberId === player.userId}
            onSelect={() => change({ holder: { memberId: player.userId } })}
          >
            {player.label}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

function VisibilityItems({ master, sheet, change }: ChangeProps): React.JSX.Element {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={!master.live}>
        {SHEET_VISIBILITY_TITLE}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <ContextMenuRadioGroup value={sheet.visibility}>
          {sheetVisibilityDto.options.map((option) => (
            <ContextMenuRadioItem
              key={option}
              value={option}
              onSelect={() => option !== sheet.visibility && change({ visibility: option })}
            >
              {SHEET_VISIBILITY_LABEL[option]}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** "Nova ficha" (or "… aqui") of a folder or the root, when the library can make sheets.
 *
 *  Example: `<NewSheetItem master={master} folderId={ato1.id} label="Nova ficha aqui" />` */
export function NewSheetItem({
  master,
  folderId,
  label,
}: Readonly<{ master: TreeMaster; folderId: string | null; label: string }>) {
  if (!master.createSheet) return null;
  return (
    <ContextMenuItem disabled={!master.live} onSelect={() => master.createSheet?.(folderId)}>
      {label}
    </ContextMenuItem>
  );
}

/** "Excluir Lyra de Vharn?": the sheet and its values go for everyone; its template stays.
 *
 *  Example: `<DeleteSheetTask master={master} sheet={sheet} onClose={close} />` */
export function DeleteSheetTask({
  master,
  sheet,
  onClose,
}: Readonly<{ master: TreeMaster; sheet: SheetSummaryDto; onClose: () => void }>) {
  return (
    <DeleteConfirmDialog
      title={`Excluir ${sheet.name}?`}
      description="A ficha e os valores guardados nela somem para todos. O modelo continua na biblioteca."
      onClose={onClose}
      onConfirm={() =>
        void master.submit({
          intent: 'removeSheet',
          sheetId: sheet.id,
          changes: { actionId: crypto.randomUUID() },
        })
      }
    />
  );
}
