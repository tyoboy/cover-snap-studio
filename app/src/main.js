// Cover Snap Studio — the editor.
//
// Loads the person's own photos (they never leave the machine), fills the
// poster's panels with them, and exports the cover as a PNG in the three
// post sizes. The preview canvas is drawn by the same renderer as the
// export, at the export's own aspect, so the art never shifts at download.
//
// A `?shot=` address drives the app for screenshots: ?shot=cover fills the
// frame with one finished cover, ?shot=editor shows the editor at work;
// &photo=pier|boulevard picks a bundled sample and &caption= sets the words.

import { SIZES, LAYOUTS, GRADES, drawCover } from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');

const state = {
  size: 'square',
  layout: 'vice-grid',
  grade: 'sunset',
  caption: 'Sunset Heist',
  captionColor: '',
  photos: [], // { img, name }
  slots: [], // per panel: { photo, panX, panY, zoom }
  activePanel: 0,
};

function layoutPanels() {
  return (LAYOUTS.find((l) => l.id === state.layout) ?? LAYOUTS[0]).panels;
}

// One photo in every panel only looks like a poster when each panel crops
// it differently — a wide establishing crop, a close-up, a detail — so new
// slots start from these crops, and the editor's drag and zoom refine them.
const CROP_PRESETS = [
  { panX: 0.5, panY: 0.35, zoom: 1.0 },
  { panX: 0.35, panY: 0.3, zoom: 1.7 },
  { panX: 0.62, panY: 0.45, zoom: 1.45 },
  { panX: 0.5, panY: 0.62, zoom: 1.2 },
];

function resetSlots() {
  state.slots = layoutPanels().map((_, i) => ({
    photo: state.photos.length ? i % state.photos.length : -1,
    ...CROP_PRESETS[i % CROP_PRESETS.length],
  }));
  state.activePanel = 0;
}

function currentSize() {
  return SIZES.find((s) => s.id === state.size) ?? SIZES[0];
}

function render() {
  const { w, h } = currentSize();
  if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
  drawCover(ctx, w, h, state);
  document.querySelectorAll('.panel-chip').forEach((chip, i) => {
    chip.classList.toggle('active', i === state.activePanel);
    chip.textContent = `Panel ${i + 1}${state.slots[i] && state.photos[state.slots[i].photo] ? ` · ${state.photos[state.slots[i].photo].name}` : ' · empty'}`;
  });
  const slot = state.slots[state.activePanel];
  if (slot) $('zoom').value = String(Math.round(slot.zoom * 100));
}

function loadImage(src, name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, name });
    img.onerror = reject;
    img.src = src;
  });
}

async function addPhotoFiles(files) {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    state.photos.push(await loadImage(url, file.name.replace(/\.[^.]+$/, '')));
  }
  if (state.slots.every((s) => s.photo < 0)) resetSlots();
  else state.slots.forEach((s, i) => { if (s.photo < 0 && state.photos.length) s.photo = i % state.photos.length; });
  buildPhotoTray();
  render();
}

function buildPhotoTray() {
  const tray = $('tray');
  tray.innerHTML = '';
  state.photos.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'tray-photo';
    b.title = `Put ${p.name} in the active panel`;
    const im = document.createElement('img');
    im.src = p.img.src;
    im.alt = p.name;
    b.appendChild(im);
    b.addEventListener('click', () => {
      state.slots[state.activePanel].photo = i;
      render();
    });
    tray.appendChild(b);
  });
}

// --- controls -------------------------------------------------------------
function buildChips(containerId, items, key, label) {
  const box = $(containerId);
  box.innerHTML = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.className = 'chip' + (state[key] === item.id ? ' on' : '');
    b.textContent = label(item);
    b.addEventListener('click', () => {
      state[key] = item.id;
      if (key === 'layout') resetSlots();
      buildAllChips();
      render();
    });
    box.appendChild(b);
  }
}

function buildAllChips() {
  buildChips('sizes', SIZES, 'size', (s) => s.label);
  buildChips('layouts', LAYOUTS, 'layout', (l) => l.name);
  buildChips('grades', GRADES, 'grade', (g) => g.name);
  const panels = $('panels');
  panels.innerHTML = '';
  layoutPanels().forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'chip panel-chip';
    b.addEventListener('click', () => { state.activePanel = i; render(); });
    panels.appendChild(b);
  });
}

$('files').addEventListener('change', (e) => addPhotoFiles([...e.target.files]));
$('samples').addEventListener('click', async () => {
  for (const name of ['pier', 'boulevard']) {
    state.photos.push(await loadImage(`samples/${name}.jpg`, name));
  }
  resetSlots();
  buildPhotoTray();
  render();
});
$('caption').addEventListener('input', (e) => { state.caption = e.target.value; render(); });
$('zoom').addEventListener('input', (e) => {
  state.slots[state.activePanel].zoom = Number(e.target.value) / 100;
  render();
});
$('export').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `cover-${state.size}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});

// Drag on the canvas pans the active panel's photo.
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, slot: state.slots[state.activePanel] };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  drag.slot.panX = Math.min(1, Math.max(0, drag.slot.panX - (e.clientX - drag.x) / rect.width));
  drag.slot.panY = Math.min(1, Math.max(0, drag.slot.panY - (e.clientY - drag.y) / rect.height));
  drag.x = e.clientX;
  drag.y = e.clientY;
  render();
});
canvas.addEventListener('pointerup', () => { drag = null; });

// --- shot mode --------------------------------------------------------------
async function boot() {
  buildAllChips();
  resetSlots();
  render();
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (shot) {
    const sample = q.get('photo') || 'pier';
    state.photos.push(await loadImage(`samples/${sample}.jpg`, sample));
    if (q.get('caption')) { state.caption = q.get('caption'); $('caption').value = state.caption; }
    if (q.get('size')) state.size = q.get('size');
    if (q.get('layout')) state.layout = q.get('layout');
    if (q.get('grade')) state.grade = q.get('grade');
    buildAllChips();
    resetSlots();
    buildPhotoTray();
    document.body.classList.add(shot === 'cover' ? 'shot-cover' : 'shot-editor');
    render();
  }
}

boot();
