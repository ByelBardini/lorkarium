const PATH_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
const ARC_PARAMETERS = 7;
// An arc's large-arc and sweep flags are one digit each and may touch what follows ("012.2").
const ARC_FLAG_SLOTS = new Set([3, 4]);

/** SVG path data with every command and number apart, arc flags included: minifiers write
 *  `a1 1 0 012 0`, which the canvas SVG parser reads as one number.
 *
 *  Example: `spacedPathData('a1.6 1.6 0 012.2 0') // 'a 1.6 1.6 0 0 1 2.2 0'` */
export function spacedPathData(path: string): string {
  const tokens: string[] = [];
  let command = '';
  let slot = 0;
  for (let index = 0; index < path.length;) {
    const char = path.charAt(index);
    if (/[\s,]/.test(char)) index += 1;
    else if (/[a-z]/i.test(char)) {
      [command, slot] = [char, 0];
      tokens.push(char);
      index += 1;
    } else {
      const token = nextToken(path, index, command, slot);
      tokens.push(token);
      [index, slot] = [index + token.length, slot + 1];
    }
  }
  return tokens.join(' ');
}

function nextToken(path: string, index: number, command: string, slot: number): string {
  const isFlag = /a/i.test(command) && ARC_FLAG_SLOTS.has(slot % ARC_PARAMETERS);
  if (isFlag) return path.charAt(index);
  const number = PATH_NUMBER.exec(path.slice(index))?.[0];
  if (!number)
    throw new Error(`expected a number in SVG path data at ${index}, got "${path.slice(index)}"`);
  return number;
}
