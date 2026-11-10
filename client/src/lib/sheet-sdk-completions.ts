/** A call of the SDK as the reference writes it (`SdkCallDoc` fits). */
export type SdkReferenceCall = Readonly<{ signature: string; summary: string }>;

/** One suggestion after `lorkarium.`: a group of calls (`bars`) or a call (`adjust`). */
export type SdkCompletion = Readonly<{
  label: string;
  kind: 'namespace' | 'function';
  signature: string;
  summary: string;
}>;

/** What to suggest at the end of a text: the options and where the typed name starts. */
export type SdkCompletionMatch = Readonly<{ from: number; options: readonly SdkCompletion[] }>;

/** Reads the text of a line up to the cursor; `null` = nothing of the SDK to suggest there. */
export type SdkCompletionSource = (textBefore: string) => SdkCompletionMatch | null;

const ROOT = 'lorkarium';
// `lorkarium` (not part of a longer name), any members, a dot and the name being typed.
const MEMBER_AT_END = /(?<![\w$])lorkarium((?:\.[A-Za-z_$][\w$]*)*)\.([A-Za-z_$][\w$]*)?$/u;

/** The suggestions of the sheet SDK, built from the API reference so both say the same thing:
 *  after `lorkarium.` the groups and calls, after `lorkarium.bars.` the bar calls, each with the
 *  signature and the summary of the reference.
 *
 *  Example: `sheetSdkCompletionSource(SDK_CALLS)('lorkarium.bars.')?.options // list, get, …` */
export function sheetSdkCompletionSource(calls: readonly SdkReferenceCall[]): SdkCompletionSource {
  const tree = completionTreeOf(calls);
  return (textBefore) => {
    const match = MEMBER_AT_END.exec(textBefore);
    if (!match) return null;
    const options = tree.get(`${ROOT}${match[1] ?? ''}`);
    if (!options) return null;
    return { from: textBefore.length - (match[2] ?? '').length, options };
  };
}

// Parent path ("lorkarium.bars") → its members, in the order the reference shows them.
function completionTreeOf(calls: readonly SdkReferenceCall[]): Map<string, SdkCompletion[]> {
  const tree = new Map<string, SdkCompletion[]>();
  for (const call of calls) {
    const path = memberPathOf(call.signature);
    path.forEach((label, index) => {
      const parent = [ROOT, ...path.slice(0, index)].join('.');
      const leaf = index === path.length - 1;
      addOnce(tree, parent, leaf ? functionOf(label, call) : namespaceOf(parent, label));
    });
  }
  for (const options of tree.values()) {
    for (const at of options.keys()) summarizeGroup(tree, options, at);
  }
  return tree;
}

function memberPathOf(signature: string): string[] {
  const [root, ...path] = (signature.split('(')[0] ?? '').split('.');
  if (root === ROOT && path.length > 0) return path;
  throw new Error(
    `SDK reference signature "${signature}" is not a call of the SDK; expected "lorkarium.<name>(…)"`,
  );
}

function addOnce(tree: Map<string, SdkCompletion[]>, parent: string, option: SdkCompletion): void {
  const options = tree.get(parent) ?? [];
  if (!options.some(({ label }) => label === option.label)) options.push(option);
  tree.set(parent, options);
}

function functionOf(label: string, call: SdkReferenceCall): SdkCompletion {
  return { label, kind: 'function', signature: call.signature, summary: call.summary };
}

function namespaceOf(parent: string, label: string): SdkCompletion {
  return { label, kind: 'namespace', signature: `${parent}.${label}`, summary: '' };
}

// A group's summary lists its calls, known only once every call is in the tree.
function summarizeGroup(
  tree: Map<string, SdkCompletion[]>,
  options: SdkCompletion[],
  at: number,
): void {
  const option = options[at];
  if (option?.kind !== 'namespace') return;
  const members = (tree.get(option.signature) ?? []).map(({ label }) => label);
  options[at] = { ...option, summary: `Funções: ${members.join(', ')}` };
}
