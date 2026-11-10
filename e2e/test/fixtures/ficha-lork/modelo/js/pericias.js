/* ---------- Perícias ---------- */
const PERICIAS = [
  [
    'Físicos',
    'var(--ember-l)',
    [
      ['Força', 'for', ['Atletismo', 'Arremesso', 'Carregar']],
      ['Destreza', 'des', ['Acrobacia', 'Furtividade', 'Reflexos', 'Prestidigitação', 'Condução+']],
      ['Constituição', 'con', ['Resistência', 'Fôlego', 'Ignorar Dor', 'Imunidade']],
    ],
  ],
  [
    'Mentais',
    'var(--steel-l)',
    [
      [
        'Inteligência',
        'int',
        [
          'Conhecimento+',
          'Ofícios+',
          'Medicina',
          'Manha',
          'Percepção Mágica',
          'História',
          'Religião',
          'Natureza',
          'Investigação',
        ],
      ],
      [
        'Carisma',
        'car',
        ['Sex Appeal', 'Persuasão', 'Adestrar Animais', 'Intimidação', 'Performance'],
      ],
      ['Sabedoria', 'sab', ['Intuição', 'Empatia', 'Sobrevivência', 'Força Mental', 'Percepção']],
    ],
  ],
];
/* per.<perícia> guarda o multiplicador do bônus de treino: ausente (não treinada), 0.5, 1, 1.5 ou 2 */
const NEXT_MULT = { 1: 1.5, 1.5: 2, 2: 0.5, 0.5: 1 };
const multOf = (v) => (v === true ? 1 : typeof v === 'number' ? v : 0);
const multLabel = (m) => (m === 0.5 ? '½×' : String(m).replace('.', ',') + '×');
const multBtn = (p, name) =>
  `<button type="button" class="sk-mult" data-mult="${p}" title="Multiplicador do bônus de treino" aria-label="${name}: multiplicador do bônus de treino" hidden></button>`;
function skSingle(name, attr) {
  const p = 'per.' + slug(name);
  return `<div class="sk"><button type="button" class="sk-tog" data-tr="${p}" aria-pressed="false"><span class="gem"></span><span class="sk-n">${name}</span></button>
    ${multBtn(p, name)}<span class="sk-v" data-mod="${p}" data-attr="${attr}">+0</span></div>`;
}
/* perícias com vários itens (Conhecimento de quê?) são listas com id estável */
function skMulti(name, attr) {
  const k = slug(name);
  const rows = itemsOf('perlist.' + k)
    .map(([id]) => {
      const p = `perlist.${k}.${id}`;
      return `<div class="sk sub"><button type="button" class="sk-tog only" data-tr="${p}.t" aria-pressed="false" aria-label="${name}: treinada"><span class="gem"></span></button>
      ${bare(p + '.def', 'Qual?', 'sk-def', `aria-label="${name}: qual"`)}${multBtn(p + '.t', name)}<span class="sk-v" data-mod="${p}.t" data-attr="${attr}">+0</span>
      <button type="button" class="sk-x" data-prm="${k}:${id}" data-edit-only aria-label="Remover ${name.toLowerCase()}">${ic('x', 12)}</button></div>`;
    })
    .join('');
  return `<div class="sk-multi"><span>${name}</span><button type="button" class="sk-add" data-padd="${k}" data-edit-only>${ic('plus', 12)}Adicionar</button></div>${rows}`;
}
const skRow = (name, attr) =>
  name.endsWith('+') ? skMulti(name.slice(0, -1), attr) : skSingle(name, attr);
const skGroup = ([name, attr, list]) =>
  `<section><div class="sk-grp-hd"><h3>${name}</h3><span class="sk-at">${ATTRS.find((a) => a[0] === attr)[2]} <span data-attrtot="${attr}">+0</span></span></div>${list
    .map((n) => skRow(n, attr))
    .join('')}</section>`;
function renderPericias() {
  document.getElementById('sk-board').innerHTML = PERICIAS.map(
    ([label, color, groups]) =>
      `<div style="--c:${color}"><p class="eyebrow" style="margin-bottom:14px">${label}</p><div class="sk-cols">${groups.map(skGroup).join('')}</div></div>`,
  ).join('');
}
const pgPericias = () => `
  ${pageHead('Perícias', 'Perícias', 'Escolha 4 perícias iniciais.')}
  <section class="blk first"><div class="train"><label class="eyebrow" for="train-in">Bônus de treino</label>
      ${bare('f.treino', '2', 'in num', 'inputmode="numeric" title="Vazio usa a conta pelo nível"', 'train-in')}
      <button type="button" class="mini-btn" data-resettrain data-edit-only title="Voltar para a conta pelo nível" aria-label="Bônus de treino: voltar para a conta pelo nível" hidden>${ic('reset', 14)}</button></div>
    <div class="sk-board" id="sk-board"></div></section>`;
function calcPericias(t) {
  document.querySelectorAll('[data-attrtot]').forEach((el) => {
    el.textContent = sign(t[el.dataset.attrtot]);
  });
  const bonus = trainBonus();
  document.getElementById('train-in').placeholder = autoTrainBonus();
  document.querySelector('[data-resettrain]').hidden = !filled(getP('f.treino'));
  document.querySelectorAll('[data-mod]').forEach((m) => {
    m.textContent = sign(t[m.dataset.attr] + Math.round(bonus * multOf(getP(m.dataset.mod))));
  });
  document.querySelectorAll('[data-mult]').forEach((b) => {
    const m = multOf(getP(b.dataset.mult));
    b.hidden = !m;
    b.textContent = multLabel(m);
  });
  document
    .querySelectorAll('[data-tr]')
    .forEach((b) => b.setAttribute('aria-pressed', String(!!multOf(getP(b.dataset.tr)))));
}
