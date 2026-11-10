/* ---------- imagens ---------- */
/* Nada de rede nem de data: URL nos valores: cada imagem é um asset da ficha (assets.upload),
   guardado pelo id; os bytes chegam por assets.read e viram um blob: só desta página. */
const imageUrls = new Map();
let portraitUrl = '';
let portraitBytes = null;

function imageUrlOf(assetId) {
  if (!imageUrls.has(assetId)) {
    const read = lorkarium.assets
      .read(assetId)
      .then(({ type, bytes }) => URL.createObjectURL(new Blob([bytes], { type })));
    read.catch(() => imageUrls.delete(assetId));
    imageUrls.set(assetId, read);
  }
  return imageUrls.get(assetId);
}
function showImage(btn, url, label, small) {
  btn.textContent = '';
  btn.classList.toggle('has', !!url);
  btn.setAttribute('aria-label', (url ? 'Trocar imagem: ' : '') + label);
  if (!url) {
    btn.innerHTML = ic('image', small ? 15 : 20) + `<span>${esc(label)}</span>`;
    return;
  }
  const im = document.createElement('img');
  im.src = url;
  im.alt = '';
  btn.append(im);
}
function renderImg(slot) {
  const id = getP(slot.dataset.img);
  const btn = slot.querySelector('.img-btn');
  slot.querySelector('.img-rm').hidden = !id;
  if (slot.dataset.shown === String(id || '')) return;
  slot.dataset.shown = String(id || '');
  if (!id) return showImage(btn, '', slot.dataset.label, true);
  imageUrlOf(id).then(
    (url) => {
      if (slot.dataset.shown === id) showImage(btn, url, slot.dataset.label, true);
    },
    () => setStatus('Não deu para ler uma imagem da ficha.'),
  );
}
function uploadInto(slot, file) {
  setStatus('');
  lorkarium.assets
    .upload(file)
    .then(({ assetId }) => patch(slot.dataset.img, assetId).then(() => renderImg(slot)))
    .catch(imgFail);
}
const imgFail = (e) =>
  setStatus('Não deu para enviar essa imagem (PNG, JPG ou WebP): ' + failText(e));

/* o retrato é a imagem do personagem na mesa: chega no state e muda por character.setImage */
function readPortrait(token) {
  const image = token && token.image;
  if (!image || !image.bytes) {
    portraitBytes = null;
    portraitUrl = '';
    return;
  }
  // cada state traz uma cópia nova dos bytes: o tamanho e o tipo dizem se a imagem mudou
  const key = `${image.type}:${image.bytes.byteLength}`;
  if (key === portraitBytes) return;
  if (portraitUrl) URL.revokeObjectURL(portraitUrl);
  portraitBytes = key;
  portraitUrl = URL.createObjectURL(new Blob([image.bytes], { type: image.type }));
}
function renderPortrait() {
  const slot = document.querySelector('[data-portrait]');
  const note = document.getElementById('portrait-note');
  showImage(
    slot.querySelector('.img-btn'),
    portraitUrl,
    VIEW.character ? 'Trocar o retrato' : 'Sem retrato',
    false,
  );
  note.hidden = !!VIEW.character || !VIEW.canEdit;
  note.textContent = 'O retrato é o do personagem: esta ficha não é de um personagem.';
}
function changePortrait(file) {
  if (!VIEW.character) return;
  setStatus('');
  lorkarium.character.setImage(file).catch((e) => setStatus('O retrato não mudou: ' + failText(e)));
}
