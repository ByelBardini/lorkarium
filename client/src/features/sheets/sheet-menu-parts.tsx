import type { SheetHolderDto, SheetSummaryDto } from '@lorkarium/contracts';
import { sheetVisibilityDto } from '@lorkarium/contracts';
import { ScrollTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  GIVE_SPARE_SHEET,
  NEW_SHEET,
  NO_SHEET_TEMPLATES,
  NO_SPARE_SHEETS,
  OPEN_SHEET,
  SHEETS_SUBMENU,
  SHEET_VISIBILITY_LABEL,
  SHEET_VISIBILITY_TITLE,
  defaultSheetName,
} from './sheet-messages';
import type { SheetRoom } from './sheet-room-context';
import { useSheetLibrary } from './use-token-sheets';

type SheetsProps = Readonly<{ room: SheetRoom; sheets: readonly SheetSummaryDto[] }>;

/** "Abrir ficha" for one sheet, "Fichas ▸ <names>" for several, nothing for none.
 *
 *  Example: `<OpenSheetItems room={room} sheets={sheets} />` */
export function OpenSheetItems({ room, sheets }: SheetsProps): React.JSX.Element | null {
  const [only] = sheets;
  if (!only) return null;
  if (sheets.length === 1)
    return (
      <DropdownMenuItem onSelect={() => room.actions.open(only)}>{OPEN_SHEET}</DropdownMenuItem>
    );
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{SHEETS_SUBMENU}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {sheets.map((sheet) => (
          <DropdownMenuItem key={sheet.id} onSelect={() => room.actions.open(sheet)}>
            {sheet.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

type NewSheetProps = Readonly<{ room: SheetRoom; holder: SheetHolderDto; holderName: string }>;

/** The master's "Nova ficha ▸ <template>": a sheet named "<template> · <holder>" for `holder`.
 *
 *  Example: `<NewSheetItems room={room} holder={{ tokenId }} holderName="Goblin" />` */
export function NewSheetItems(props: NewSheetProps): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{NEW_SHEET}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <TemplateItems {...props} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

// Mounted only while the submenu is open: the library is read then, not on every right click.
function TemplateItems({ room, holder, holderName }: NewSheetProps): React.JSX.Element {
  const library = useSheetLibrary(room);
  if (library === null) return <DropdownMenuItem disabled>Carregando modelos…</DropdownMenuItem>;
  if (library.templates.length === 0)
    return <DropdownMenuItem disabled>{NO_SHEET_TEMPLATES}</DropdownMenuItem>;
  return (
    <>
      {library.templates.map((template) => (
        <DropdownMenuItem
          key={template.id}
          onSelect={() =>
            room.actions.create({
              templateId: template.id,
              name: defaultSheetName(template.name, holderName),
              holder,
            })
          }
        >
          {template.name}
        </DropdownMenuItem>
      ))}
    </>
  );
}

type GiveSpareProps = Readonly<{ room: SheetRoom; holder: SheetHolderDto }>;

/** The master's "Dar ficha existente ▸ <sheets nobody holds>".
 *
 *  Example: `<GiveSpareSheetItems room={room} holder={{ memberId: bia }} />` */
export function GiveSpareSheetItems(props: GiveSpareProps): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{GIVE_SPARE_SHEET}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <SpareItems {...props} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function SpareItems({ room, holder }: GiveSpareProps): React.JSX.Element {
  const library = useSheetLibrary(room);
  if (library === null) return <DropdownMenuItem disabled>Carregando fichas…</DropdownMenuItem>;
  if (library.spareSheets.length === 0)
    return <DropdownMenuItem disabled>{NO_SPARE_SHEETS}</DropdownMenuItem>;
  return (
    <>
      {library.spareSheets.map((sheet) => (
        <DropdownMenuItem key={sheet.id} onSelect={() => room.actions.give(sheet, holder)}>
          {sheet.name}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** The master's "Quem vê a ficha ▸" of one sheet (a radio of its visibility).
 *
 *  Example: `<SheetVisibilityItems room={room} sheet={sheet} />` */
export function SheetVisibilityItems({
  room,
  sheet,
}: Readonly<{ room: SheetRoom; sheet: SheetSummaryDto }>): React.JSX.Element {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{SHEET_VISIBILITY_TITLE}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={sheet.visibility}>
          {sheetVisibilityDto.options.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              onSelect={() =>
                option !== sheet.visibility && room.actions.setVisibility(sheet, option)
              }
            >
              {SHEET_VISIBILITY_LABEL[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** The sheet icon button of the "Na mesa" card. Example: `<SheetIconButton label="Abrir ficha de Lyra" />` */
export function SheetIconButton({
  label,
  ...rest
}: Readonly<{ label: string }> & React.ComponentProps<typeof Button>): React.JSX.Element {
  return (
    <Button {...rest} variant="ghost" size="icon-sm" aria-label={label} title={label}>
      <ScrollTextIcon aria-hidden="true" />
    </Button>
  );
}
