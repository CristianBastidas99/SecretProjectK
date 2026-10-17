// Guardar la carta: arma un PDF (una página por sección) dibujando cada página en un canvas.
// Sin librerías: los SVG se «hornean» con sus estilos calculados y el PDF se escribe a mano con JPEG.

const W = 1240;
const H = 1754;
const PW = 420; // puntos PDF (A5 aprox.), misma proporción que el canvas
const PH = 594;

// Mismos valores que body[data-theme] en styles.css.
const INK = '#24221F';
const INK_SOFT = '#51483F';
const THEMES = {
  paper: { bg: '#F4EFE6', fg: INK, soft: INK_SOFT, accent: '#8E5441', hl: '#854E3C' },
  'paper-cool': { bg: '#E9EBE6', fg: INK, soft: INK_SOFT, accent: '#5C6450', hl: '#555C49' },
  'paper-warm': { bg: '#F1E7D6', fg: INK, soft: INK_SOFT, accent: '#8E5441', hl: '#7E4A39' },
  'paper-light': { bg: '#FAF6EE', fg: INK, soft: INK_SOFT, accent: '#5C6450', hl: '#5C6450' },
  sand: { bg: '#C8A66A', fg: INK, soft: '#3A342E', accent: '#52301A', hl: '#432715' },
  gold: { bg: '#D2AE72', fg: INK, soft: '#3A342E', accent: '#52301A', hl: '#4E2D19' },
  'rose-night': { bg: '#232A35', fg: '#E6DDCB', soft: '#B5AEA0', accent: '#CDAA70', hl: '#CDAA70' }
};

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"DM Sans", system-ui, sans-serif';
const MONO = '"DM Mono", ui-monospace, monospace';

const PROPS = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'display', 'visibility'];

const pad2 = (n) => String(n).padStart(2, '0');

// Calcula los estilos de reposo del SVG dentro de un contenedor fuera de pantalla y los deja en línea.
// `wrap` es el HTML del contenedor con un [data-slot] donde va el SVG (para que apliquen los selectores del sitio).
function bake(svg, wrap, theme, vbWidth) {
  const host = document.createElement('div');
  host.className = 'ks-bake';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:400px;pointer-events:none;' +
    `--bg:${theme.bg};--fg:${theme.fg};--fg-soft:${theme.soft};--accent:${theme.accent};--hl:${theme.hl};color:${theme.fg}`;
  host.innerHTML = wrap;
  host.querySelector('[data-slot]').appendChild(svg);
  document.body.appendChild(host);
  const els = [svg, ...svg.querySelectorAll('*')];
  const found = els.map((el) => {
    const cs = getComputedStyle(el);
    const out = PROPS.map((p) => [p, cs.getPropertyValue(p)]);
    const nss = cs.getPropertyValue('vector-effect') === 'non-scaling-stroke';
    return { out, nss };
  });
  host.remove();
  els.forEach((el, i) => {
    const { out, nss } = found[i];
    const style = out
      .map(([p, v]) => {
        if (p === 'stroke-width' && nss) v = (parseFloat(v) * vbWidth) / 400 + 'px'; // grosor visto a ~400 px
        return v ? p + ':' + v : '';
      })
      .filter(Boolean)
      .join(';');
    el.setAttribute('style', style);
    el.removeAttribute('class');
    el.removeAttribute('vector-effect');
  });
  return svg;
}

function svgImage(svg, w, h) {
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  const src = new XMLSerializer().serializeToString(svg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  });
}

function viewBoxOf(svg) {
  const vb = (svg.getAttribute('viewBox') || '0 0 200 200').split(/[\s,]+/).map(Number);
  return { w: vb[2] || 200, h: vb[3] || 200 };
}

// SVG propios del sitio (sin scripts ni enlaces externos): se leen tal cual.
async function fromFile(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
    return document.importNode(root, true);
  } catch (e) {
    return null;
  }
}

function framePart(src, part) {
  const svg = src.cloneNode(true);
  svg.querySelectorAll('[data-part="' + (part === 'top' ? 'bottom' : 'top') + '"]').forEach((n) => n.remove());
  svg.setAttribute('viewBox', part === 'top' ? '0 0 400 400' : '0 400 400 400');
  return svg;
}

// ---------- texto ----------

function spaced(ctx, text, cx, y, track) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + track;
  });
}

// runs: [{ text, font, color, hl }] -> líneas de fichas medidas.
function wrapRuns(ctx, runs, maxW) {
  const lines = [];
  let line = [];
  let lw = 0;
  const flush = () => {
    while (line.length && /^\s+$/.test(line[line.length - 1].text)) lw -= line.pop().w;
    lines.push({ items: line, w: lw });
    line = [];
    lw = 0;
  };
  runs.forEach((r) => {
    r.text.split(/(\s+)/).filter(Boolean).forEach((t) => {
      const space = /^\s+$/.test(t);
      if (space && !line.length) return;
      ctx.font = r.font;
      const w = ctx.measureText(space ? ' ' : t).width;
      if (!space && lw + w > maxW && line.length) flush();
      line.push({ text: space ? ' ' : t, font: r.font, color: r.color, hl: r.hl, w });
      lw += w;
    });
  });
  if (line.length) flush();
  return lines;
}

function drawLines(ctx, lines, y, lineH, size, hlColor) {
  ctx.textAlign = 'left';
  lines.forEach((ln, i) => {
    const base = y + i * lineH;
    let x = (W - ln.w) / 2;
    ln.items.forEach((it) => {
      if (it.hl && hlColor) {
        ctx.fillStyle = hlColor;
        ctx.fillRect(x, base - size * 0.2, it.w, size * 0.36);
      }
      ctx.font = it.font;
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, x, base);
      x += it.w;
    });
  });
}

function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// ---------- páginas ----------

// Marcos arriba y abajo; la franja del contenido (z0..z1) se borra con bordes suaves para que no tapen el texto.
async function drawFrames(ctx, frame, theme, z0, z1) {
  if (!frame) return;
  const wrap = '<section class="sec"><div class="frame" data-slot></div></section>';
  const top = await svgImage(bake(framePart(frame, 'top'), wrap, theme, 400), W, W);
  const bottom = await svgImage(bake(framePart(frame, 'bottom'), wrap, theme, 400), W, W);
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lc = layer.getContext('2d');
  if (top) lc.drawImage(top, 0, 0, W, W);
  if (bottom) lc.drawImage(bottom, 0, H - W, W, W);
  const f = 90;
  const g = lc.createLinearGradient(0, z0 - f, 0, z1 + f);
  const span = z1 - z0 + 2 * f;
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(f / span, 'rgba(0,0,0,1)');
  g.addColorStop(1 - f / span, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  lc.globalCompositeOperation = 'destination-out';
  lc.fillStyle = g;
  lc.fillRect(0, z0 - f, W, span);
  ctx.drawImage(layer, 0, 0);
}

async function sectionPage(ctx, s, n, total) {
  const theme = THEMES[s.theme] || THEMES.paper;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const [frame, ill] = await Promise.all([
    s.frame ? fromFile('svg/frames/' + encodeURIComponent(s.frame) + '.svg') : null,
    s.illustration ? fromFile('svg/illustrations/' + encodeURIComponent(s.illustration) + '.svg') : null
  ]);
  // Texto: párrafos con la frase destacada.
  const textSize = 38;
  const textLH = 66;
  const body = `400 ${textSize}px ${SANS}`;
  const bold = `600 ${textSize}px ${SANS}`;
  const quote = typeof s.quote === 'string' ? s.quote.trim() : '';
  let marked = false;
  const paras = String(s.text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((t) => {
    const at = quote && !marked ? t.indexOf(quote) : -1;
    if (at < 0) return [{ text: t, font: body, color: theme.fg }];
    marked = true;
    return [
      { text: t.slice(0, at), font: body, color: theme.fg },
      { text: quote, font: bold, color: theme.hl, hl: true },
      { text: t.slice(at + quote.length), font: body, color: theme.fg }
    ].filter((r) => r.text);
  });
  const paraLines = paras.map((runs) => wrapRuns(ctx, runs, 960));
  const textH = paraLines.reduce((a, l) => a + l.length * textLH, 0) + (paraLines.length - 1) * textSize * 1.1;

  const titleSize = 104;
  const titleFont = `italic 500 ${titleSize}px ${SERIF}`;
  const titleLines = wrapRuns(ctx, [{ text: s.title || '', font: titleFont, color: theme.fg }], 1000);
  const titleH = titleLines.length * titleSize * 1.08;

  // Bloque centrado entre los marcos; la ilustración cede espacio si el texto es largo.
  const top = 240;
  const bottom = H - 230;
  const fixed = 34 + 40 + 50 + titleH + 54 + textH;
  const illS = Math.max(300, Math.min(540, bottom - top - fixed));
  let y = top + Math.max(0, (bottom - top - fixed - illS) / 2);
  await drawFrames(ctx, frame, theme, y - 10, y + fixed + illS + 10);

  ctx.fillStyle = theme.soft;
  ctx.font = `400 30px ${MONO}`;
  spaced(ctx, pad2(n) + ' / ' + pad2(total), W / 2, y + 26, 7);
  y += 34 + 40;

  if (ill) {
    const vb = viewBoxOf(ill);
    const img = await svgImage(bake(ill, '<section class="sec"><div class="sec-ill" data-slot></div></section>', theme, vb.w), illS, illS);
    if (img) ctx.drawImage(img, (W - illS) / 2, y, illS, illS);
  }
  y += illS + 50;

  titleLines.forEach((ln, i) => {
    ctx.font = titleFont;
    ctx.fillStyle = theme.fg;
    ctx.textAlign = 'center';
    ctx.fillText(ln.items.map((it) => it.text).join(''), W / 2, y + titleSize * 0.82 + i * titleSize * 1.08);
  });
  y += titleH + 54;

  paraLines.forEach((lines) => {
    drawLines(ctx, lines, y + textSize * 0.95, textLH, textSize, alpha(theme.hl, 0.16));
    y += lines.length * textLH + textSize * 1.1;
  });
}

async function coverPage(ctx, cfg, closing) {
  const theme = THEMES.paper;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const flowers = ['.bq-l', '.bq-r'].map((sel) => document.querySelector('#cover ' + sel));
  for (let i = 0; i < flowers.length; i++) {
    if (!flowers[i]) continue;
    // viewBox ampliado: las flores más altas sobresalen del original.
    const svg = bake(flowers[i].cloneNode(true), '<div class="cover-flowers" data-slot></div>', theme, 200);
    svg.setAttribute('viewBox', '-20 -110 240 522');
    svg.setAttribute('overflow', 'visible');
    const img = await svgImage(svg, 396, 861);
    if (img) ctx.drawImage(img, i ? W - 343 : -53, H - 861, 396, 861);
  }
  const env = document.querySelector('#envelope svg');
  let y = 470;
  if (env) {
    const svg = bake(env.cloneNode(true), '<div class="envelope" data-slot></div>', theme, 320);
    const img = await svgImage(svg, 560, 385);
    if (img) ctx.drawImage(img, (W - 560) / 2, y, 560, 385);
    y += 385 + 110;
  }
  if (cfg.cover) {
    const f = `italic 500 112px ${SERIF}`;
    const lines = wrapRuns(ctx, [{ text: cfg.cover, font: f, color: theme.fg }], 1000);
    lines.forEach((ln, i) => {
      ctx.font = f;
      ctx.fillStyle = theme.fg;
      ctx.textAlign = 'center';
      ctx.fillText(ln.items.map((it) => it.text).join(''), W / 2, y + 90 + i * 120);
    });
    y += lines.length * 120 + 60;
  }
  if (closing.date) {
    ctx.fillStyle = theme.soft;
    ctx.font = `400 32px ${MONO}`;
    spaced(ctx, closing.date, W / 2, y + 30, 10);
  }
}

async function endPage(ctx, closing) {
  const theme = THEMES['rose-night'];
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  let y = 300;
  if (typeof closing.portrait === 'string') {
    const doc = new DOMParser().parseFromString(closing.portrait, 'image/svg+xml');
    const root = doc.documentElement;
    if (root && root.nodeName === 'svg' && !doc.querySelector('parsererror')) {
      const svg = document.importNode(root, true);
      const vb = viewBoxOf(svg);
      bake(svg, '<div class="end-night"><div class="end-portrait" data-slot></div></div>', theme, vb.w);
      // Estado final de la animación de apertura (alas abiertas, glifos y relleno visibles).
      const pw = 1000;
      const ph = Math.round((pw * vb.h) / vb.w);
      const img = await svgImage(revealPortrait(svg, closing.portrait), pw, ph);
      if (img) ctx.drawImage(img, (W - pw) / 2, y, pw, ph);
      y += ph + 70;
    }
  }
  if (closing.end) {
    const f = `italic 500 120px ${SERIF}`;
    ctx.font = f;
    ctx.fillStyle = theme.fg;
    ctx.textAlign = 'center';
    ctx.fillText(closing.end, W / 2, y + 100);
    y += 170;
  }
  if (closing.date) {
    ctx.fillStyle = theme.soft;
    ctx.font = `400 32px ${MONO}`;
    spaced(ctx, closing.date, W / 2, y + 30, 10);
    y += 100;
  }
  if (closing.credit) {
    ctx.fillStyle = theme.soft;
    ctx.font = `400 28px ${MONO}`;
    spaced(ctx, '♪ ' + closing.credit, W / 2, y + 30, 2);
  }
}

// Reverso del disco (si closing.portrait trae la cara de atrás): solo el disco volteado y la fecha.
async function backPage(ctx, closing) {
  if (typeof closing.portrait !== 'string' || closing.portrait.indexOf('face-b') < 0) return false;
  const doc = new DOMParser().parseFromString(closing.portrait, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg' || doc.querySelector('parsererror')) return false;
  const theme = THEMES['rose-night'];
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const svg = document.importNode(root, true);
  const vb = viewBoxOf(svg);
  bake(svg, '<div class="end-night"><div class="end-portrait is-back" data-slot></div></div>', theme, vb.w);
  const pw = 1100;
  const ph = Math.round((pw * vb.h) / vb.w);
  const y = Math.round((H - ph) / 2) - 90;
  const img = await svgImage(revealPortrait(svg, closing.portrait), pw, ph);
  if (!img) return false;
  ctx.drawImage(img, (W - pw) / 2, y, pw, ph);
  if (closing.date) {
    ctx.fillStyle = theme.soft;
    ctx.font = `400 32px ${MONO}`;
    ctx.textAlign = 'center';
    spaced(ctx, closing.date, W / 2, y + ph + 110, 10);
  }
  return true;
}

// Las clases se quitaron al hornear; se recupera el estado final por clase leyendo el SVG original.
function revealPortrait(svg, src) {
  const orig = new DOMParser().parseFromString(src, 'image/svg+xml').documentElement;
  const a = [orig, ...orig.querySelectorAll('*')];
  const b = [svg, ...svg.querySelectorAll('*')];
  a.forEach((el, i) => {
    const t = b[i];
    if (!t) return;
    const cls = el.classList;
    if (cls.contains('wing')) t.style.transform = 'none';
    if (cls.contains('glyph')) t.style.opacity = '0.85';
    if (cls.contains('glow') || cls.contains('fillin')) t.style.opacity = '1';
  });
  return svg;
}

// ---------- PDF ----------

function makePdf(pages) {
  const enc = new TextEncoder();
  const parts = [];
  const offs = [];
  let len = 0;
  const push = (x) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    len += b.length;
  };
  const obj = (id, write) => {
    offs[id] = len;
    push(id + ' 0 obj\n');
    write();
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%âã\n');
  const n = pages.length;
  const kids = pages.map((_, i) => 3 + i * 3 + ' 0 R').join(' ');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  pages.forEach((p, i) => {
    const pid = 3 + i * 3;
    const cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${pid + 2} 0 R >> >> /Contents ${pid + 1} 0 R >>`));
    obj(pid + 1, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
    obj(pid + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.length} >>\nstream\n`);
      push(p);
      push('\nendstream');
    });
  });
  const count = 3 + n * 3;
  const xref = len;
  let x = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) x += String(offs[id]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

function jpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject) : reject(new Error('jpeg'))), 'image/jpeg', 0.86);
  });
}

export async function makeKeepsakePdf(carta, cfg) {
  if (document.fonts && document.fonts.load) {
    await Promise.all([
      document.fonts.load(`italic 500 100px ${SERIF}`),
      document.fonts.load(`400 38px ${SANS}`),
      document.fonts.load(`600 38px ${SANS}`),
      document.fonts.load(`400 30px ${MONO}`)
    ]).catch(() => {});
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';
  const closing = carta.closing || {};
  const sections = Array.isArray(carta.sections) ? carta.sections : [];
  const pages = [];
  await coverPage(ctx, cfg, closing);
  pages.push(await jpeg(canvas));
  for (let i = 0; i < sections.length; i++) {
    await sectionPage(ctx, sections[i], i + 1, sections.length);
    pages.push(await jpeg(canvas));
  }
  await endPage(ctx, closing);
  pages.push(await jpeg(canvas));
  if (await backPage(ctx, closing)) pages.push(await jpeg(canvas));
  return makePdf(pages);
}

// ---------- botón ----------

export function buildKeepsake(carta) {
  const cfg = carta && carta.closing && carta.closing.keepsake;
  if (!cfg || typeof cfg !== 'object' || !cfg.button) return null;
  const box = document.createElement('div');
  box.className = 'keep';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'keep-btn';
  btn.textContent = cfg.button;
  const hint = document.createElement('span');
  hint.className = 'keep-hint';
  hint.textContent = cfg.hint || '';
  hint.setAttribute('role', 'status');
  hint.setAttribute('aria-live', 'polite');
  box.append(btn, hint);

  let busy = false;
  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    box.classList.add('is-busy');
    box.classList.remove('is-error');
    btn.textContent = cfg.busy || cfg.button;
    try {
      const pdf = await makeKeepsakePdf(carta, cfg);
      // Segundo toque sobre un enlace real: la descarga funciona igual en Safari, Firefox y Chrome.
      const a = document.createElement('a');
      a.className = 'keep-btn';
      a.href = URL.createObjectURL(pdf);
      a.download = (cfg.file || 'carta') + '.pdf';
      a.textContent = cfg.ready || cfg.button;
      btn.replaceWith(a);
      box.classList.remove('is-busy');
      box.classList.add('is-ready');
      hint.textContent = cfg.readyHint || '';
    } catch (err) {
      busy = false;
      btn.disabled = false;
      btn.textContent = cfg.button;
      box.classList.remove('is-busy');
      box.classList.add('is-error');
      hint.textContent = cfg.error || '';
    }
  });
  return box;
}
