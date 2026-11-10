/* ---------- Inventário ---------- */
const COINS = [
  ['Cobre', 'cobre', '#c27a4c', '#7e4a2c', '#e3a27a'],
  ['Prata', 'prata', '#c4cad3', '#7f8691', '#e4e8ee'],
  ['Ouro', 'ouro', '#dcb54c', '#94741f', '#f0d27e'],
  ['Platina', 'platina', '#d3e2e6', '#8aa2aa', '#eef6f8'],
  ['Lorkarium', 'lorkarium', '#9a6cf0', '#5a36ad', '#c4a8ff'],
];
function coinSvg(fill, rim, light, gem) {
  const face = gem
    ? `<path d="M18 9.5 23.5 17 18 25 12.5 17Z" fill="${rim}"/><path d="M18 9.5V25M12.5 17h11" stroke="${light}" stroke-width=".9" opacity=".7"/>`
    : `<circle cx="18" cy="17" r="6" fill="none" stroke="${rim}" stroke-width="1.2" opacity=".55"/>`;
  return `<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18.6" r="15.6" fill="${rim}"/><circle cx="18" cy="17" r="15" fill="${fill}"/>
    <circle cx="18" cy="17" r="11.2" fill="none" stroke="${rim}" stroke-width="1.4" opacity=".75"/>${face}
    <path d="M8.5 11.5A11 11 0 0 1 16 6.2" fill="none" stroke="${light}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}
function coinCell([l, k, fill, rim, light]) {
  const id = nid('moedas.' + k);
  return `<label class="coin" for="${id}" style="--c:${light}">${coinSvg(fill, rim, light, k === 'lorkarium')}<span><span class="coin-n">${l}</span>${bare('moedas.' + k, '0', '', 'inputmode="numeric"', id)}</span></label>`;
}
const pgInventario = () => `
  ${pageHead('Inventário', 'Inventário', 'Começa com uma arma e uma armadura, ou um equipamento e uma armadura.')}
  <section class="blk first"><h2 class="h2">Bolsa</h2><div class="purse">${COINS.map(coinCell).join('')}</div></section>
  <section class="blk"><h2 class="h2">Armas</h2>${listBox('armas')}</section>
  <section class="blk"><h2 class="h2">Armaduras</h2>${listBox('armaduras')}</section>
  <section class="blk"><h2 class="h2">Equipamentos</h2>${listBox('equip')}</section>
  <section class="blk"><div class="blk-hd"><h2 class="h2">Mochila</h2><p class="hint">1 slot +1 a cada ponto de Força.</p></div>
    <div class="load" id="load">
      <div class="load-top"><span class="load-n"><b id="load-used">0</b> / <span id="load-cap">1</span> slots</span><span class="load-state" id="load-state"></span></div>
      <div class="load-bar"><i id="load-fill"></i></div>
      <ul class="load-parts" id="load-parts"></ul>
    </div>
    <div class="bag" id="bag"></div>
    <div data-edit-only><button type="button" class="btn-ghost" data-addbag>${ic('plus', 14)}Adicionar item</button></div></section>`;

function renderBag() {
  const box = document.getElementById('bag');
  const items = itemsOf('mochila');
  if (!items.length) {
    box.innerHTML = '<p class="bag-empty">A mochila está vazia.</p>';
    return;
  }
  const rows = items.map(([id], i) => {
    const p = 'mochila.' + id;
    const n = i + 1;
    return `<div class="slot"><span class="slot-i">${String(n).padStart(2, '0')}</span>
      ${bare(p + '.nome', 'Nome do item', 'in', `aria-label="Item ${n}: nome"`)}
      ${bare(p + '.qtd', '1', 'in num', `inputmode="numeric" aria-label="Item ${n}: quantidade"`)}
      ${bare(p + '.peso', '0', 'in num', `inputmode="decimal" aria-label="Item ${n}: peso"`)}
      <span class="slot-sub" data-sub="${id}">0</span>
      <button type="button" class="sk-x" data-rmbag="${id}" data-edit-only aria-label="Remover item ${n}">${ic('x', 12)}</button></div>`;
  });
  box.innerHTML =
    '<div class="slot head" aria-hidden="true"><span></span><span>Item</span><span>Qtd</span><span>Peso</span><span>Total</span><span></span></div>' +
    rows.join('');
}
const decimal = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const fmtNum = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
/* peso × quantidade; quantidade vazia vale 1 */
const weightOf = (it) => decimal(it && it.peso) * (it && filled(it.qtd) ? decimal(it.qtd) : 1);
/* a carga soma o peso de tudo que o personagem leva: armas, armaduras, equipamentos e a mochila */
const LOAD_PARTS = [
  ['armas', 'Armas'],
  ['armaduras', 'Armaduras'],
  ['equip', 'Equipamentos'],
  ['mochila', 'Mochila'],
];
function calcLoad(t) {
  const cap = 1 + Math.max(0, t.for);
  const parts = LOAD_PARTS.map(([k, l]) => [
    l,
    itemsOf(k)
      .map(([, it]) => it)
      .filter(isCarried)
      .reduce((s, it) => s + weightOf(it), 0),
  ]);
  const used = parts.reduce((s, [, w]) => s + w, 0);
  const over = used > cap;
  document.getElementById('load-used').textContent = fmtNum(used);
  document.getElementById('load-cap').textContent = cap;
  document.getElementById('load').classList.toggle('over', over);
  document.getElementById('load-state').textContent = over
    ? `Acima da capacidade em ${fmtNum(used - cap)}`
    : `${fmtNum(cap - used)} livre${cap - used === 1 ? '' : 's'}`;
  document.getElementById('load-fill').style.width = pct(used, cap) + '%';
  document.getElementById('load-parts').innerHTML = parts
    .map(([l, w]) => `<li><span>${l}</span><b>${fmtNum(w)}</b></li>`)
    .join('');
  for (const [id, it] of itemsOf('mochila')) {
    const el = document.querySelector(`[data-sub="${id}"]`);
    if (el) el.textContent = fmtNum(weightOf(it));
  }
}
