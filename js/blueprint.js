/**
 * Plan coté 2D (vue de dessus) — sert à vérifier la fidélité au pixel près
 * par rapport à la photo d'origine.
 */

export function drawBlueprint(canvas, bp, opts = {}) {
  const { showGrid = true, showDims = true } = opts;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, W, H);

  const margin = 56;
  const scale = Math.min(
    (W - margin * 2) / bp.box.width,
    (H - margin * 2) / bp.box.height,
  );

  // repère : X vers la droite, Y vers le haut, origine au centre de la pièce
  const tx = (x) => W / 2 + x * scale;
  const ty = (y) => H / 2 - y * scale;

  if (showGrid) {
    ctx.strokeStyle = 'rgba(108,199,255,0.08)';
    ctx.lineWidth = 1;
    const step = 10; // 10 mm
    for (let x = -100; x <= 100; x += step) {
      ctx.beginPath(); ctx.moveTo(tx(x), 0); ctx.lineTo(tx(x), H); ctx.stroke();
    }
    for (let y = -100; y <= 100; y += step) {
      ctx.beginPath(); ctx.moveTo(0, ty(y)); ctx.lineTo(W, ty(y)); ctx.stroke();
    }
    // axes
    ctx.strokeStyle = 'rgba(108,199,255,0.28)';
    ctx.beginPath(); ctx.moveTo(tx(0), 0); ctx.lineTo(tx(0), H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ty(0)); ctx.lineTo(W, ty(0)); ctx.stroke();
  }

  // contour
  ctx.beginPath();
  bp.outline.forEach((p, i) => {
    const X = tx(p.x), Y = ty(p.y);
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(108,199,255,0.07)';
  ctx.fill();
  ctx.strokeStyle = '#6cc7ff';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // perçages
  ctx.strokeStyle = '#ffb454';
  ctx.lineWidth = 1.2;
  for (const c of bp.circles) {
    ctx.beginPath();
    ctx.arc(tx(c.x), ty(c.y), c.r * scale, 0, Math.PI * 2);
    ctx.stroke();
    // croix d'axe
    ctx.strokeStyle = 'rgba(255,180,84,0.5)';
    const k = c.r * scale + 3;
    ctx.beginPath();
    ctx.moveTo(tx(c.x) - k, ty(c.y)); ctx.lineTo(tx(c.x) + k, ty(c.y));
    ctx.moveTo(tx(c.x), ty(c.y) - k); ctx.lineTo(tx(c.x), ty(c.y) + k);
    ctx.stroke();
    ctx.strokeStyle = '#ffb454';
  }

  // découpes rectangulaires
  for (const r of bp.rects) {
    ctx.beginPath();
    ctx.rect(tx(r.x - r.w / 2), ty(r.y + r.h / 2), r.w * scale, r.h * scale);
    ctx.stroke();
  }

  // octogone
  const o = bp.octagon;
  const R = o.acrossFlats / 2 / Math.cos(Math.PI / 8);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const X = tx(o.x + R * Math.cos(a));
    const Y = ty(o.y + R * Math.sin(a));
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.stroke();

  if (showDims) {
    ctx.fillStyle = '#8fa3bf';
    ctx.font = '12px ui-monospace, monospace';
    ctx.strokeStyle = '#8fa3bf';
    ctx.lineWidth = 1;

    // longueur (verticale, à droite)
    const xr = tx(bp.box.maxX) + 22;
    ctx.beginPath();
    ctx.moveTo(xr, ty(bp.box.maxY)); ctx.lineTo(xr, ty(bp.box.minY));
    ctx.moveTo(xr - 4, ty(bp.box.maxY)); ctx.lineTo(xr + 4, ty(bp.box.maxY));
    ctx.moveTo(xr - 4, ty(bp.box.minY)); ctx.lineTo(xr + 4, ty(bp.box.minY));
    ctx.stroke();
    ctx.save();
    ctx.translate(xr + 16, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`L = ${bp.box.height.toFixed(1)} mm`, 0, 0);
    ctx.restore();

    // largeur (horizontale, en bas)
    const yb = ty(bp.box.minY) + 22;
    ctx.beginPath();
    ctx.moveTo(tx(bp.box.minX), yb); ctx.lineTo(tx(bp.box.maxX), yb);
    ctx.moveTo(tx(bp.box.minX), yb - 4); ctx.lineTo(tx(bp.box.minX), yb + 4);
    ctx.moveTo(tx(bp.box.maxX), yb - 4); ctx.lineTo(tx(bp.box.maxX), yb + 4);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`l = ${bp.box.width.toFixed(1)} mm`, W / 2, yb + 16);

    // échelle
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5c7089';
    ctx.fillText(`échelle photo : 1 px = ${bp.mmPerPx.toFixed(4)} mm`, 12, H - 12);
    ctx.fillText('AVANT ▲', 12, 22);
  }
}
