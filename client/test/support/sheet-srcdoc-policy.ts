import { createHash } from 'node:crypto';

/** The hash the browser computes for a script: SHA-256 over the UTF-8 of the text it parsed out
 *  of the element, in base64, by node:crypto (independent of the client's own SHA-256).
 *
 *  Example: `browserScriptHashOf('\nlorkarium.ready();') // 'q1…='` */
export function browserScriptHashOf(scriptText: string): string {
  return createHash('sha256').update(scriptText, 'utf8').digest('base64');
}

/** The Content-Security-Policy the srcdoc carries in its `<meta>`.
 *
 *  Example: `sheetPolicyOf(srcdoc) // "default-src 'none'; script-src 'sha256-…'; …"` */
export function sheetPolicyOf(srcdoc: string): string {
  const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(srcdoc)?.[1];
  if (policy === undefined)
    throw new Error(`the srcdoc has no policy meta; start: ${srcdoc.slice(0, 120)}`);
  return policy;
}

/** The `script-src` directive of a policy, or `''` when it has none.
 *
 *  Example: `scriptSrcOf(sheetPolicyOf(srcdoc)) // "script-src 'sha256-…' 'sha256-…'"` */
export function scriptSrcOf(policy: string): string {
  return policy.split('; ').find((directive) => directive.startsWith('script-src ')) ?? '';
}

/** The text of every attribute-free script element of the srcdoc, in order.
 *
 *  Example: `scriptTextsOf(srcdoc)[1] // '\nlorkarium.ready();'` */
export function scriptTextsOf(srcdoc: string): string[] {
  return Array.from(srcdoc.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1] ?? '');
}

/** The `script-src` a srcdoc must carry: one `'sha256-…'` per script element, in order.
 *
 *  Example: `expect(scriptSrcOf(sheetPolicyOf(srcdoc))).toBe(expectedScriptSrcOf(srcdoc))` */
export function expectedScriptSrcOf(srcdoc: string): string {
  const sources = scriptTextsOf(srcdoc).map((text) => `'sha256-${browserScriptHashOf(text)}'`);
  return `script-src ${sources.join(' ')}`;
}
