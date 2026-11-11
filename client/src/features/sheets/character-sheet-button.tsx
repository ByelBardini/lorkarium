import type { SheetSummaryDto } from '@lorkarium/contracts';
import { StarIcon } from 'lucide-react';
import { useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MAKE_MAIN_SHEET, MAIN_SHEET_MARK, OPEN_SHEET } from './sheet-messages';
import { GiveSpareSheetItems, NewSheetItems, SheetIconButton } from './sheet-menu-parts';
import type { SheetRoom } from './sheet-room-context';
import type { CharacterSheets } from './use-character-sheets';

export type CharacterSheetButtonProps = Readonly<{
  /** The character's sheets, read once by the card (`useCharacterSheets`). */
  found: CharacterSheets;
  /** Its player, who a sheet the master makes here is for; `null` = nobody plays it now. */
  memberId: string | null;
  /** The sheet marked "principal" in the menu; `null` = none chosen yet. */
  mainSheetId: string | null;
  /** The character's name: "Abrir ficha de Lyra", "Fichas de Lyra". */
  name: string;
  isMaster: boolean;
  /** Its player or a master: "Tornar principal" on the other sheets. */
  canControl: boolean;
  onMakeMain: (sheetId: string) => void;
}>;

/** The one sheet icon of the "Na mesa" card: with one sheet, "Abrir ficha de Lyra" opens it in
 *  one click; with several, "Fichas de Lyra" lists them to pick from, the main one marked, and
 *  "Tornar principal ▸" for its player and the masters. The master's menu also has "Nova ficha ▸
 *  <template>" and "Dar ficha existente ▸"; on a character with one sheet the click still opens
 *  it, and the right click (or ↓) shows that menu.
 *
 *  Example: `<CharacterSheetButton found={found} memberId={bia.userId} mainSheetId={lyra.mainSheetId} name="Lyra" isMaster={false} canControl onMakeMain={make} />` */
export function CharacterSheetButton(props: CharacterSheetButtonProps): React.JSX.Element | null {
  const { room, sheets } = props.found;
  const only = sheets.length === 1 ? sheets[0] : undefined;
  const openOnly = only ? () => room.actions.open(only) : null;
  if (props.isMaster)
    return <CharacterSheetMenu {...props} room={room} sheets={sheets} openOnly={openOnly} />;
  if (openOnly)
    return <SheetIconButton label={`${OPEN_SHEET} de ${props.name}`} onClick={openOnly} />;
  if (sheets.length === 0) return null;
  return <CharacterSheetMenu {...props} room={room} sheets={sheets} openOnly={null} />;
}

type MenuProps = CharacterSheetButtonProps &
  Readonly<{ room: SheetRoom; sheets: readonly SheetSummaryDto[] }>;

function CharacterSheetMenu(
  props: MenuProps & Readonly<{ openOnly: (() => void) | null }>,
): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const others = props.sheets.filter(({ id }) => id !== props.mainSheetId);
  const canMakeMain = props.canControl && props.sheets.length > 1 && others.length > 0;
  const label = props.openOnly ? `${OPEN_SHEET} de ${props.name}` : `Fichas de ${props.name}`;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild {...(props.openOnly && openFirst(props.openOnly, setOpen))}>
        <SheetIconButton label={label} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <SheetItems {...props} />
        {canMakeMain && <MakeMainItems sheets={others} onMakeMain={props.onMakeMain} />}
        {props.isMaster && <MasterItems {...props} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type TriggerHandlers = Readonly<{
  onPointerDown: (event: PointerEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
}>;

// The menu's trigger skips its own handler once ours prevents the default: the left click, Enter
// and Space open the only sheet; the right click opens the menu, and ↓ still does.
function openFirst(openSheet: () => void, setOpen: (open: boolean) => void): TriggerHandlers {
  return {
    onPointerDown: (event) => {
      if (event.button !== 0 || event.ctrlKey) return;
      event.preventDefault();
      openSheet();
    },
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openSheet();
    },
    onContextMenu: (event) => {
      event.preventDefault();
      setOpen(true);
    },
  };
}

function SheetItems({ room, sheets, mainSheetId }: MenuProps): React.JSX.Element {
  return (
    <>
      {sheets.map((sheet) => (
        <DropdownMenuItem key={sheet.id} onSelect={() => room.actions.open(sheet)}>
          {sheet.name}
          {sheet.id === mainSheetId && (
            <span className="ml-auto flex items-center gap-1 text-xs text-label">
              <StarIcon aria-hidden="true" className="size-3 fill-current" />
              {MAIN_SHEET_MARK}
            </span>
          )}
        </DropdownMenuItem>
      ))}
    </>
  );
}

type MakeMainProps = Readonly<{
  sheets: readonly SheetSummaryDto[];
  onMakeMain: (sheetId: string) => void;
}>;

function MakeMainItems({ sheets, onMakeMain }: MakeMainProps): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{MAKE_MAIN_SHEET}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {sheets.map((sheet) => (
          <DropdownMenuItem key={sheet.id} onSelect={() => onMakeMain(sheet.id)}>
            {sheet.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

// A sheet made or given here is for its player; one nobody plays gets none from the card.
function MasterItems({ room, memberId, name }: MenuProps): React.JSX.Element | null {
  if (memberId === null) return null;
  const holder = { memberId };
  return (
    <>
      <NewSheetItems room={room} holder={holder} holderName={name} />
      <GiveSpareSheetItems room={room} holder={holder} />
    </>
  );
}
