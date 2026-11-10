/* ---------- abas ---------- */
/* abas por estado (UI.page): o frame da ficha não navega, nem por location.hash */
const freeText = (title, p) => () =>
  `<header><h1 class="h1">${title}</h1></header>${rich('', p, 'Escreva aqui', 'free')}`;
const PAGES = [
  ['perfil', 'Perfil', pgPerfil],
  ['origem', 'Origem', pgOrigem],
  ['atributos', 'Atributos', pgAtributos],
  ['pericias', 'Perícias', pgPericias],
  ['habilidades', 'Habilidades', pgHabilidades],
  ['inventario', 'Inventário', pgInventario],
  ['anotacoes', 'Anotações', freeText('Anotações', 'notas.livre')],
  ['historia', 'História', freeText('História', 'notas.historia')],
  ['regras', 'Regras', null],
];
/* regras do sistema, não do personagem: ficam no pé do menu, separadas */
const FOOT_PAGES = ['regras'];
function showPage(id) {
  UI.page = PAGES.some((p) => p[0] === id) ? id : 'perfil';
  for (const [pid] of PAGES) {
    document.getElementById('pg-' + pid).classList.toggle('on', pid === UI.page);
    document
      .querySelector(`[data-page="${pid}"]`)
      .setAttribute('aria-selected', String(pid === UI.page));
  }
  if (window.scrollTo) window.scrollTo(0, 0);
}

/* ---------- montagem ---------- */
/* o que muda a forma da página (ids das listas, barras da mesa) pede montar de novo; o resto
   só se pinta por cima, sem tirar o foco de quem digita */
function signature() {
  const ids = (path) => itemsOf(path).map(([id]) => id);
  return JSON.stringify([
    Object.keys(LISTS).map(ids),
    ids('mochila'),
    MULTI.map((k) => ids('perlist.' + k)),
    ids('hab').map((id) => ids(`hab.${id}.custos`)),
    sortedBars().map((b) => [b.id, b.label, b.color]),
  ]);
}
let shape = '';
function renderStructure() {
  shape = signature();
  renderBars();
  Object.keys(LISTS).forEach(renderList);
  renderPericias();
  renderBag();
}
function renderAll() {
  const tab = ([id, l]) =>
    `<button type="button" role="tab" data-page="${id}" data-keep aria-selected="false" aria-controls="pg-${id}">${l}</button>`;
  document.getElementById('nav').innerHTML = PAGES.filter((p) => !FOOT_PAGES.includes(p[0]))
    .map(tab)
    .join('');
  document.getElementById('nav-foot').innerHTML = PAGES.filter((p) => FOOT_PAGES.includes(p[0]))
    .map(tab)
    .join('');
  for (const [id, , fn] of PAGES) if (fn) document.getElementById('pg-' + id).innerHTML = fn();
  renderToolbar();
  renderStructure();
  showPage(UI.page);
}
function paintAll() {
  const main = document.getElementById('main');
  paintRich(main);
  main.querySelectorAll('[data-img]').forEach(renderImg);
  main.querySelectorAll('[data-carry]').forEach(paintCarry);
  main.querySelectorAll('[data-wear]').forEach((cb) => {
    cb.checked = !!(getP(cb.dataset.wear) || {}).emUso;
  });
  main.querySelectorAll('[data-foldbox]').forEach(applyFold);
  paintRank();
  paintBars();
  renderPortrait();
  renderWho();
}
function recalc() {
  const t = totals();
  for (const [k] of ATTRS) document.getElementById('tot-' + k).textContent = sign(t[k]);
  checkPoints();
  calcBars(t);
  calcPericias(t);
  calcLoad(t);
  calcRules();
  calcArmor(t);
  calcCd(t);
  document.querySelectorAll('[data-entry]').forEach(updateMeta);
}
/* quem só lê vê tudo e não muda nada: abas e recolher seguem funcionando */
function applyAccess() {
  const ro = !VIEW.canEdit;
  document.body.classList.toggle('readonly', ro);
  document.querySelectorAll('input, select, textarea, button').forEach((el) => {
    if (!el.hasAttribute('data-keep') && !el.closest('#rtbar')) el.disabled = ro;
  });
  document
    .querySelectorAll('.rt-ed')
    .forEach((ed) => ed.setAttribute('contenteditable', ro ? 'false' : 'true'));
}
function refresh() {
  if (signature() !== shape) renderStructure();
  paintAll();
  recalc();
  applyAccess();
}
function onState(state) {
  VIEW = {
    canEdit: state.canEdit === true,
    bars: lorkarium.bars.list(),
    character: lorkarium.character.get(),
    token: state.token,
  };
  S = lorkarium.values.all();
  readPortrait(state.token);
  refresh();
  if (dirty) schedulePush();
}

/* ---------- início ---------- */
renderAll();
refresh();
try {
  document.execCommand('defaultParagraphSeparator', false, 'p');
} catch (e) {
  // sem execCommand (fora do navegador) o texto rico só perde a quebra em <p>
}
lorkarium.onState(onState);
lorkarium.ready();
