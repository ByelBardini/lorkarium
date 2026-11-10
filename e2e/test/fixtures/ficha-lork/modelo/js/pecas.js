/* ---------- ícones ---------- */
const ICON = {
  chev: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
  trash:
    '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  left: '<path d="M21 6H3M15 12H3M17 18H3"/>',
  center: '<path d="M21 6H3M17 12H7M19 18H5"/>',
  rule: '<path d="M4 12h16"/>',
  quote: '<path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/>',
  clear:
    '<path d="m7 21-4.3-4.3a2.4 2.4 0 0 1 0-3.4l9.6-9.6a2.4 2.4 0 0 1 3.4 0l5.6 5.6a2.4 2.4 0 0 1 0 3.4L13 21M22 21H7M5 11l9 9"/>',
};
const ic = (n, s = 16) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

/* ---------- peças ---------- */
/* campo simples ligado ao valor por data-lk: o SDK preenche a cada state e grava por values.patch */
const bare = (p, ph, cls, attrs = '', id = nid(p)) =>
  `<input type="text" id="${id}" class="${cls}" data-lk="${p}" placeholder="${esc(ph)}" autocomplete="off" ${attrs}>`;
function field(label, p, ph = '', cls = '', attrs = '') {
  const id = nid(p);
  return `<div class="fld ${cls}"><label class="lbl" for="${id}">${label}</label>${bare(p, ph, 'in', attrs, id)}</div>`;
}
/* texto rico: data-rt, não data-lk, para a ficha mostrar o HTML limpo também a quem só lê */
const editor = (p, ph, aria) =>
  `<div class="rt-ed" contenteditable="true" role="textbox" aria-multiline="true" ${aria} data-rt="${p}" data-ph="${esc(ph)}"></div>`;
function rich(label, p, ph, cls = '') {
  const id = nid(p);
  if (!label) return `<div class="fld ${cls}">${editor(p, ph, `aria-label="${esc(ph)}"`)}</div>`;
  return `<div class="fld ${cls}" data-foldbox="${p}"><div class="fld-hd"><span class="lbl" id="${id}-l">${label}</span>${foldBtn(p, label)}</div>
    <p class="fold-prev"></p>${editor(p, ph, `aria-labelledby="${id}-l"`)}</div>`;
}
const foldBtn = (key, label) =>
  `<button type="button" class="fold" data-fold="${key}" data-keep aria-expanded="true" aria-label="Recolher ou mostrar: ${esc(label)}">${ic('chev', 14)}</button>`;
const isFolded = (k) => !!UI.fold[k];
function setFold(k, v) {
  if (v) UI.fold[k] = true;
  else delete UI.fold[k];
}
function applyFold(box) {
  const k = box.dataset.foldbox;
  const folded = isFolded(k);
  const btn = box.querySelector(`[data-fold="${k}"]`);
  box.classList.toggle('folded', folded);
  if (btn) btn.setAttribute('aria-expanded', String(!folded));
  const prev = box.querySelector(':scope > .fold-prev');
  const ed = box.querySelector(':scope > .rt-ed');
  if (!prev || !ed) return;
  const txt = ed.textContent.trim();
  prev.textContent = txt ? txt.slice(0, 160) + (txt.length > 160 ? '…' : '') : 'Vazio';
}
/* imagem guardada como id de asset da ficha (assets.upload); o arquivo é lido por assets.read */
const imgSlot = (p, label, cls) =>
  `<div class="img-slot ${cls}" data-img="${p}" data-label="${esc(label)}"><button type="button" class="img-btn"></button><button type="button" class="img-rm" data-edit-only hidden>Remover imagem</button><input type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Arquivo: ${esc(label)}"></div>`;
const optImg = (p) => imgSlot(p, 'Adicionar imagem', 'opt');
const pageHead = (eyebrow, title, hint = '') =>
  `<header><p class="eyebrow">${eyebrow}</p><h1 class="h1">${title}</h1>${hint ? `<p class="hint">${hint}</p>` : ''}</header>`;

/* ficha técnica no topo das entradas */
function specIn(label, p, ph = '—', attrs = '') {
  const id = nid(p);
  return `<div class="spec-row"><label class="lbl" for="${id}">${label}</label>${bare(p, ph, 'spec-in', attrs, id)}</div>`;
}
function specRich(label, p, ph) {
  const id = nid(p);
  return `<div class="spec-row"><span class="lbl" id="${id}-l">${label}</span>${editor(p, ph, `aria-labelledby="${id}-l"`)}</div>`;
}
