import { useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Clipboard } from '@/services/clipboard';
import type { EditableField, FieldEditing } from '@/services/field-editing';
import {
  textFieldMenuItemsOf,
  type TextFieldAction,
  type TextFieldMenuItem,
} from './text-field-menu-items';
import { editableFieldOf, textFieldStateOf } from './text-field-target';

export type TextFieldMenuProps = Readonly<{
  /** Only the desktop shell turns the browser's menu off; the web keeps it. */
  isDesktop: boolean;
  clipboard: Clipboard;
  fieldEditing: FieldEditing;
}>;

type OpenFieldMenu = Readonly<{
  field: EditableField;
  x: number;
  y: number;
  items: TextFieldMenuItem[];
  /** A new right click remounts the menu at the new pointer. */
  serial: number;
}>;

/** The Lorkarium menu of a text field (Recortar, Copiar, Colar, Selecionar tudo), opened by a
 *  right click on any `input`/`textarea` of the page, on the desktop shell only.
 *
 *  Example: `<TextFieldMenu isDesktop clipboard={clipboard} fieldEditing={fieldEditing} />` */
export function TextFieldMenu({
  isDesktop,
  clipboard,
  fieldEditing,
}: TextFieldMenuProps): React.JSX.Element | null {
  const [menu, setMenu] = useState<OpenFieldMenu | null>(null);
  useFieldRightClick(isDesktop, setMenu);
  if (!menu) return null;
  const run = (action: TextFieldAction): void => {
    void runFieldAction({ action, field: menu.field, clipboard, fieldEditing });
  };
  return (
    <FieldMenuAtPointer key={menu.serial} menu={menu} onRun={run} onClose={() => setMenu(null)} />
  );
}

function useFieldRightClick(
  isDesktop: boolean,
  open: (update: (previous: OpenFieldMenu | null) => OpenFieldMenu) => void,
): void {
  useEffect(() => {
    if (!isDesktop) return;
    // On the document, so it runs after React's root listener: a Radix context menu that took
    // the click has already called `preventDefault`.
    const openOnField = (event: MouseEvent): void => {
      if (event.defaultPrevented) return;
      const field = editableFieldOf(event.target);
      if (!field) return;
      event.preventDefault();
      const items = textFieldMenuItemsOf(textFieldStateOf(field));
      const { clientX: x, clientY: y } = event;
      open((previous) => ({ field, x, y, items, serial: (previous?.serial ?? 0) + 1 }));
    };
    document.addEventListener('contextmenu', openOnField);
    return () => document.removeEventListener('contextmenu', openOnField);
  }, [isDesktop, open]);
}

type FieldMenuAtPointerProps = Readonly<{
  menu: OpenFieldMenu;
  onRun: (action: TextFieldAction) => void;
  onClose: () => void;
}>;

function FieldMenuAtPointer({ menu, onRun, onClose }: FieldMenuAtPointerProps): React.JSX.Element {
  // Run only once the menu has closed: while it is open its focus trap pulls the focus back from
  // the field, and the editing commands act on whatever has the focus.
  const chosen = useRef<TextFieldAction | null>(null);
  const closeAndRefocus = (event: Event): void => {
    event.preventDefault();
    menu.field.focus();
    if (chosen.current) onRun(chosen.current);
  };
  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="fixed size-0" style={{ left: menu.x, top: menu.y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={2} className="w-auto" onCloseAutoFocus={closeAndRefocus}>
        {menu.items.map((item) => (
          <DropdownMenuItem
            key={item.action}
            disabled={!item.enabled}
            onSelect={() => (chosen.current = item.action)}
          >
            {item.label}
            <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type FieldActionRun = Readonly<{
  action: TextFieldAction;
  field: EditableField;
  clipboard: Clipboard;
  fieldEditing: FieldEditing;
}>;

async function runFieldAction({
  action,
  field,
  clipboard,
  fieldEditing,
}: FieldActionRun): Promise<void> {
  if (action !== 'paste') {
    fieldEditing[action](field);
    return;
  }
  const text = await clipboard.readText();
  // Refused (the shell did not grant the read): nothing to paste, the field stays as it was.
  if (text === null) return;
  fieldEditing.insertText(field, text);
}
