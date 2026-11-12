/* ---------- contas extras ---------- */
/* HP, MP, EN e ES têm conta fixa (Atributos). Qualquer outra barra da mesa pode ganhar uma:
   contas.<id> = { ordem, bar: rótulo da barra, f: fórmula }. A fórmula aceita números,
   + − × ÷ (ou * e /), parênteses, os atributos pelo nome ou pela sigla (FOR, DES, CON, INT,
   CAR, SAB), Nível e Treino; o resultado arredonda para baixo. Sem eval: o CSP da ficha não o
   roda, e a fórmula é texto de quem tem a ficha. */
const CONTA_VARS = {
  for: 'for',
  forca: 'for',
  des: 'des',
  dex: 'des',
  destreza: 'des',
  con: 'con',
  cons: 'con',
  constituicao: 'con',
  int: 'int',
  inteligencia: 'int',
  car: 'car',
  carisma: 'car',
  sab: 'sab',
  sabedoria: 'sab',
  nivel: 'nivel',
  nv: 'nivel',
  treino: 'treino',
};
const CONTA_MAX_CHARS = 200;
const contaValues = (t) => Object.assign({}, t, { nivel: level(), treino: trainBonus() });

function contaTokens(text) {
  const src = String(text).trim().replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  const re = /\s*(\d+|\p{L}+|[-+*/()])\s*/uy;
  const out = [];
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    const m = re.exec(src);
    if (!m) throw new Error(`não entendi "${src.slice(at).trim().slice(0, 12)}"`);
    out.push(m[1]);
  }
  return out;
}

/* soma de produtos de fatores, com parênteses e sinal na frente */
function contaParser(toks, vals) {
  let at = 0;
  const peek = () => toks[at];
  const take = () => toks[at++];
  function factor() {
    const t = take();
    if (t === undefined) throw new Error('a conta termina no meio');
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') {
      const v = sum();
      if (take() !== ')') throw new Error('falta fechar um parêntese');
      return v;
    }
    if (/^\d+$/.test(t)) return Number(t);
    const k = CONTA_VARS[barKey(t)];
    if (k) return vals[k];
    throw new Error(`não conheço "${t}"`);
  }
  function product() {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = take();
      const r = factor();
      if (op === '/' && r === 0) throw new Error('divisão por zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === '+' || peek() === '-') v = take() === '+' ? v + product() : v - product();
    return v;
  }
  return { sum, rest: () => toks.slice(at) };
}

/* { ok: true, value } ou { ok: false, why } com o motivo em palavras */
function evalConta(text, vals) {
  if (String(text).length > CONTA_MAX_CHARS) return { ok: false, why: 'conta longa demais' };
  try {
    const toks = contaTokens(text);
    if (!toks.length) return { ok: false, why: 'conta vazia' };
    const parser = contaParser(toks, vals);
    const value = parser.sum();
    const rest = parser.rest();
    if (rest.length) throw new Error(`sobrou "${rest.join(' ')}"`);
    return { ok: true, value: Math.floor(value) };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

const freeBars = () => sortedBars().filter((b) => !resOf(b));
/* o nome da barra é livre: as barras da mesa sem conta fixa só aparecem como sugestão */
function contaRow([id]) {
  const p = 'contas.' + id;
  const b = tableBar(getP(p + '.bar'));
  return `<tr style="--c:${b ? colorOfBar(b) : 'var(--dim)'}">
    <td class="rn">${bare(p + '.bar', 'Nome da barra', 'in conta-bar', 'list="contas-bars" maxlength="24" aria-label="Barra da conta"')}<p class="conta-why" id="cb-${id}" role="status"></p></td>
    <td class="rf">${bare(p + '.f', 'ex.: 10 + DES×2 + Nível', 'in conta-f', 'aria-label="Fórmula da conta"')}<p class="conta-why bad" id="cw-${id}" role="status"></p></td>
    <td class="rv" id="cv-${id}">—</td>
    <td class="rx"><button type="button" class="sk-x" data-rm="contas:${id}" data-arm-icon data-edit-only aria-label="Tirar a conta">${ic('x', 12)}</button></td></tr>`;
}
function renderContas() {
  const box = document.getElementById('contas');
  if (!box) return;
  box.innerHTML = itemsOf('contas').map(contaRow).join('');
  document.getElementById('contas-bars').innerHTML = freeBars()
    .map((b) => `<option value="${esc(b.label)}"></option>`)
    .join('');
}
function calcContas(t) {
  const vals = contaValues(t);
  for (const [id, c] of itemsOf('contas')) {
    const out = document.getElementById('cv-' + id);
    const why = document.getElementById('cw-' + id);
    if (!out || !why) continue;
    const r = filled(c.f) ? evalConta(c.f, vals) : null;
    out.textContent = r && r.ok ? r.value : '—';
    why.textContent = r && !r.ok ? `Conta inválida: ${r.why}.` : '';
    const barNote = document.getElementById('cb-' + id);
    if (barNote) barNote.textContent = contaBarNote(c.bar);
  }
}
/* a conta de uma barra com conta fixa não vale; uma barra que a mesa não tem ainda não recebe */
function contaBarNote(label) {
  if (!filled(label)) return '';
  const b = tableBar(label);
  if (b && resOf(b)) return `${b.label} já tem conta fixa.`;
  return b ? '' : 'A mesa ainda não tem essa barra: ela é criada com este máximo.';
}
/* barra que a mesa não tem: pedida uma vez por rótulo nesta abertura (o state seguinte a traz);
   a mesa só a cria se o modelo declara character:bars */
const creatingBars = new Set();
function createMissingContaBars(t) {
  const vals = contaValues(t);
  for (const [, c] of itemsOf('contas')) {
    if (!filled(c.bar) || !filled(c.f) || tableBar(c.bar)) continue;
    const key = barKey(c.bar);
    const r = evalConta(c.f, vals);
    if (creatingBars.has(key) || !r.ok || r.value < 1) continue;
    creatingBars.add(key);
    lorkarium.bars.create({ label: String(c.bar).trim(), max: r.value }).catch((e) => {
      creatingBars.delete(key);
      setStatus('A barra não foi criada: ' + failText(e));
    });
  }
}
/* [barra da mesa, máximo] das contas válidas; duas contas na mesma barra: vale a última */
function contaMaxes(t) {
  const vals = contaValues(t);
  const byBar = new Map();
  for (const [, c] of itemsOf('contas')) {
    const b = tableBar(c.bar);
    if (!b || resOf(b) || !filled(c.f)) continue;
    const r = evalConta(c.f, vals);
    if (r.ok && r.value >= 1) byBar.set(b.id, [b, r.value]);
  }
  return [...byBar.values()];
}
