import { DICE_ROLL_PARTS_MAX } from '@lorkarium/contracts';
import { SHEET_DICE_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import type { SdkCallDoc } from './sheet-api-reference-content';

const PACE = `Conta no mesmo limite de dice.roll (${SHEET_DICE_RATE.limit} pedidos de dados a cada ${SHEET_DICE_RATE.windowMs / 1000} s).`;
const WHOSE = 'É sempre a bandeja de quem está olhando a ficha, na aba Dados da sala.';

/** The reference of `lorkarium.dice.tray` and `lorkarium.dice.saved`: the tab and the editor. */
export const TRAY_SDK_CALLS: readonly SdkCallDoc[] = [
  {
    signature: 'lorkarium.dice.tray.add({ expression, label? })',
    summary: `Soma uma parte em "Montar rolagem" sem rolar: buffs, bênçãos, bônus de situação. ${WHOSE} A parte aparece com o nome "<nome do modelo> · <label>" e pode ser tirada pelo ×. Até ${DICE_ROLL_PARTS_MAX} partes por rolagem. Funciona mesmo numa ficha só de leitura. ${PACE}`,
    params: [
      ['expression', 'a notação da parte, como "1d4" ou "+2"'],
      ['label', 'opcional: o nome da parte, como "Bênção"'],
    ],
    returns: 'Promessa que resolve sem valor quando a parte entrou.',
    errors: ['INVALID_DICE_EXPRESSION', 'TRAY_FULL', 'FORBIDDEN', 'RATE_LIMITED'],
    example: `await lorkarium.dice.tray.add({ expression: '1d20+5', label: 'Ataque' });
await lorkarium.dice.tray.add({ expression: '1d4', label: 'Bênção' });`,
  },
  {
    signature: 'lorkarium.dice.tray.addSaved(savedRollId)',
    summary: `Soma uma rolagem salva de quem olha (todas as partes dela) em "Montar rolagem". Exige "dice:saved" no manifesto. ${PACE}`,
    params: [['savedRollId', 'o id que o dice.saved.list devolveu']],
    returns: 'Promessa que resolve sem valor quando as partes entraram.',
    errors: ['PERMISSION_NOT_DECLARED', 'SAVED_ROLL_NOT_FOUND', 'TRAY_FULL', 'FORBIDDEN'],
    example: `const salvas = await lorkarium.dice.saved.list();
const acerto = salvas.find((salva) => salva.name === 'Acerto');
if (acerto) await lorkarium.dice.tray.addSaved(acerto.id);`,
  },
  {
    signature: 'lorkarium.dice.tray.roll()',
    summary: `Rola tudo o que está em "Montar rolagem" de uma vez, com o "Quem vê" e o modo (vantagem/desvantagem) escolhidos na aba Dados, e esvazia a bandeja. O histórico mostra cada parte com o nome dela. ${PACE}`,
    params: [],
    returns:
      'Promessa que resolve, quando os dados param, com { total, parts }: cada parte como { label, expression, total, dice } (a fórmula solta vem primeiro, com label null).',
    errors: ['TRAY_EMPTY', 'INVALID_DICE_EXPRESSION', 'FORBIDDEN', 'PREVIEW_ONLY', 'OFFLINE'],
    example: `const rolagem = await lorkarium.dice.tray.roll();
document.getElementById('total').textContent = String(rolagem.total);`,
  },
  {
    signature: 'lorkarium.dice.saved.list()',
    summary:
      'As rolagens salvas de quem olha a ficha nesta mesa (nunca as do dono da ficha). Exige "dice:saved" no manifesto. Na prévia do editor a lista vem vazia.',
    params: [],
    returns: 'Promessa que resolve com [{ id, name, folderId, parts }].',
    errors: ['PERMISSION_NOT_DECLARED', 'FORBIDDEN', 'OFFLINE'],
    example: `const salvas = await lorkarium.dice.saved.list();
for (const salva of salvas) {
  const botao = document.createElement('button');
  botao.textContent = '+ ' + salva.name;
  botao.onclick = () => lorkarium.dice.tray.addSaved(salva.id);
  document.getElementById('buffs').append(botao);
}`,
  },
];
