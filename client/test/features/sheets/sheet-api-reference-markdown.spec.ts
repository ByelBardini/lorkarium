import { SHEET_TEMPLATE_SOURCE_MAX_BYTES } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import * as content from '@/features/sheets/sheet-api-reference-content';
import {
  markdownCell,
  SHEET_REFERENCE_AI_CONTEXT,
  SHEET_REFERENCE_MARKDOWN_TITLE,
  sheetApiReferenceMarkdown,
} from '@/features/sheets/sheet-api-reference-markdown';

const markdown = sheetApiReferenceMarkdown();

function sectionOf(title: string): string {
  const start = markdown.indexOf(`\n## ${title}\n`);
  if (start < 0) throw new Error(`no "## ${title}" in the Markdown; expected every section`);
  const next = markdown.indexOf('\n## ', start + 1);
  return markdown.slice(start, next < 0 ? undefined : next);
}

describe('sheetApiReferenceMarkdown', () => {
  it('opens with the title and the context an AI needs: iframe, no network, SDK, three fields', () => {
    expect(
      markdown.startsWith(`${SHEET_REFERENCE_MARKDOWN_TITLE}\n\n${SHEET_REFERENCE_AI_CONTEXT}\n\n`),
    ).toBe(true);
    for (const said of ['iframe isolado', 'sem rede', '`window.lorkarium`', 'HTML', 'CSS', 'JS'])
      expect(SHEET_REFERENCE_AI_CONTEXT).toContain(said);
  });

  it('has every section of the API tab, in its order', () => {
    const titles = Object.values(content.REFERENCE_TITLES);
    const at = titles.map((title) => markdown.indexOf(`\n## ${title}\n`));
    expect(at.every((position) => position > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('each call has its signature, parameters, return, errors and its example in a js block', () => {
    const calls = sectionOf(content.REFERENCE_TITLES.calls);
    for (const call of content.SDK_CALLS) {
      expect(calls).toContain(`### \`${call.signature}\``);
      expect(calls).toContain(`**Devolve:** ${call.returns}`);
      expect(calls).toContain(`\`\`\`js\n${call.example}\n\`\`\``);
      for (const [name, text] of call.params) expect(calls).toContain(`- \`${name}\`: ${text}`);
      if (call.errors.length > 0) expect(calls).toContain(`**Erros:** ${call.errors.join(', ')}`);
    }
  });

  it('the state and the error codes are tables, one row each', () => {
    const state = sectionOf(content.REFERENCE_TITLES.state);
    for (const [field] of content.SHEET_STATE_FIELDS) expect(state).toContain(`| \`${field}\` |`);
    const errors = sectionOf(content.REFERENCE_TITLES.errors);
    expect(errors).toContain('| code | Quando |\n| --- | --- |');
    for (const [code, text] of content.SHEET_ERROR_CODES)
      expect(errors).toContain(`| \`${code}\` | ${text} |`);
  });

  it('the limits carry the real values', () => {
    const limits = sectionOf(content.REFERENCE_TITLES.limits);
    expect(limits).toContain(`${SHEET_TEMPLATE_SOURCE_MAX_BYTES / 1024} KiB`);
    for (const limit of content.SHEET_LIMITS) expect(limits).toContain(`- ${limit}`);
  });

  it('the examples that mix HTML and JS go in an html block, the rest in js', () => {
    expect(markdown).toContain(`\`\`\`html\n${content.FULL_EXAMPLE}\n\`\`\``);
    expect(markdown).toContain(`\`\`\`js\n${content.VALUES_EXAMPLE}\n\`\`\``);
  });

  it('every text of the tab goes in, so nothing is written twice by hand', () => {
    const texts = Object.values(content).filter((entry) => typeof entry === 'string');
    for (const text of texts) expect(markdown).toContain(text);
  });

  it('a table cell escapes its pipes and keeps to one line', () => {
    expect(markdownCell("{ op: 'add' } | { op: 'set' }\nfim")).toBe(
      "{ op: 'add' } \\| { op: 'set' } fim",
    );
  });
});
