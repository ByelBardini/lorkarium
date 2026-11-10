/* ---------- estado ---------- */
/* S é a cópia dos valores que a mesa confirmou (lorkarium.values); toda mudança sai por
   values.patch, por caminho, e volta no próximo state. Listas são objetos por id estável
   (lorkarium.lists) com um campo "ordem", porque o servidor não guarda a ordem das chaves. */
const MULTI = ['conhecimento', 'oficios', 'conducao'];
let S = {};
let VIEW = { canEdit: false, bars: [], character: null, token: null };
/* aba aberta, seções e entradas recolhidas são de quem olha: não vão para os valores */
const UI = { page: 'perfil', closed: {}, fold: {} };

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const getP = (p) => p.split('.').reduce((o, k) => (isObj(o) ? o[k] : undefined), S);
function setLocal(p, v) {
  const ks = p.split('.');
  let o = S;
  for (const k of ks.slice(0, -1)) {
    if (!isObj(o[k])) o[k] = {};
    o = o[k];
  }
  if (v === null) delete o[ks[ks.length - 1]];
  else o[ks[ks.length - 1]] = v;
}

/* o trilho só mostra aviso quando algo deu errado */
function setStatus(msg) {
  document.querySelectorAll('.status').forEach((el) => {
    el.textContent = msg;
  });
}
const failText = (e) => (e && e.message ? e.message : String(e));

/* null apaga o caminho; o estado local muda já, para a conta não esperar a volta do state */
function patchMany(pairs) {
  if (!VIEW.canEdit || !pairs.length) return Promise.resolve(false);
  pairs.forEach(([p, v]) => setLocal(p, v));
  markDirty();
  const patches = pairs.map(([p, v]) => ({ path: p.split('.'), value: v }));
  return lorkarium.values.patch(patches).then(
    () => true,
    (e) => {
      setStatus('Não foi possível salvar: ' + failText(e));
      return false;
    },
  );
}
const patch = (p, v) => patchMany([[p, v]]);

function itemsOf(path) {
  const box = getP(path);
  if (!isObj(box)) return [];
  return Object.entries(box)
    .filter(([, v]) => isObj(v))
    .sort(([a, x], [b, y]) => num(x.ordem) - num(y.ordem) || (a < b ? -1 : 1));
}
function addItem(path, item) {
  if (!VIEW.canEdit) return Promise.resolve(null);
  return lorkarium.lists
    .add(path, Object.assign({ ordem: Date.now() }, item || {}))
    .catch((e) => setStatus('Não foi possível adicionar: ' + failText(e)));
}
function removeItem(path, id) {
  if (!VIEW.canEdit) return Promise.resolve();
  return lorkarium.lists
    .remove(path, id)
    .catch((e) => setStatus('Não foi possível remover: ' + failText(e)));
}

/* CA, CD e os máximos das barras vão à mesa só depois de uma edição de quem tem a ficha:
   abrir a ficha nunca reescreve o que o mestre mudou à mão no card. */
let dirty = false;
let pushT = 0;
function markDirty() {
  dirty = true;
  schedulePush();
}
function schedulePush() {
  clearTimeout(pushT);
  pushT = setTimeout(() => {
    if (!dirty || !VIEW.canEdit) return;
    dirty = false;
    pushStats();
    syncBarMaxes();
  }, 600);
}

/* ---------- pequenos ---------- */
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
let uid = 0;
const nid = (p) => 'f-' + p.replace(/\./g, '-') + '-' + uid++;
const num = (v) => {
  const n = parseInt(String(v ?? '').replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};
const sign = (n) => (n > 0 ? '+' + n : String(n));
const filled = (v) => v != null && String(v).trim() !== '';
const pct = (cur, max) => (max > 0 ? Math.max(0, Math.min(1, cur / max)) * 100 : 0);
