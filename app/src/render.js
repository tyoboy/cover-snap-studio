// Cover renderer: draws a complete GTA-style poster cover onto a canvas.
//
// One renderer serves both the live preview and the exported PNG, so what
// the editor shows is byte-for-byte the art that leaves the app. A cover is:
// a colour-graded backdrop, a grid of photo panels with hard white keylines
// (the comic-panel poster look), each photo cover-fitted and then panned and
// zoomed by its own placement, a duotone grade laid over the photos, and the
// caption set in heavy condensed lettering across the lower third.
//
// Placements are kept in panel-relative units: pan is a fraction of the
// photo's overflow, zoom a multiplier of the cover-fit scale, so a placement
// means the same thing at preview size and at 1920 x 1080.

export const SIZES = [
  { id: 'square', label: '1080 × 1080 · post', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350 · portrait', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 × 1080 · wide', w: 1920, h: 1080 },
];

// Panel layouts as fractions of the canvas (x, y, w, h). The caption band is
// drawn over the bottom of the panels, poster-style.
export const LAYOUTS = [
  {
    id: 'vice-grid', name: 'Vice Grid',
    panels: [
      { x: 0.0, y: 0.0, w: 0.62, h: 0.66 },
      { x: 0.62, y: 0.0, w: 0.38, h: 0.33 },
      { x: 0.62, y: 0.33, w: 0.38, h: 0.33 },
      { x: 0.0, y: 0.66, w: 1.0, h: 0.34 },
    ],
  },
  {
    id: 'cover-star', name: 'Cover Star',
    panels: [
      { x: 0.0, y: 0.0, w: 1.0, h: 0.58 },
      { x: 0.0, y: 0.58, w: 0.5, h: 0.42 },
      { x: 0.5, y: 0.58, w: 0.5, h: 0.42 },
    ],
  },
  {
    id: 'three-streets', name: 'Three Streets',
    panels: [
      { x: 0.0, y: 0.0, w: 0.34, h: 1.0 },
      { x: 0.34, y: 0.0, w: 0.33, h: 1.0 },
      { x: 0.67, y: 0.0, w: 0.33, h: 1.0 },
    ],
  },
];

export const GRADES = [
  {
    id: 'sunset', name: 'Vice Sunset',
    sky: ['#2b1055', '#7597de'],
    wash: 'rgba(255, 94, 98, 0.20)',
    glow: 'rgba(255, 170, 60, 0.25)',
    caption: '#ffffff', accent: '#ffb03a',
  },
  {
    id: 'neon', name: 'Neon Night',
    sky: ['#050510', '#1b2a6b'],
    wash: 'rgba(0, 229, 255, 0.16)',
    glow: 'rgba(255, 43, 214, 0.22)',
    caption: '#ffffff', accent: '#2be4ff',
  },
  {
    id: 'gold', name: 'Gold Hour',
    sky: ['#3a1c00', '#8a5a13'],
    wash: 'rgba(255, 183, 0, 0.20)',
    glow: 'rgba(255, 120, 40, 0.22)',
    caption: '#fff7e0', accent: '#ffd23e',
  },
];

const FONT_STACK = '"Arial Narrow Bold", "Arial Black", Impact, "Liberation Sans", sans-serif';

function coverFit(img, pw, ph, zoom) {
  const scale = Math.max(pw / img.naturalWidth, ph / img.naturalHeight) * zoom;
  return { dw: img.naturalWidth * scale, dh: img.naturalHeight * scale };
}

// state: { layout, grade, caption, captionColor, photos: [{img}], slots:
// [{photo: index into photos, panX, panY, zoom}] one per panel }
export function drawCover(ctx, W, H, state) {
  const grade = GRADES.find((g) => g.id === state.grade) ?? GRADES[0];
  const layout = LAYOUTS.find((l) => l.id === state.layout) ?? LAYOUTS[0];

  // Backdrop: the grade's sky, so an empty panel still reads as poster sky.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, grade.sky[0]);
  sky.addColorStop(1, grade.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Panels.
  const gap = Math.max(6, Math.round(W * 0.008));
  layout.panels.forEach((p, i) => {
    const px = p.x * W + gap / 2;
    const py = p.y * H + gap / 2;
    const pw = p.w * W - gap;
    const ph = p.h * H - gap;
    const slot = state.slots[i];
    const photo = slot && state.photos[slot.photo];
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    if (photo && photo.img) {
      const { dw, dh } = coverFit(photo.img, pw, ph, slot.zoom);
      const dx = px + (pw - dw) * slot.panX;
      const dy = py + (ph - dh) * slot.panY;
      ctx.drawImage(photo.img, dx, dy, dw, dh);
      // The grade: a colour wash and a low glow, so any photo takes the
      // poster's palette instead of fighting it.
      ctx.fillStyle = grade.wash;
      ctx.fillRect(px, py, pw, ph);
      const glow = ctx.createLinearGradient(0, py + ph, 0, py);
      glow.addColorStop(0, grade.glow);
      glow.addColorStop(0.55, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(px, py, pw, ph);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `700 ${Math.round(W * 0.02)}px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText('ADD A PHOTO', px + pw / 2, py + ph / 2);
    }
    ctx.restore();
    // The keyline: a hard white border is the poster's panel language.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, W * 0.005);
    ctx.strokeRect(px, py, pw, ph);
  });

  drawCaption(ctx, W, H, state, grade);
}

function drawCaption(ctx, W, H, state, grade) {
  const text = (state.caption || '').trim();
  if (!text) return;
  const words = text.toUpperCase().split(/\s+/);
  // Two lines at most: balance the words across them.
  let lines = [words.join(' ')];
  if (words.length > 1) {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ').length;
      const b = words.slice(i).join(' ').length;
      if (Math.abs(a - b) < bestScore) { bestScore = Math.abs(a - b); best = i; }
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  let size = W * 0.115;
  ctx.textAlign = 'center';
  const setFont = (s) => { ctx.font = `900 ${s}px ${FONT_STACK}`; };
  setFont(size);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > W * 0.92) {
    size *= (W * 0.92) / widest;
    setFont(size);
  }
  const lineH = size * 1.04;
  const baseY = H - H * 0.055 - (lines.length - 1) * lineH;
  // A soft shadow band so the lettering holds over any photo.
  const bandTop = baseY - size * 1.25;
  const band = ctx.createLinearGradient(0, bandTop, 0, H);
  band.addColorStop(0, 'rgba(0,0,0,0)');
  band.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = band;
  ctx.fillRect(0, bandTop, W, H - bandTop);
  lines.forEach((line, i) => {
    const y = baseY - (lines.length - 1 - i) * lineH;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,5,20,0.9)';
    ctx.lineWidth = size * 0.16;
    ctx.strokeText(line, W / 2, y);
    ctx.fillStyle = i === lines.length - 1 && lines.length > 1 ? grade.accent : (state.captionColor || grade.caption);
    ctx.fillText(line, W / 2, y);
  });
}
