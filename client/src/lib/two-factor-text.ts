const SECRET_GROUP = 4;

/** The setup key as the person types it into the app: groups of 4, spaced, upper case.
 *
 *  Example: `groupedSecret('jbswy3dpehpk3pxp') // 'JBSW Y3DP EHPK 3PXP'` */
export function groupedSecret(secret: string): string {
  const compact = secret.replace(/\s/g, '').toUpperCase();
  const groups: string[] = [];
  for (let start = 0; start < compact.length; start += SECRET_GROUP) {
    groups.push(compact.slice(start, start + SECRET_GROUP));
  }
  return groups.join(' ');
}

/** The recovery codes as the downloaded `.txt` keeps them: a heading, one code per line.
 *
 *  Example: `recoveryCodesText(['k7m2p-9qrst'], '@ana').split('\n').at(-2) // 'k7m2p-9qrst'` */
export function recoveryCodesText(codes: readonly string[], username: string): string {
  const heading = [
    `Lorkarium · códigos de recuperação de ${username}`,
    'Cada código entra uma vez só, no lugar do código do app.',
    '',
  ];
  return [...heading, ...codes, ''].join('\n');
}
