/* ---------- Perfil ---------- */
const RANKS = [
  ['madeira', 'Madeira', '#b08a5e'],
  ['cobre', 'Cobre', '#cf7a52'],
  ['bronze', 'Bronze', '#c39a5a'],
  ['prata', 'Prata', '#c4cad3'],
  ['niquel', 'Níquel', '#a3b0a8'],
  ['ouro', 'Ouro', '#e0b84f'],
  ['rubi', 'Rubi', '#e0607a'],
  ['platina', 'Platina', '#d6e6ea'],
  ['diamante', 'Diamante', '#9fe3f2'],
  ['obsidiana', 'Obsidiana', '#9a8fc2'],
  ['lorkarium', 'Lorkarium', '#b48cff'],
];
/* lista própria em vez de <select>: a opção nativa não desenha o losango colorido de cada patente */
function rankField() {
  const opts = RANKS.map(
    ([v, l, c]) =>
      `<li role="option" id="rank-${v}" data-rank="${v}" aria-selected="false" style="--c:${c}"><span class="rank-gem"></span>${l}<span class="rank-chk">${ic('check', 14)}</span></li>`,
  ).join('');
  return `<div class="fld"><span class="lbl" id="rank-l">Patente de aventureiro</span><div class="rank" id="rank-wrap">
    <button type="button" class="in rank-btn" id="rank-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="rank-l rank-btn"><span class="rank-gem"></span><span id="rank-val"></span>${ic('chev', 14)}</button>
    <ul class="rank-list" id="rank-list" role="listbox" tabindex="-1" aria-labelledby="rank-l" hidden>${opts}</ul></div></div>`;
}
const currentRank = () => RANKS.find((r) => r[0] === getP('f.patente')) || RANKS[0];
function paintRank() {
  const [v, l, c] = currentRank();
  const wrap = document.getElementById('rank-wrap');
  wrap.style.setProperty('--c', c);
  document.getElementById('rank-val').textContent = l;
  wrap
    .querySelectorAll('[data-rank]')
    .forEach((li) => li.setAttribute('aria-selected', String(li.dataset.rank === v)));
}
function setActiveRank(li) {
  const list = document.getElementById('rank-list');
  list.querySelectorAll('.active').forEach((o) => o.classList.remove('active'));
  li.classList.add('active');
  list.setAttribute('aria-activedescendant', li.id);
  if (li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
}
function openRank(open) {
  const btn = document.getElementById('rank-btn');
  const list = document.getElementById('rank-list');
  list.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (!open) return;
  setActiveRank(document.getElementById('rank-' + currentRank()[0]));
  list.focus();
}
function pickRank(v) {
  patch('f.patente', v);
  paintRank();
  openRank(false);
  document.getElementById('rank-btn').focus();
}
function onRankKey(e) {
  const list = document.getElementById('rank-list');
  const items = [...list.children];
  const at = items.findIndex((li) => li.classList.contains('active'));
  const moves = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 };
  if (e.key in moves) {
    e.preventDefault();
    setActiveRank(items[Math.max(0, Math.min(items.length - 1, moves[e.key]))]);
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pickRank(items[at].dataset.rank);
    return;
  }
  if (e.key === 'Escape' || e.key === 'Tab') {
    e.preventDefault();
    openRank(false);
    document.getElementById('rank-btn').focus();
  }
}

/* o retrato é o do personagem na mesa: trocar aqui é character.setImage */
const portraitSlot = () =>
  `<div class="img-slot portrait" data-portrait data-label="Trocar o retrato"><button type="button" class="img-btn"></button><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="Arquivo: retrato"><p class="img-note" id="portrait-note" hidden></p></div>`;
const pgPerfil = () => `
  <section class="hero">
    ${portraitSlot()}
    <div>
      <p class="eyebrow">Aventureiro de Lork</p>
      ${bare('f.nome', 'Nome do personagem', 'hero-name', 'aria-label="Nome do personagem"')}
      <button type="button" class="hero-sub" id="hero-sub" data-goto="origem" data-keep title="Editar na aba Origem"></button>
      <div class="facts facts-4">
        ${field('Nível', 'f.nivel', '1', '', 'inputmode="numeric"')}${rankField()}${field('Equipe', 'f.equipe')}${field('Idade', 'f.idade')}
        ${['Sexo', 'Sexualidade', 'Altura', 'Peso'].map((l) => field(l, 'f.' + slug(l))).join('')}
      </div>
    </div>
  </section>
  <div class="stats">
    <div class="stat"><span class="eyebrow">CA</span><b id="st-ca">—</b><small id="st-ca-sub"></small></div>
    <div class="stat"><span class="eyebrow">CD</span><b id="st-cd">—</b><small id="st-cd-sub"></small></div>
    <div class="stat"><span class="eyebrow">Bônus de treino</span><b id="st-tb">+2</b><small>Perícias treinadas</small></div>
  </div>
  <section class="blk"><div class="blk-hd"><h2 class="h2">Barras</h2><p class="hint">As barras do personagem na mesa. O máximo de HP, MP, EN e Essência segue as contas dos Atributos.</p></div>
    <div class="bars" id="bars"></div></section>
  <section class="blk"><div class="blk-hd"><h2 class="h2">Descrição mental</h2><p class="hint">Como ele tende a agir.</p></div>${rich('', 'f.mental', 'Temperamento, manias, medos, o que o move…', 'tall')}</section>
  <section class="blk"><div class="blk-hd"><h2 class="h2">Descrição física</h2><p class="hint">O que não está na imagem: modo de se portar, cicatrizes, trejeitos.</p></div>${rich('', 'f.fisica', 'Como ele anda, fala, se veste…', 'tall')}</section>`;

/* nome e retrato: os da ficha quando preenchidos, senão os do personagem na mesa */
function renderWho() {
  const raca = getP('origem.raca.nome');
  const classe = getP('origem.classe.nome');
  const tableName =
    (VIEW.character && VIEW.character.name) || (VIEW.token && VIEW.token.name) || '';
  document.getElementById('who-name').textContent = getP('f.nome') || tableName || 'Sem nome';
  document.getElementById('who-sub').textContent =
    [raca, classe].filter(filled).join(' · ') || 'Raça · Classe';
  const part = (v, ph) => (filled(v) ? `<span>${esc(v)}</span>` : `<span class="ph">${ph}</span>`);
  document.getElementById('hero-sub').innerHTML =
    `${part(raca, 'Raça')}<span aria-hidden="true">·</span>${part(classe, 'Classe')}`;
  document.getElementById('who-img').style.backgroundImage = portraitUrl
    ? `url("${portraitUrl}")`
    : '';
}
