import type { SheetSummaryDto } from '@lorkarium/contracts';
import { StarIcon } from 'lucide-react';
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
import { useSheetRoom, type SheetRoom } from './sheet-room-context';
import { useTokenSheets } from './use-token-sheets';

export type CharacterSheetButtonProps = Readonly<{
  characterId: string;
  /** Its player, who a sheet the master makes here is for; `null` = nobody plays it now. */
  memberId: string | null;
  /** The sheet "Abrir ficha de Lyra" opens; `null` = none chosen yet. */
  mainSheetId: string | null;
  /** The character's name: "Abrir ficha de Lyra", "Fichas de Lyra". */
  name: string;
  isMaster: boolean;
  /** Its player or a master: "Tornar principal" on the other sheets. */
  canControl: boolean;
  onMakeMain: (sheetId: string) => void;
}>;

/** The sheets of a character on the "Na mesa" card: "Abrir ficha de Lyra" opens the main one (or
 *  the only one) in one click; with several, the menu "Fichas de Lyra" lists them, the main one
 *  marked, and "Tornar principal ▸" for its player and the masters. The master always gets the
 *  menu, with "Nova ficha ▸ <template>" and "Dar ficha existente ▸ <sheets nobody holds>".
 *
 *  Example: `<CharacterSheetButton characterId={lyra.id} memberId={bia.userId} mainSheetId={lyra.mainSheetId} name="Lyra" isMaster={false} canControl onMakeMain={make} />` */
export function CharacterSheetButton(props: CharacterSheetButtonProps): React.JSX.Element | null {
  const room = useSheetRoom();
  const read = useTokenSheets(room, { characterId: props.characterId });
  if (!room || read.status === 'loading') return null;
  const { sheets } = read;
  const main = mainSheetOf(sheets, props.mainSheetId);
  const withMenu = props.isMaster || sheets.length > 1;
  return (
    <>
      {main && (
        <SheetIconButton
          label={`${OPEN_SHEET} de ${props.name}`}
          onClick={() => room.actions.open(main)}
        />
      )}
      {withMenu && <CharacterSheetMenu {...props} room={room} sheets={sheets} />}
    </>
  );
}

// The main sheet when the reader may read it; with no main, the only sheet stands in.
function mainSheetOf(
  sheets: readonly SheetSummaryDto[],
  mainSheetId: string | null,
): SheetSummaryDto | undefined {
  const main = sheets.find(({ id }) => id === mainSheetId);
  if (main) return main;
  return sheets.length === 1 ? sheets[0] : undefined;
}

type MenuProps = CharacterSheetButtonProps &
  Readonly<{ room: SheetRoom; sheets: readonly SheetSummaryDto[] }>;

function CharacterSheetMenu(props: MenuProps): React.JSX.Element {
  const others = props.sheets.filter(({ id }) => id !== props.mainSheetId);
  const canMakeMain = props.canControl && props.sheets.length > 1 && others.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SheetIconButton label={`Fichas de ${props.name}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <SheetItems {...props} />
        {canMakeMain && <MakeMainItems sheets={others} onMakeMain={props.onMakeMain} />}
        {props.isMaster && <MasterItems {...props} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
