/* ---------- Atributos ---------- */
const ATTRS = [
  ['for', 'Força', 'FOR', 'fis'],
  ['des', 'Destreza', 'DES', 'fis'],
  ['con', 'Constituição', 'CON', 'fis'],
  ['int', 'Inteligência', 'INT', 'men'],
  ['car', 'Carisma', 'CAR', 'men'],
  ['sab', 'Sabedoria', 'SAB', 'men'],
];
const COLS = [
  ['base', 'Base'],
  ['raca', 'Raça'],
  ['outros', 'Outros'],
  ['up', 'UP'],
];
function attrRow([k, name]) {
  const cells = COLS.map(
    ([c, l], i) =>
      `<td>${bare(`at.${k}.${c}`, '0', 'in num', `inputmode="numeric" aria-label="${name}: ${l}"`)}</td><td class="op">${i < 3 ? '+' : '='}</td>`,
  ).join('');
  return `<tr><th scope="row">${name}</th>${cells}<td class="tot" id="tot-${k}">0</td></tr>`;
}
const attrGroup = (g, label, color) =>
  `<tr class="grp" style="--c:${color}"><th colspan="10" scope="colgroup">${label}</th></tr>${ATTRS.filter(
    (a) => a[3] === g,
  )
    .map(attrRow)
    .join('')}`;
function pgAtributos() {
  const head = COLS.map(([, l]) => `<th scope="col">${l}</th><th></th>`).join('');
  // a opção vazia é a Constituição, a conta padrão do EN
  const enSel =
    '<select data-lk="res.en.attr" aria-label="Atributo do EN"><option value="">Cons</option><option value="sab">Sab</option></select>';
  const forms = {
    hp: '12 + (Cons×2 + Força) + (Base×Nível)',
    mp: '10 + (Sab×2 + Int) + (Base×Nível)',
    en: `10 + (Dex×2 + ${enSel}) + (Base×Nível)`,
    es: '15 + 2×(Nível − 1)',
  };
  const rows = RES.map(
    ([k, l, c]) =>
      `<tr style="--c:${c}"><td class="rn">${l}</td><td class="rf">${forms[k] ?? '—'}</td><td class="rv" id="rv-${k}">0</td><td class="rx"></td></tr>`,
  ).join('');
  return `${pageHead('Atributos', 'Atributos', 'Começa com 4 pontos, e dá para ganhar no máximo 2 pontos deixando atributos negativos.')}
    <section class="blk first">
      <ul class="checks" id="checks"></ul>
      <div class="tbl-wrap"><table class="attr"><thead><tr><th></th>${head}<th scope="col">Total</th></tr></thead>
        <tbody>${attrGroup('fis', 'Físicos', 'var(--ember-l)')}${attrGroup('men', 'Mentais', 'var(--steel-l)')}</tbody></table></div>
    </section>
    <section class="blk"><div class="blk-hd"><h2 class="h2">Contas das barras</h2><p class="hint">O máximo de HP, MP, EN e ES segue a conta fixa, a menos que se escreva outro no Perfil. Outras barras da mesa podem ganhar uma conta: números, + − × ÷, parênteses, FOR, DES, CON, INT, CAR, SAB, Nível e Treino.</p></div>
      <div class="tbl-wrap"><table class="res"><thead><tr><th>Barra</th><th>Fórmula</th><th style="text-align:right">Máximo</th><th></th></tr></thead><tbody>${rows}</tbody><tbody id="contas"></tbody></table></div>
      <button type="button" class="sk-add" data-add="contas" data-edit-only>${ic('plus', 12)}Adicionar conta</button>
      <datalist id="contas-bars"></datalist>
    </section>`;
}

const totals = () =>
  Object.fromEntries(
    ATTRS.map(([k]) => [k, COLS.reduce((s, [c]) => s + num(getP(`at.${k}.${c}`)), 0)]),
  );
function checkPoints() {
  const bases = ATTRS.map(([k]) => num(getP(`at.${k}.base`)));
  const gained = bases.filter((b) => b < 0).reduce((s, b) => s - b, 0);
  const spent = bases.filter((b) => b > 0).reduce((s, b) => s + b, 0);
  const budget = 4 + Math.min(gained, 2);
  const item = (label, val, tone) => `<li>${label} <b class="${tone}">${val}</b></li>`;
  document.getElementById('checks').innerHTML =
    item(
      'Pontos',
      `${spent}/${budget}`,
      spent === budget ? 'ok' : spent > budget ? 'bad' : 'warn',
    ) + item('Ganhos com negativos', `${gained}/2`, gained > 2 ? 'bad' : 'ok');
}
