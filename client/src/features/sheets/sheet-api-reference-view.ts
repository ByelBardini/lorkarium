import { SHEET_VIEW_MAX_BYTES } from '@lorkarium/contracts';
import { SHEET_VIEW_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import type { SdkCallDoc } from './sheet-api-reference-content';

const WHY =
  'A ficha sobe de novo a cada troca de aba ou janela (ir ao grid e voltar, abrir em janela), e tudo o que não está nos valores se perde: a aba interna aberta, a rolagem. O estado de tela guarda isso para quem olha, nesta página do app: não vai ao servidor, não muda a tela de mais ninguém e não precisa de permissão no manifesto. Recarregar o app esquece.';

/** The reference of `lorkarium.view`: the tab and the editor. */
export const VIEW_SDK_CALLS: readonly SdkCallDoc[] = [
  {
    signature: 'lorkarium.view.get()',
    summary: `Lê o último estado de tela desta ficha para quem olha, sem perguntar à mesa. ${WHY} Devolve uma cópia.`,
    params: [],
    returns:
      'O último valor guardado por view.set (desta ficha, nesta página), ou null se nenhum foi guardado.',
    errors: [],
    example: `const tela = lorkarium.view.get();
mostrarAba(tela?.aba ?? 'perfil');`,
  },
  {
    signature: 'lorkarium.view.set(value)',
    summary: `Guarda o estado de tela de quem olha: qualquer valor JSON (as chaves como as dos valores) de até ${SHEET_VIEW_MAX_BYTES} bytes; null apaga. O view.get já devolve o valor novo na hora. Funciona mesmo numa ficha só de leitura. Até ${SHEET_VIEW_RATE.limit} a cada ${SHEET_VIEW_RATE.windowMs / 1000} s: ao guardar a rolagem, espere ela parar.`,
    params: [['value', 'o que a ficha quer reencontrar ao voltar, como { aba, rolagem }']],
    returns:
      'Promessa que resolve sem valor quando o app guardou. Nenhum estado novo chega por causa dela.',
    errors: [`TypeError acima de ${SHEET_VIEW_MAX_BYTES} bytes ou fora do JSON`, 'RATE_LIMITED'],
    example: `function mostrarAba(aba) {
  document.querySelectorAll('[data-aba]').forEach((el) => (el.hidden = el.dataset.aba !== aba));
  lorkarium.view.set({ ...lorkarium.view.get(), aba });
}`,
  },
];
