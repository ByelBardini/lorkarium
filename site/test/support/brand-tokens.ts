export interface SourceText {
  path: string;
  text: string;
}

const BRAND_REFERENCE = /var\(\s*(--brand-[\w-]+)/g;
const BRAND_DECLARATION = /(--brand-[\w-]+)\s*:/g;

/**
 * Every `var(--brand-*)` in the given sources that the brand stylesheet does not declare.
 * Example: `undeclaredBrandTokens([{ path: 'a.css', text: 'var(--brand-x)' }], tokensCss) // ['a.css uses --brand-x, …']`
 */
export function undeclaredBrandTokens(sources: SourceText[], brandCss: string): string[] {
  const declared = new Set([...brandCss.matchAll(BRAND_DECLARATION)].map((match) => match[1]));
  return sources.flatMap(({ path, text }) =>
    [...new Set([...text.matchAll(BRAND_REFERENCE)].map((match) => match[1]))]
      .filter((token) => !declared.has(token))
      .map((token) => `${path} uses ${token}, which @lorkarium/brand/tokens.css does not declare`),
  );
}
