import {
  DOCUMENT_FONT_SIZE_MAX,
  DOCUMENT_FONT_SIZE_MIN,
  DOCUMENT_FONTS,
  type DocumentFont,
} from '@lorkarium/contracts';

/** A whole font size typed between the contract limits, or null. Example: `typedFontSize(' 13 ')` → 13 */
export function typedFontSize(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const size = Number(text);
  return size >= DOCUMENT_FONT_SIZE_MIN && size <= DOCUMENT_FONT_SIZE_MAX ? size : null;
}

// The stored name stays the contract's; what the page asks for is this stack, so the bundled
// fonts reach their fontsource family ("… Variable") and a missing system font has a fallback.
const FONT_STACKS: Readonly<Record<DocumentFont, string>> = {
  'Hanken Grotesk': "'Hanken Grotesk Variable', 'Hanken Grotesk', sans-serif",
  'Cormorant Garamond': "'Cormorant Garamond Variable', 'Cormorant Garamond', Georgia, serif",
  'JetBrains Mono': "'JetBrains Mono Variable', 'JetBrains Mono', monospace",
  Arial: 'Arial, Helvetica, sans-serif',
  'Arial Black': "'Arial Black', 'Arial Bold', sans-serif",
  Calibri: "Calibri, Carlito, 'Segoe UI', sans-serif",
  Cambria: 'Cambria, Caladea, Georgia, serif',
  'Comic Sans MS': "'Comic Sans MS', 'Comic Neue', cursive",
  Consolas: "Consolas, 'Courier New', monospace",
  'Courier New': "'Courier New', Courier, monospace",
  Garamond: "Garamond, 'EB Garamond', Georgia, serif",
  Georgia: 'Georgia, serif',
  Impact: "Impact, 'Arial Black', sans-serif",
  'Palatino Linotype': "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
  'Segoe UI': "'Segoe UI', system-ui, sans-serif",
  Tahoma: 'Tahoma, Verdana, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Trebuchet MS': "'Trebuchet MS', sans-serif",
  Verdana: 'Verdana, sans-serif',
  Symbol: 'Symbol',
  Webdings: 'Webdings',
  Wingdings: 'Wingdings',
};

/** Fonts whose letters are pictures: their own name can't be previewed in them. */
export const SYMBOL_FONTS: ReadonlySet<DocumentFont> = new Set(['Symbol', 'Webdings', 'Wingdings']);

/** The CSS `font-family` drawn for a document font. Example: `documentFontStack('Arial')` → "Arial, Helvetica, sans-serif" */
export function documentFontStack(font: DocumentFont): string {
  return FONT_STACKS[font];
}

/** The document font named first in a CSS `font-family` (pasted HTML or our own stack), or null
 *  when it is none of them.
 *
 *  Example: `documentFontOf('"Hanken Grotesk Variable", sans-serif')` → 'Hanken Grotesk' */
export function documentFontOf(cssFamily: string): DocumentFont | null {
  const first =
    cssFamily
      .split(',')[0]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? '';
  const name = first.replace(/ Variable$/, '').toLowerCase();
  return DOCUMENT_FONTS.find((font) => font.toLowerCase() === name) ?? null;
}
