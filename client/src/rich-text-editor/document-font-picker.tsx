import type { Editor } from '@tiptap/core';
import { DOCUMENT_FONTS } from '@lorkarium/contracts';
import { documentFontOf, documentFontStack, SYMBOL_FONTS } from './document-fonts';
import { ToolbarMenuSelect, type ToolbarMenuOption } from './toolbar-menu-select';

const FONT_OPTIONS: readonly ToolbarMenuOption[] = [
  { value: '', label: 'Fonte padrão', separated: true },
  ...DOCUMENT_FONTS.map((font) => ({
    value: font,
    label: font,
    style: SYMBOL_FONTS.has(font) ? undefined : { fontFamily: documentFontStack(font) },
  })),
];

/** The font of the selection, each name previewed in its own font (but the symbol fonts);
 *  "Fonte padrão" takes the font off.
 *
 *  Example: `<DocumentFontPicker editor={editor} />` */
export function DocumentFontPicker({ editor }: { editor: Editor }): React.JSX.Element {
  const current = documentFontOf(String(editor.getAttributes('textStyle').fontFamily ?? ''));
  return (
    <ToolbarMenuSelect
      label="Fonte"
      value={current ?? ''}
      options={FONT_OPTIONS}
      className="w-32"
      onChoose={(value) => {
        const font = documentFontOf(value);
        if (font) editor.chain().focus().setFontFamily(font).run();
        else editor.chain().focus().unsetFontFamily().run();
      }}
    />
  );
}
