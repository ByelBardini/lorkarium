/* ---------- entradas em lista (habilidades, extras, itens) ---------- */
function entry(list, id, i, namePh, main, side) {
  const key = `${list}:${id}`;
  const open = !UI.closed[key];
  return `<article class="entry ${open ? '' : 'closed'}" data-entry="${key}">
    <div class="entry-hd"><span class="entry-idx">${String(i + 1).padStart(2, '0')}</span>
      ${bare(`${list}.${id}.nome`, namePh, 'entry-name', `aria-label="${esc(namePh)}"`)}
      <span class="entry-meta"></span>
      <button type="button" class="mini-btn danger" data-rm="${key}" data-edit-only data-confirm="Remover?" title="Remover" aria-label="Remover">${ic('trash', 14)}</button>
      <button type="button" class="mini-btn chev" data-toggle="${key}" data-keep aria-expanded="${open}" aria-label="Mostrar ou esconder">${ic('chev', 14)}</button></div>
    <div class="entry-body"><div class="spec">${side}</div>${main}</div>
  </article>`;
}
function habCard(id, i) {
  const p = 'hab.' + id;
  return entry(
    'hab',
    id,
    i,
    'Nome da habilidade',
    costBlock(p) +
      optImg(p + '.img') +
      rich('Descrição', p + '.desc', 'Descreva sua habilidade aqui') +
      bare(p + '.frase', '“Frase de efeito”', 'quote', 'aria-label="Frase de efeito"') +
      rich('Efeito', p + '.efeito', 'Definido pelo mestre', 'tall'),
    specIn('Nível', p + '.nivel', '1', 'inputmode="numeric"') +
      specIn('Tipo', p + '.tipo', 'Físico, Mental, Marcial…') +
      specIn('Funcionalidade', p + '.func', 'Buff, Debuff, Ofensiva…') +
      specRich('Custo de ativação', p + '.ativ', 'Mestre') +
      specRich('Cooldown', p + '.cd', 'Mestre'),
  );
}
/* as opções são as barras da mesa; um rótulo guardado que sumiu da mesa continua na lista */
function barOptions(stored) {
  const labels = sortedBars().map((b) => b.label);
  if (filled(stored) && !labels.some((l) => barKey(l) === barKey(stored))) labels.push(stored);
  return labels.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
}
/* o custo mora em <dono>.custos, e o dono é uma habilidade ou uma skill: o caminho inteiro vai
   nos atributos, e o id da mensagem troca os pontos por hífens */
const useMsgId = (base) => 'use-' + base.replace(/\./g, '-');
function costRow(base, costId) {
  const p = `${base}.custos.${costId}`;
  return `<div class="cost"><select class="cost-bar" data-lk="${p}.bar" aria-label="Barra que paga o custo">${barOptions(getP(p + '.bar'))}</select>
    ${bare(p + '.v', '0', 'cost-v', 'inputmode="numeric" aria-label="Quanto sai da barra"')}
    <button type="button" class="sk-x" data-rmcost="${base}|${costId}" data-edit-only aria-label="Desvincular barra">${ic('x', 12)}</button></div>`;
}
/* fora da faixa da ficha técnica: com várias barras vinculadas ele cresce sem esticar as outras células */
function costBlock(base, useLabel = 'Usar habilidade') {
  const rows = itemsOf(`${base}.custos`)
    .map(([costId]) => costRow(base, costId))
    .join('');
  return `<div class="cost-block"><span class="lbl">Custo</span>
    <div class="costs">${rows}<button type="button" class="sk-add" data-addcost="${base}" data-edit-only>${ic('plus', 12)}Vincular barra</button></div>
    ${rows ? `<button type="button" class="btn-use" data-use="${base}">${useLabel}</button>` : ''}
    <p class="use-msg" id="${useMsgId(base)}" role="status"></p></div>`;
}

/* skills dentro do efeito (raça, original, classe e itens): nome, descrição e o mesmo custo das
   habilidades, que desconta das barras de uma vez */
const SKILL_OWNER_LISTS = ['armas', 'armaduras', 'equip'];
const ORIGIN_SKILL_OWNERS = ['origem.raca', 'origem.original', 'origem.classe'];
const skillOwners = () => [
  ...ORIGIN_SKILL_OWNERS,
  ...SKILL_OWNER_LISTS.flatMap((l) => itemsOf(l).map(([id]) => `${l}.${id}`)),
];
const skillBox = (base) =>
  `<div class="skills-blk"><span class="lbl">Skills</span><div class="skills" data-skills="${base}"></div></div>`;
function skillCard(base, id) {
  const p = `${base}.skills.${id}`;
  return `<div class="skill"><div class="skill-hd">${bare(p + '.nome', 'Nome da skill', 'skill-name', 'aria-label="Nome da skill"')}
    <button type="button" class="mini-btn danger" data-rm="${base}.skills:${id}" data-edit-only data-confirm="Remover?" title="Remover skill" aria-label="Remover skill">${ic('trash', 14)}</button></div>
    ${rich('Descrição', p + '.desc', 'O que a skill faz')}${costBlock(p, 'Usar skill')}</div>`;
}
function renderSkills(box) {
  const base = box.dataset.skills;
  box.innerHTML =
    itemsOf(`${base}.skills`)
      .map(([id]) => skillCard(base, id))
      .join('') +
    `<button type="button" class="sk-add" data-add="${base}.skills" data-edit-only>${ic('plus', 12)}Adicionar skill</button>`;
}
function extraCard(id, i) {
  const p = 'extras.' + id;
  return entry(
    'extras',
    id,
    i,
    'Nome do extra',
    optImg(p + '.img') +
      rich('Descrição', p + '.desc', 'O que faz…') +
      rich('Efeito', p + '.efeito', 'Definido pelo mestre', 'tall'),
    specIn('Tipo', p + '.tipo', 'Passiva ou ativa') +
      specIn('Origem', p + '.origem', 'Como foi adquirida'),
  );
}
function itemCard(list, id, i, namePh, withQty) {
  const p = `${list}.${id}`;
  return entry(
    list,
    id,
    i,
    namePh,
    (list === 'armaduras' ? caBlock(p) : '') +
      optImg(p + '.img') +
      rich('Descrição', p + '.desc', 'Aparência, história, de onde veio…') +
      rich('Efeito', p + '.efeito', 'Dano, durabilidade, propriedades…', 'tall') +
      skillBox(p),
    specIn('Qualidade', p + '.qual') +
      specIn('Material', p + '.mat') +
      specIn('Peso', p + '.peso') +
      (withQty ? specIn('Quantidade', p + '.qtd', '1', 'inputmode="numeric"') : '') +
      specCarry(p),
  );
}
/* <item>.guardado = true quando não está com o personagem: aí o peso não entra na carga */
function specCarry(p) {
  const id = nid(p + '.carrega');
  return `<div class="spec-row carry"><label class="lbl" for="${id}">Carregando</label>
    <label class="carry-box"><input type="checkbox" id="${id}" data-carry="${p}"><span class="carry-txt"></span></label></div>`;
}
const isCarried = (it) => !(it && it.guardado);
function paintCarry(box) {
  box.checked = isCarried(getP(box.dataset.carry));
  box.nextElementSibling.textContent = box.checked ? 'Sim, conta no peso' : 'Não, guardado';
}

/* CA da armadura: valor fixo; ou valor + atributo; ou valor + atributo limitado (caLim) */
function caBlock(p) {
  const id = nid(p + '.ca');
  const wid = nid(p + '.emUso');
  return `<div class="ca panel"><p class="eyebrow">CA da armadura</p><div class="ca-row">
    <label class="ca-f" for="${id}">Valor${bare(p + '.ca', '0', 'in num', 'inputmode="numeric"', id)}</label>
    <span class="ca-op">+</span>
    <label class="ca-f">Atributo<select class="in" data-lk="${p}.caAttr">${attrOptions('Nenhum')}</select></label>
    <label class="ca-f" data-calim="${p}">Limite${bare(p + '.caLim', 'Sem', 'in num', 'inputmode="numeric" aria-label="Limite do atributo"')}</label>
    <span class="ca-op">=</span><div class="ca-res"><span>CA</span><output class="ca-val" data-ca="${p}">0</output></div></div>
    <p class="ca-form" data-caform="${p}"></p>
    <label class="wear" for="${wid}"><input type="checkbox" id="${wid}" data-wear="${p}"><span>Em uso: é a CA do personagem</span></label></div>`;
}
/* só uma armadura em uso; vestir também marca como carregando */
const wornArmor = () =>
  itemsOf('armaduras')
    .map(([, a]) => a)
    .find((a) => a.emUso && isCarried(a));
function setWorn(p, on) {
  const pairs = itemsOf('armaduras')
    .filter(([id, a]) => a.emUso && !(on && `armaduras.${id}` === p))
    .map(([id]) => [`armaduras.${id}.emUso`, null]);
  if (on) pairs.push([p + '.emUso', true], [p + '.guardado', null]);
  return patchMany(pairs);
}
function caOf(it, t) {
  const base = num(it.ca);
  const a = it.caAttr;
  const name = (ATTRS.find((x) => x[0] === a) || [])[2];
  if (!a || !name) return { v: base, txt: 'Valor fixo' };
  const raw = t[a];
  const lim = filled(it.caLim) ? num(it.caLim) : null;
  const used = lim == null ? raw : Math.min(raw, lim);
  const limTxt =
    lim == null ? '' : `, limite ${sign(lim)}${raw > lim ? `: conta ${sign(used)}` : ''}`;
  return { v: base + used, txt: `${base} + ${name} (${sign(raw)}${limTxt})` };
}
function calcArmor(t) {
  for (const [id, it] of itemsOf('armaduras')) {
    const p = 'armaduras.' + id;
    const out = document.querySelector(`[data-ca="${p}"]`);
    if (!out) continue;
    const ca = caOf(it, t);
    out.textContent = ca.v;
    document.querySelector(`[data-caform="${p}"]`).textContent = ca.txt;
    document.querySelector(`[data-calim="${p}"]`).hidden = !it.caAttr;
  }
}
const LISTS = {
  hab: { card: habCard, add: 'Adicionar habilidade' },
  extras: { card: extraCard, add: 'Adicionar extra' },
  armas: {
    card: (id, i) => itemCard('armas', id, i, 'Nome da arma', false),
    add: 'Adicionar arma',
  },
  armaduras: {
    card: (id, i) => itemCard('armaduras', id, i, 'Nome da armadura', false),
    add: 'Adicionar armadura',
  },
  equip: {
    card: (id, i) => itemCard('equip', id, i, 'Nome do equipamento', true),
    add: 'Adicionar equipamento',
  },
};
const listBox = (name) =>
  `<div class="list" id="list-${name}"></div><div class="add-row" data-edit-only><button type="button" class="btn-ghost" data-add="${name}">${ic('plus', 14)}${LISTS[name].add}</button></div>`;
function renderList(name) {
  const box = document.getElementById('list-' + name);
  box.innerHTML = itemsOf(name)
    .map(([id], i) => LISTS[name].card(id, i))
    .join('');
}
function updateMeta(art) {
  const [n, id] = art.dataset.entry.split(':');
  const it = getP(`${n}.${id}`) || {};
  const meta = art.querySelector('.entry-meta');
  if (n === 'hab') {
    meta.textContent = ['Nível ' + (filled(it.nivel) ? it.nivel : '1'), it.tipo, it.func]
      .filter(filled)
      .join(' · ');
    return;
  }
  if (n === 'extras') {
    meta.textContent = it.tipo || '';
    return;
  }
  const ca = n === 'armaduras' ? `CA ${caOf(it, totals()).v}` : '';
  const worn = n === 'armaduras' && it.emUso && isCarried(it) ? 'Em uso' : '';
  meta.textContent = [
    isCarried(it) ? '' : 'Guardado',
    worn,
    ca,
    n === 'equip' && filled(it.qtd) ? `${it.qtd}×` : '',
    it.qual,
    it.mat,
  ]
    .filter(filled)
    .join(' · ');
  art.classList.toggle('stored', !isCarried(it));
}

const pgHabilidades = () => `
  ${pageHead('Habilidades', 'Habilidades', 'Você começa com duas habilidades nível 1.')}
  <section class="blk first">${listBox('hab')}</section>
  <section class="blk"><div class="blk-hd"><h2 class="h2">Extras</h2><p class="hint">Habilidades que vocês adquirirem durante o jogo, sejam passivas ou ativas, normalmente as que não dá para upar com treinamento ou Lvl. Up.</p></div>${listBox('extras')}</section>`;
