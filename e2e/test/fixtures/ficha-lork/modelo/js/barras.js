/* ---------- barras ---------- */
/* As barras são as do personagem na mesa (o manifesto cria HP, MP, EN e ES ao dar a ficha).
   A ficha calcula o máximo de HP/MP/EN/ES pelas regras e o grava por bars.adjust; o atual
   muda por bars.adjust (editar), bars.spend (Usar habilidade) e os descansos. */
const RES = [
  ['hp', 'HP', '#c9705a'],
  ['mp', 'MP', '#7f9fd6'],
  ['en', 'EN', '#8fb39a'],
  ['es', 'ES', '#b29ad6'],
];
const PALETTE = {
  gold: '#c5a46d',
  steel: '#7f9fd6',
  ember: '#c9705a',
  moss: '#8fb39a',
  ash: '#a9a497',
};
const barKey = (l) =>
  String(l || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
const tableBar = (label) => VIEW.bars.find((b) => barKey(b.label) === barKey(label)) || null;
const resOf = (b) => RES.find((r) => barKey(r[1]) === barKey(b.label)) || null;
const colorOfBar = (b) => (resOf(b) ? resOf(b)[2] : PALETTE[b.color] || PALETTE.gold);
const sortedBars = () => [...VIEW.bars].sort((a, b) => a.position - b.position);

const level = () => Math.max(1, filled(getP('f.nivel')) ? num(getP('f.nivel')) : 1);
/* regras de nível: ES máximo +2 por nível; bônus de treino +1 a cada nível múltiplo de 4 */
const autoTrainBonus = () => 2 + Math.floor(level() / 4);
const trainBonus = () => (filled(getP('f.treino')) ? num(getP('f.treino')) : autoTrainBonus());
function autoMax(t) {
  const lv = level();
  const b = (k) => num(getP(`res.${k}.base`)) * lv;
  const enAttr = getP('res.en.attr') === 'sab' ? t.sab : t.con;
  return {
    hp: 12 + (t.con * 2 + t.for) + b('hp'),
    mp: 10 + (t.sab * 2 + t.int) + b('mp'),
    en: 10 + (t.des * 2 + enAttr) + b('en'),
    es: 15 + 2 * (lv - 1),
  };
}
const wantedMax = (k, t) =>
  filled(getP(`res.${k}.max`)) ? num(getP(`res.${k}.max`)) : autoMax(t)[k];

function barRow(b) {
  const r = resOf(b);
  const label = esc(b.label);
  const max = r
    ? bare(
        `res.${r[0]}.max`,
        '0',
        'in num',
        `inputmode="numeric" aria-label="${label}: máximo" title="Vazio usa a conta automática"`,
        'max-' + r[0],
      )
    : `<input type="text" class="in num" inputmode="numeric" data-barmax="${b.id}" aria-label="${label}: máximo">`;
  const reset = r
    ? `<button type="button" class="mini-btn" data-reset="${r[0]}" data-edit-only title="Voltar para a conta automática" aria-label="${label}: voltar para a conta automática" hidden>${ic('reset', 14)}</button>`
    : '';
  return `<div class="bar-row" style="--c:${colorOfBar(b)}"><div class="bar-n"><label class="bar-name" for="cur-${b.id}">${label}</label></div><div class="bar"><i data-fill="${b.id}"></i></div>
    <div class="bar-c"><input type="text" class="in num" id="cur-${b.id}" inputmode="numeric" data-barcur="${b.id}"></div><span class="bar-s">/</span>
    <div class="bar-m">${max}</div><div class="bar-t">${reset}</div></div>`;
}
function renderBars() {
  const box = document.getElementById('bars');
  const bars = sortedBars();
  box.innerHTML = bars.length
    ? `<div class="bar-row head" aria-hidden="true"><span></span><span></span><span class="lbl">Atual</span><span></span><span class="lbl">Máximo</span><span></span></div>` +
      bars.map(barRow).join('')
    : '<p class="hint">Sem barras: quem tem a ficha ainda não tem barras na mesa.</p>';
}
/* o que vem da mesa; o campo com foco não é sobrescrito enquanto alguém digita */
function paintBars() {
  for (const b of VIEW.bars) {
    const cur = document.querySelector(`[data-barcur="${b.id}"]`);
    if (cur && document.activeElement !== cur) cur.value = b.current;
    const max = document.querySelector(`[data-barmax="${b.id}"]`);
    if (max && document.activeElement !== max) max.value = b.max;
    const fill = document.querySelector(`[data-fill="${b.id}"]`);
    if (fill) fill.style.width = pct(b.current, b.max) + '%';
  }
}
const miniRow = (label, color, cur, max) =>
  `<div class="mini-row" style="--c:${color}"><b>${esc(label)}</b><div class="bar"><i style="width:${pct(cur, max)}%"></i></div><span>${cur}/${max}</span></div>`;
function calcBars(t) {
  const auto = autoMax(t);
  for (const [k] of RES) {
    const rv = document.getElementById('rv-' + k);
    if (rv) rv.textContent = auto[k];
    const max = document.getElementById('max-' + k);
    if (max) max.placeholder = auto[k];
    const reset = document.querySelector(`[data-reset="${k}"]`);
    if (reset) reset.hidden = !filled(getP(`res.${k}.max`));
  }
  document.getElementById('mini').innerHTML = sortedBars()
    .map((b) => miniRow(b.label.slice(0, 4).toUpperCase(), colorOfBar(b), b.current, b.max))
    .join('');
}

function adjustBar(id, change) {
  return lorkarium.bars
    .adjust(id, change)
    .catch((e) => setStatus('A barra não mudou: ' + failText(e)));
}
function syncBarMaxes() {
  const t = totals();
  for (const [k, l] of RES) {
    const b = tableBar(l);
    const want = wantedMax(k, t);
    if (b && want >= 1 && want !== b.max) adjustBar(b.id, { op: 'max', value: want });
  }
  for (const [b, want] of contaMaxes(t)) {
    if (want !== b.max) adjustBar(b.id, { op: 'max', value: want });
  }
  createMissingContaBars(t);
}

/* custo nas barras: hab.<id>.custos.<id> = { bar: rótulo da barra, v }; tudo ou nada (bars.spend) */
function costsOf(habId) {
  const sums = {};
  for (const [, c] of itemsOf(`hab.${habId}.custos`)) {
    if (filled(c.bar) && num(c.v) > 0) sums[c.bar] = (sums[c.bar] || 0) + num(c.v);
  }
  return Object.entries(sums);
}
function shortOf(costs) {
  for (const [label, v] of costs) {
    const b = tableBar(label);
    if (b && b.current < v) return `${b.label} insuficiente: tem ${b.current}, precisa de ${v}.`;
  }
  return null;
}
function useSkill(habId) {
  const msg = document.getElementById('use-' + habId);
  const costs = costsOf(habId);
  msg.classList.remove('bad');
  if (!costs.length) {
    msg.textContent = 'Escolha uma barra e um valor maior que zero.';
    return;
  }
  lorkarium.bars.spend(costs.map(([bar, amount]) => ({ bar, amount }))).then(
    () => {
      msg.textContent = 'Gastou ' + costs.map(([l, v]) => `${v} de ${l}`).join(', ') + '.';
    },
    (e) => {
      msg.textContent =
        (e && e.code === 'INSUFFICIENT_BAR' && shortOf(costs)) ||
        'Não deu para usar: ' + failText(e);
      msg.classList.add('bad');
    },
  );
}

/* ES é estresse: desce no descanso; as outras barras sobem até o máximo */
function restTarget(b, share, stress) {
  if (barKey(b.label) === 'es') return Math.max(0, b.current - Math.round(stress * b.max));
  return Math.max(b.current, Math.min(b.max, b.current + Math.round(share * b.max)));
}
function takeRest(button) {
  const share = Number(button.dataset.bars);
  const stress = Number(button.dataset.stress);
  const changes = [];
  const sent = [];
  for (const b of sortedBars()) {
    const next = b.max > 0 ? restTarget(b, share, stress) : b.current;
    if (next === b.current) continue;
    changes.push(`${b.label} ${b.current} → ${next}`);
    sent.push(adjustBar(b.id, { op: 'set', value: next }));
  }
  const msg = document.getElementById('rest-msg');
  Promise.all(sent).then(() => {
    msg.textContent =
      `${button.dataset.rest}: ` +
      (changes.length ? changes.join(', ') + '.' : 'nada mudou, as barras já estavam cheias.');
  });
}
