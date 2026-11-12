/* ---------- eventos ---------- */
/* script do modelo não usa atributo on*: o CSP da ficha não o roda; tudo por addEventListener */
function arm(btn, action) {
  if (btn.dataset.armed) {
    delete btn.dataset.armed;
    action();
    return;
  }
  const label = btn.innerHTML;
  const aria = btn.getAttribute('aria-label');
  btn.dataset.armed = '1';
  // botão só de ícone não cabe o texto: fica vermelho e a dica pede o segundo clique
  if (btn.hasAttribute('data-arm-icon')) {
    btn.setAttribute('aria-label', 'Clique de novo para tirar');
    btn.title = 'Clique de novo para tirar';
  } else btn.textContent = btn.dataset.confirm || 'Clique de novo para confirmar';
  setTimeout(() => {
    if (!btn.isConnected || !btn.dataset.armed) return;
    delete btn.dataset.armed;
    btn.innerHTML = label;
    if (aria) btn.setAttribute('aria-label', aria);
    btn.removeAttribute('title');
  }, 3500);
}
function onCarry(el) {
  const p = el.dataset.carry;
  const pairs = [[p + '.guardado', el.checked ? null : true]];
  if (!el.checked && (getP(p) || {}).emUso) pairs.push([p + '.emUso', null]);
  patchMany(pairs).then(refresh);
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el || !el.dataset) return;
  // o campo data-lk o próprio SDK grava; aqui só se marca que CA, CD e máximos podem ter mudado
  if (el.dataset.lk) return markDirty();
  if (el.dataset.rt) return saveRich(el);
  if (el.dataset.carry) return onCarry(el);
  if (el.dataset.wear) return setWorn(el.dataset.wear, el.checked).then(refresh);
});
const wholeOf = (el) => {
  const v = String(el.value).trim();
  return /^\d+$/.test(v) ? Number(v) : null;
};
document.addEventListener('change', (e) => {
  const el = e.target;
  if (!el || !el.dataset) return;
  if (el.dataset.barcur && wholeOf(el) != null)
    return adjustBar(el.dataset.barcur, { op: 'set', value: wholeOf(el) });
  if (el.dataset.barmax && wholeOf(el) > 0)
    return adjustBar(el.dataset.barmax, { op: 'max', value: wholeOf(el) });
  if (el.type !== 'file' || !el.files || !el.files[0]) return;
  const file = el.files[0];
  el.value = '';
  if (el.closest('[data-portrait]')) return changePortrait(file);
  uploadInto(el.closest('[data-img]'), file);
});
document.addEventListener('focusin', (e) => {
  const ed = e.target.closest && e.target.closest('.rt-ed');
  if (!ed || !VIEW.canEdit) return;
  primeEmpty(ed);
  activeEd = ed;
  document.getElementById('rtbar').classList.add('on');
  syncToolbar();
});
document.addEventListener('focusout', (e) => {
  const ed = e.target.closest && e.target.closest('.rt-ed');
  if (ed && ed.classList.contains('empty')) {
    ed.innerHTML = '';
    if (getP(ed.dataset.rt)) saveRich(ed);
  }
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a.closest && (a.closest('.rt-ed') || a.closest('#rtbar'))) return;
    document.getElementById('rtbar').classList.remove('on');
    document.getElementById('swatches').classList.remove('on');
  }, 0);
});
document.addEventListener('selectionchange', () => {
  if (!activeEd || document.activeElement !== activeEd) return;
  keepRange();
  syncToolbar();
});
document.addEventListener('paste', (e) => {
  if (e.target.closest && e.target.closest('.rt-ed')) pasteInto(e);
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'rank-list') onRankKey(e);
});

const CLICKS = {
  goto: (b) => showPage(b.dataset.goto),
  page: (b) => showPage(b.dataset.page),
  toggle(b) {
    const key = b.dataset.toggle;
    UI.closed[key] = !UI.closed[key];
    b.closest('.entry').classList.toggle('closed', UI.closed[key]);
    b.setAttribute('aria-expanded', String(!UI.closed[key]));
  },
  add: (b) => addItem(b.dataset.add),
  rm(b) {
    const [n, id] = b.dataset.rm.split(':');
    arm(b, () => removeItem(n, id));
  },
  tr(b) {
    patch(b.dataset.tr, multOf(getP(b.dataset.tr)) ? null : 1).then(refresh);
  },
  mult(b) {
    patch(b.dataset.mult, NEXT_MULT[multOf(getP(b.dataset.mult))] || 1).then(refresh);
  },
  padd: (b) => addItem('perlist.' + b.dataset.padd),
  prm(b) {
    const [k, id] = b.dataset.prm.split(':');
    removeItem('perlist.' + k, id);
  },
  addcost(b) {
    const first = sortedBars()[0];
    addItem(`${b.dataset.addcost}.custos`, {
      bar: tableBar('MP') ? 'MP' : first ? first.label : '',
      v: '',
    });
  },
  rmcost(b) {
    const [base, costId] = b.dataset.rmcost.split('|');
    removeItem(`${base}.custos`, costId);
  },
  use: (b) => useSkill(b.dataset.use),
  fold(b) {
    const k = b.dataset.fold;
    setFold(k, !isFolded(k));
    applyFold(b.closest(`[data-foldbox="${k}"]`));
  },
  foldall(b) {
    const close = b.dataset.foldall === 'close';
    document.querySelectorAll('#pg-origem [data-foldbox]').forEach((box) => {
      setFold(box.dataset.foldbox, close && box.dataset.foldbox.startsWith('sec.'));
      applyFold(box);
    });
  },
  rest: (b) => takeRest(b),
  addbag: () => addItem('mochila'),
  rmbag: (b) => removeItem('mochila', b.dataset.rmbag),
  resettrain: () => patch('f.treino', null).then(refresh),
  reset: (b) => patch(`res.${b.dataset.reset}.max`, null).then(refresh),
};
function onImageClick(b) {
  const slot = b.closest('[data-img],[data-portrait]');
  if (b.classList.contains('img-btn')) {
    if (VIEW.canEdit && !(slot.hasAttribute('data-portrait') && !VIEW.character))
      slot.querySelector('input[type=file]').click();
    return;
  }
  patch(slot.dataset.img, null).then(() => renderImg(slot));
}
document.addEventListener('click', (e) => {
  const rankList = document.getElementById('rank-list');
  const li = e.target.closest && e.target.closest('[data-rank]');
  if (li) return VIEW.canEdit && pickRank(li.dataset.rank);
  if (e.target.closest('#rank-btn')) return openRank(rankList.hidden);
  if (!rankList.hidden && !e.target.closest('#rank-wrap')) openRank(false);
  const prev = e.target.closest('.fold-prev');
  if (prev) {
    const box = prev.closest('[data-foldbox]');
    setFold(box.dataset.foldbox, false);
    applyFold(box);
    return;
  }
  const b = e.target.closest('button');
  if (!b || b.disabled || b.closest('#rtbar')) return;
  if (b.classList.contains('img-btn') || b.classList.contains('img-rm')) return onImageClick(b);
  const key = Object.keys(CLICKS).find((k) => k in b.dataset);
  if (key) CLICKS[key](b);
});
const rtbar = document.getElementById('rtbar');
rtbar.addEventListener('mousedown', (e) => e.preventDefault());
rtbar.addEventListener('click', (e) => {
  const sw = e.target.closest('[data-color]');
  if (sw) {
    document.getElementById('swatches').classList.remove('on');
    runCmd('foreColor', sw.dataset.color);
    return;
  }
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  if (b.dataset.cmd === 'color') document.getElementById('swatches').classList.toggle('on');
  else runCmd(b.dataset.cmd);
});
