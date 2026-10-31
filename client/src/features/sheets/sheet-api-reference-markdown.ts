import {
  CALL_DETAIL_LABELS,
  ERROR_HANDLING_EXAMPLE,
  ERRORS_INTRO,
  ERRORS_TABLE_HEAD,
  FIND_BAR_EXAMPLE,
  FIND_BAR_STEPS,
  FULL_EXAMPLE,
  INPUT_BINDING_EXAMPLE,
  INPUT_BINDING_TITLE,
  REFERENCE_TITLES,
  SDK_CALLS,
  SHEET_ERROR_CODES,
  SHEET_LIFECYCLE_STEPS,
  SHEET_LIFECYCLE_WARNING,
  SHEET_LIMITS,
  SHEET_STATE_FIELDS,
  STATE_INTRO,
  STATE_TABLE_HEAD,
  TOKEN_IMAGE_CAPTION,
  TOKEN_IMAGE_EXAMPLE,
  VALUES_EXAMPLE,
  VALUES_INTRO,
  type ReferenceRow,
  type SdkCallDoc,
} from './sheet-api-reference-content';

export const SHEET_REFERENCE_MARKDOWN_TITLE = '# Fichas do Lorkarium: referência do SDK';

/** What an AI reading the copied reference needs to know before the reference itself. */
export const SHEET_REFERENCE_AI_CONTEXT = [
  'Contexto: no Lorkarium (mesa virtual de RPG), uma ficha é uma página escrita pelo mestre em HTML, CSS e JS. Ela roda num iframe isolado (sandbox, origem opaca), sem rede nenhuma (fetch, imagens, fontes e scripts externos são bloqueados), e só conversa com a mesa pelo SDK `window.lorkarium` descrito abaixo.',
  'O editor do modelo de ficha separa o código em três campos: HTML (o conteúdo do <body>, sem <html>, <head> nem <script>), CSS (vai num <style> no <head>) e JS (roda num <script> depois do HTML, então o DOM já existe). Ao escrever uma ficha, entregue os três separados. O que a ficha escreve no console (console.log, erros não tratados, recusas do SDK sem catch) aparece no painel Console sob a prévia do editor.',
].join('\n\n');

// A fence the code inside can never close: one backtick more than its longest run.
function fenced(code: string, language: string): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${code}\n${fence}`;
}

// The examples that mix the HTML and the JS start with an HTML comment.
function codeBlock(code: string): string {
  return fenced(code, code.startsWith('<!--') ? 'html' : 'js');
}

/** A table cell's text: a `|` would split the column and a newline end the row.
 *
 *  Example: `markdownCell('a | b') // 'a \| b'` */
export function markdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function table(head: readonly [string, string], rows: readonly ReferenceRow[]): string {
  const lines = rows.map(([name, text]) => `| \`${markdownCell(name)}\` | ${markdownCell(text)} |`);
  return [`| ${head[0]} | ${head[1]} |`, '| --- | --- |', ...lines].join('\n');
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function section(title: string, ...parts: readonly string[]): string {
  return [`## ${title}`, ...parts].join('\n\n');
}

function callMarkdown(call: SdkCallDoc): string {
  const params = call.params.map(([name, text]) => `- \`${name}\`: ${text}`).join('\n');
  return [
    `### \`${call.signature}\``,
    call.summary,
    ...(call.params.length > 0 ? [`**${CALL_DETAIL_LABELS.params}:**\n${params}`] : []),
    `**${CALL_DETAIL_LABELS.returns}:** ${call.returns}`,
    ...(call.errors.length > 0
      ? [`**${CALL_DETAIL_LABELS.errors}:** ${call.errors.join(', ')}`]
      : []),
    codeBlock(call.example),
  ].join('\n\n');
}

function lifecycleMarkdown(): string {
  const steps = SHEET_LIFECYCLE_STEPS.map((step, at) => `${at + 1}. ${step}`).join('\n');
  return section(REFERENCE_TITLES.lifecycle, steps, `> ${SHEET_LIFECYCLE_WARNING}`);
}

function stateMarkdown(): string {
  const fields = table(STATE_TABLE_HEAD, SHEET_STATE_FIELDS);
  return section(
    REFERENCE_TITLES.state,
    STATE_INTRO,
    fields,
    TOKEN_IMAGE_CAPTION,
    codeBlock(TOKEN_IMAGE_EXAMPLE),
  );
}

function valuesMarkdown(): string {
  const binding = `### ${INPUT_BINDING_TITLE}\n\n${codeBlock(INPUT_BINDING_EXAMPLE)}`;
  return section(REFERENCE_TITLES.values, VALUES_INTRO, codeBlock(VALUES_EXAMPLE), binding);
}

function errorsMarkdown(): string {
  const codes = table(ERRORS_TABLE_HEAD, SHEET_ERROR_CODES);
  return section(REFERENCE_TITLES.errors, ERRORS_INTRO, codes, codeBlock(ERROR_HANDLING_EXAMPLE));
}

/** The whole API reference as Markdown, built from the same content the "API" tab shows,
 *  opened by a paragraph that tells an AI what a sheet is (for "Copiar documentação").
 *
 *  Example: `await clipboard.copy(sheetApiReferenceMarkdown())` */
export function sheetApiReferenceMarkdown(): string {
  return (
    [
      SHEET_REFERENCE_MARKDOWN_TITLE,
      SHEET_REFERENCE_AI_CONTEXT,
      lifecycleMarkdown(),
      stateMarkdown(),
      section(REFERENCE_TITLES.calls, ...SDK_CALLS.map(callMarkdown)),
      section(REFERENCE_TITLES.findBar, bullets(FIND_BAR_STEPS), codeBlock(FIND_BAR_EXAMPLE)),
      valuesMarkdown(),
      errorsMarkdown(),
      section(REFERENCE_TITLES.fullExample, codeBlock(FULL_EXAMPLE)),
      section(REFERENCE_TITLES.limits, bullets(SHEET_LIMITS)),
    ].join('\n\n') + '\n'
  );
}
