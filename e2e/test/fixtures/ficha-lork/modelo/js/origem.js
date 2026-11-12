/* ---------- Origem ---------- */
function originBlock(tag, key, ph, inner, first) {
  const id = nid(`origem.${key}.nome`);
  const fk = 'sec.' + key;
  return `<section class="blk ${first ? 'first' : ''}" data-foldbox="${fk}">
    <div class="blk-hd"><div class="sec-hd"><label class="eyebrow" for="${id}">${tag}</label>${foldBtn(fk, tag)}</div>${bare(`origem.${key}.nome`, ph, 'big-name', '', id)}</div>
    ${optImg(`origem.${key}.img`)}
    ${inner}
  </section>`;
}
function classBases() {
  const rows = RES.filter((r) => r[0] !== 'es')
    .map(([k, l, c]) => {
      const id = nid(`res.${k}.base`);
      return `<div class="fld" style="--c:${c}"><label class="lbl" for="${id}">${l} base</label>${bare(`res.${k}.base`, '0', 'in num', 'inputmode="numeric"', id)}</div>`;
    })
    .join('');
  return `<div class="fld bases-fld"><span class="lbl">Bases da classe</span><div class="bases">${rows}</div></div>`;
}
const attrOptions = (none) =>
  `<option value="">${none}</option>` +
  ATTRS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
/* CD do personagem = 8 + bônus de treino + o atributo escolhido na classe */
function cdField() {
  const id = nid('origem.classe.cd');
  return `<div class="fld bases-fld"><label class="lbl" for="${id}">CD</label><div class="cd-row">
    <span>8 + Bônus de treino <b data-cdbonus>+2</b> +</span>
    <select class="in" id="${id}" data-lk="origem.classe.cd">${attrOptions('Escolha o atributo')}</select>
    <b data-cdattr></b><span>=</span><output class="cd-val" id="cd-val">—</output></div></div>`;
}
const pgOrigem = () => `
  <header class="row-hd"><div><p class="eyebrow">Origem</p><h1 class="h1">Raça, original e classe</h1></div>
    <div class="fold-all"><button type="button" class="btn-ghost" data-foldall="close" data-keep>Recolher tudo</button><button type="button" class="btn-ghost" data-foldall="open" data-keep>Mostrar tudo</button></div></header>
  ${originBlock(
    'Raça',
    'raca',
    'Qual é a sua raça?',
    rich('Descrição', 'origem.raca.desc', 'Descreva sua raça', 'tall') +
      rich('Efeitos', 'origem.raca.vant', 'Área do Mestre', 'tall') +
      rich('Desvantagens', 'origem.raca.desv', 'Área do Mestre', 'tall') +
      skillBox('origem.raca'),
    true,
  )}
  ${originBlock(
    'Original',
    'original',
    'O que te torna único?',
    rich('Descrição', 'origem.original.desc', 'Descreva seu original', 'tall') +
      rich('Efeito', 'origem.original.efeito', 'Área do Mestre', 'tall') +
      skillBox('origem.original'),
  )}
  ${originBlock(
    'Classe',
    'classe',
    'O que você faz?',
    rich('Descrição', 'origem.classe.desc', 'Descreva sua classe', 'tall') +
      `<div class="panel class-panel">${classBases()}<span class="vsep" aria-hidden="true"></span>${cdField()}</div>` +
      rich('Efeito', 'origem.classe.efeito', 'Área do Mestre', 'tall') +
      skillBox('origem.classe'),
  )}`;

/* CA = a da armadura em uso; CD = a da classe; nulas enquanto não há como calcular */
function statsOf(t) {
  const a = getP('origem.classe.cd');
  const worn = wornArmor();
  return {
    attr: ATTRS.some((x) => x[0] === a) ? a : '',
    ca: worn ? caOf(worn, t).v : null,
    cd: ATTRS.some((x) => x[0] === a) ? 8 + trainBonus() + t[a] : null,
    worn,
  };
}
function calcCd(t) {
  const { attr, ca, cd, worn } = statsOf(t);
  const bonus = trainBonus();
  document.querySelector('[data-cdbonus]').textContent = sign(bonus);
  document.querySelector('[data-cdattr]').textContent = attr ? `(${sign(t[attr])})` : '';
  document.getElementById('cd-val').textContent = cd ?? '—';
  document.getElementById('st-ca').textContent = ca ?? '—';
  document.getElementById('st-ca-sub').textContent = worn
    ? worn.nome || 'Armadura sem nome'
    : 'Sem armadura em uso';
  document.getElementById('st-cd').textContent = cd ?? '—';
  document.getElementById('st-cd-sub').textContent = attr
    ? `Atributo: ${ATTRS.find((x) => x[0] === attr)[1]}`
    : 'Escolha o atributo na Classe';
  document.getElementById('st-tb').textContent = sign(bonus);
  document.getElementById('mini-stats').innerHTML =
    `<span>CA<b>${ca ?? '—'}</b></span><span>CD<b>${cd ?? '—'}</b></span>`;
}
/* a CA e a CD calculadas vão ao personagem (character.set), que o card da mesa mostra */
const statValue = (v) => Math.max(0, Math.min(999, v));
function pushStats() {
  const ch = VIEW.character;
  if (!ch) return;
  const { ca, cd } = statsOf(totals());
  const changes = {};
  if (ca != null && statValue(ca) !== ch.armorClass) changes.armorClass = statValue(ca);
  if (cd != null && statValue(cd) !== ch.difficultyClass) changes.difficultyClass = statValue(cd);
  if (!Object.keys(changes).length) return;
  lorkarium.character
    .set(changes)
    .catch((e) => setStatus('A CA e a CD não foram para a mesa: ' + failText(e)));
}
