import { undo } from '@codemirror/commands';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CodeEditor, { type CodeLanguage } from '@/code-editor/code-editor';
import { codeTextOf, codeViewOf, replaceCode } from '../support/code-editor-input';

const LABEL = 'JS do modelo';

function Field({
  value,
  language = 'javascript',
  changes,
}: Readonly<{ value: string; language?: CodeLanguage; changes: string[] }>) {
  return (
    <CodeEditor
      value={value}
      language={language}
      label={LABEL}
      onChange={(next) => changes.push(next)}
    />
  );
}

describe('CodeEditor', () => {
  it('shows the value in a text field named by the label', () => {
    render(<Field value="lorkarium.ready();" changes={[]} />);
    expect(screen.getByRole('textbox', { name: LABEL })).toHaveTextContent('lorkarium.ready();');
    expect(codeTextOf(LABEL)).toBe('lorkarium.ready();');
  });

  it('what the author types goes to onChange as the whole text', () => {
    const changes: string[] = [];
    render(<Field value="a" changes={changes} />);
    const view = codeViewOf(LABEL);
    act(() => view.dispatch({ changes: { from: 1, insert: 'b' } }));
    expect(changes).toEqual(['ab']);
  });

  it('a value changed from outside replaces the text', () => {
    const { rerender } = render(<Field value="old" changes={[]} />);
    rerender(<Field value="loaded version" changes={[]} />);
    expect(codeTextOf(LABEL)).toBe('loaded version');
  });

  it('the parent echoing the typed text back keeps the undo history', () => {
    const changes: string[] = [];
    const { rerender } = render(<Field value="a" changes={changes} />);
    replaceCode(LABEL, 'ab');
    rerender(<Field value="ab" changes={changes} />);
    act(() => void undo(codeViewOf(LABEL)));
    expect(codeTextOf(LABEL)).toBe('a');
  });

  it('highlights the language: a JS keyword gets a token class', () => {
    render(<Field value="const pv = 20;" changes={[]} />);
    const content = screen.getByRole('textbox', { name: LABEL });
    const keyword = [...content.querySelectorAll('span')].find(
      (span) => span.textContent === 'const',
    );
    expect(keyword?.className).toMatch(/\S/);
  });

  // The rules of the app's theme as CodeMirror mounted them (scoped by its own class).
  function themeRulesFor(selector: string): string[] {
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent);
    const rules = styles.join('\n').split('\n');
    // CodeMirror's own base themes use hex colors; the app's theme never does.
    return rules.filter((rule) => rule.includes(selector) && !/#[0-9a-f]{3,8};/i.test(rule));
  }

  it('the selection is the translucent gold, stronger while the field has the focus', () => {
    render(<Field value="const pv = 20;" changes={[]} />);
    const rules = themeRulesFor('.cm-selectionBackground').join(' ');
    expect(rules).toContain('rgba(197, 164, 109, 0.28)');
    expect(rules).toMatch(/cm-focused[^{]*cm-selectionBackground[^}]*rgba\(197, 164, 109, 0\.4\)/);
  });

  it('the active line is translucent, so the selection drawn under it still shows', () => {
    render(<Field value="const pv = 20;" changes={[]} />);
    const [activeLine] = themeRulesFor('.cm-activeLine {');
    const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(activeLine ?? '')?.[1]);
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(0.2);
  });

  it('the cursor is a 2px gold bar', () => {
    render(<Field value="x" changes={[]} />);
    expect(themeRulesFor('.cm-cursor').join(' ')).toContain('2px solid var(--primary)');
  });

  it('unmounting destroys the editor', () => {
    const { unmount, container } = render(<Field value="x" changes={[]} />);
    const view = codeViewOf(LABEL);
    unmount();
    expect(container.querySelector('.cm-editor')).toBeNull();
    expect(view.dom.isConnected).toBe(false);
  });
});
