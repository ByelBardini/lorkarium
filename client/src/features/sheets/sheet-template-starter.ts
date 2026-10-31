import type { SheetSource } from '@/sheet-sandbox/sheet-srcdoc';

/** The code a new template is born with: a small working sheet whose comments walk through
 *  `ready`, `onState`, `values.get`/`set`, `bars.get`/`adjust` (the bar named "PV") and
 *  `dice.roll`. The e2e of the sheets types into it: keep `#pv`, "Força", "−5 PV", "Rolar
 *  ataque", `1d20+5` and the save on `change`.
 *
 *  Example: `api.create(campaignId, { folderId, ...STARTER_SHEET_SOURCE })` */
export const STARTER_SHEET_SOURCE: SheetSource = {
  html: `<!-- O HTML da ficha. Nada aqui acessa a rede: imagens e fontes só por data: -->
<main class="ficha">
  <h1 id="nome">Ficha</h1>
  <p>PV: <strong id="pv">–</strong></p>
  <label>Força <input id="forca" type="number" min="0" max="30" /></label>
  <div class="acoes">
    <button id="dano" type="button">−5 PV</button>
    <button id="ataque" type="button">Rolar ataque</button>
  </div>
</main>
`,
  css: `/* O CSS da ficha: só vale dentro dela. */
.ficha { font-family: system-ui, sans-serif; color: #eae5da; padding: 12px; }
.ficha h1 { font-size: 20px; margin: 0 0 8px; }
.acoes { display: flex; gap: 8px; margin-top: 12px; }
`,
  js: `// window.lorkarium é a única porta da ficha para a mesa. A aba "API" do editor explica tudo.
// Os pedidos (ready, values.set, bars.adjust, dice.roll) devolvem uma promessa.

// onState: roda com o estado atual e de novo a cada mudança do token, das barras ou dos valores.
lorkarium.onState((estado) => {
  document.getElementById('nome').textContent = estado.token ? estado.token.name : 'Ficha';
  // bars.get: a barra pelo nome que aparece no token (ou pelo id). undefined se não existir.
  const pv = lorkarium.bars.get('PV');
  document.getElementById('pv').textContent = pv ? pv.current + ' / ' + pv.max : '–';
  // values.get: o valor guardado nesta ficha (undefined enquanto ninguém o salvou).
  document.getElementById('forca').value = lorkarium.values.get('forca') ?? 10;
  document.getElementById('forca').disabled = !estado.canEdit;
});

// values.set: guarda valores da ficha no servidor (null apaga a chave).
document.getElementById('forca').addEventListener('change', (event) => {
  lorkarium.values.set({ forca: Number(event.target.value) }).catch(console.error);
});

// bars.adjust: muda a barra "PV" do token ({ op: 'add', amount } ou { op: 'set', value }).
document.getElementById('dano').addEventListener('click', () => {
  lorkarium.bars.adjust('PV', { op: 'add', amount: -5 }).catch(console.error);
});

// dice.roll: rola os dados 3D para a mesa, com o rótulo "<modelo> · Ataque".
document.getElementById('ataque').addEventListener('click', () => {
  lorkarium.dice.roll({ expression: '1d20+5', label: 'Ataque' }).catch(console.error);
});

// ready: "estou pronta para receber dados". Sem ele, o estado nunca chega. Chame por último,
// depois de registrar o onState.
lorkarium.ready();
`,
};
