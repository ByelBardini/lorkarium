import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

/** The languages a sheet template is written in. */
export type CodeLanguage = 'html' | 'css' | 'javascript';

const LANGUAGES: Readonly<Record<CodeLanguage, () => Extension>> = {
  html: () => html(),
  css: () => css(),
  javascript: () => javascript(),
};

// The app is dark only: CodeMirror's default style is meant for a light page.
const appHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: '#c5a46d' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#9fb88f' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#d0806a' },
  { tag: [tags.comment, tags.meta], color: '#8a8f99', fontStyle: 'italic' },
  { tag: [tags.tagName, tags.className, tags.typeName], color: '#8a9bb8' },
  { tag: [tags.attributeName, tags.propertyName], color: '#d5d0c4' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#d4b57e' },
  { tag: tags.invalid, color: '#d6455d' },
]);

// The selection is the gold accent, translucent so the text stays readable; the active line is
// translucent too, because CodeMirror draws the selection *under* the lines and an opaque
// active line hid it (the selection "vanished" on the dark theme).
const SELECTION = 'rgba(197, 164, 109, 0.28)';
const SELECTION_FOCUSED = 'rgba(197, 164, 109, 0.4)';
const ACTIVE_LINE = 'rgba(234, 229, 218, 0.045)';

/** The CodeMirror theme rules of the app (dark only). Exported for the spec of the colors. */
export const CODE_EDITOR_THEME_RULES = {
  '&': { height: '100%', backgroundColor: 'var(--background)', color: 'var(--foreground)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--primary)' },
  '.cm-gutters': {
    backgroundColor: 'var(--panel)',
    color: 'var(--placeholder)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: ACTIVE_LINE },
  '.cm-activeLineGutter': { backgroundColor: 'var(--muted)', color: 'var(--foreground)' },
  '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: SELECTION },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: SELECTION_FOCUSED,
  },
  '.cm-selectionMatch': { backgroundColor: 'rgba(138, 155, 184, 0.25)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'rgba(197, 164, 109, 0.22)',
    outline: '1px solid rgba(197, 164, 109, 0.6)',
  },
  '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '-2px' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--primary)' },
  '.cm-searchMatch': { backgroundColor: 'rgba(197, 164, 109, 0.25)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(197, 164, 109, 0.5)' },
  '.cm-panels': { backgroundColor: 'var(--card)', color: 'var(--foreground)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-panel input, .cm-panel button': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    border: '1px solid var(--input)',
    borderRadius: '4px',
  },
} as const;

const appTheme = EditorView.theme(CODE_EDITOR_THEME_RULES, { dark: true });

/** Everything a code field has besides its text: keys (undo, search, Tab indents; Esc then Tab
 *  leaves), line numbers, the app colors and the language.
 *
 *  Example: `EditorState.create({ doc, extensions: codeEditorExtensions('css', 'CSS do modelo') })` */
export function codeEditorExtensions(language: CodeLanguage, label: string): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    syntaxHighlighting(appHighlight),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    LANGUAGES[language](),
    appTheme,
    EditorView.contentAttributes.of({ 'aria-label': label }),
  ];
}
