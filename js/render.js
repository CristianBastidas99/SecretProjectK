// Construye las secciones de la carta a partir de los datos descifrados.
// Todo texto se inserta con textContent; los SVG se sanean antes de insertarse inline.

const SVG_NS = 'http://www.w3.org/2000/svg';
const cache = new Map();

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Parsea y sanea un SVG de texto. Devuelve un nodo <svg> o null.
function parseSvg(text) {
  let xml;
  try {
    xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  } catch (e) {
    return null;
  }
  const root = xml.documentElement;
  if (!root || xml.querySelector('parsererror')) return null;
  if (root.localName !== 'svg') return null;

  xml.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove());
  xml.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'xlink:href') && !val.startsWith('#')) el.removeAttribute(attr.name);
    }
  });
  return document.importNode(root, true);
}

// Carga un SVG (con caché); si falla, resuelve null.
function loadSvg(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.text() : null))
        .then((t) => (t ? parseSvg(t) : null))
        .catch(() => null)
    );
  }
  return cache.get(url);
}

// Marca los elementos dibujables y les asigna un índice para el escalonado.
function prepareDraw(svg) {
  let i = 0;
  svg.querySelectorAll('*').forEach((el) => {
    if (el.hasAttribute('pathLength')) {
      el.classList.add('draw');
      el.style.setProperty('--i', String(Math.min(i, 16)));
      i += 1;
    }
  });
}

function baseSvg(src) {
  const svg = src.cloneNode(true);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

// El grupo de camino (glifos + senda) se anima aparte: sus trazos no usan .draw.
function prepareGlyphPath(svg) {
  const gp = svg.querySelector('[data-role="glyph-path"]');
  if (!gp) return;
  let g = 0;
  let r = 0;
  gp.querySelectorAll('[pathLength]').forEach((el) => {
    el.classList.remove('draw');
    el.style.removeProperty('--i');
    const inGlyph = el.parentNode !== gp;
    el.classList.add(inGlyph ? 'gp-glyph' : 'gp-road');
    el.style.setProperty('--j', String(inGlyph ? g++ : r++));
  });
  gp.style.setProperty('--gcount', String(g));
}

function frameClone(src, part) {
  const svg = baseSvg(src);
  const drop = part === 'top' ? 'bottom' : 'top';
  svg.querySelectorAll('[data-part="' + drop + '"]').forEach((n) => n.remove());
  if (part === 'top') {
    svg.setAttribute('viewBox', '0 0 400 400');
    svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
  } else {
    svg.setAttribute('viewBox', '0 400 400 400');
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  }
  prepareDraw(svg);
  prepareGlyphPath(svg);
  return svg;
}

function makeTransition(jobs) {
  const wrap = el('div', 'egypt-transition');
  wrap.setAttribute('aria-hidden', 'true');
  const stage = el('div', 'et-stage');
  const box = el('div', 'et-box');
  [['et-sun', 'e04'], ['et-note', 'e01'], ['et-glyph', 'e02'], ['et-pyr', 'e03']].forEach(([cls, name]) => {
    const holder = el('div', 'et-piece ' + cls);
    box.appendChild(holder);
    jobs.push(
      loadSvg('svg/illustrations/' + name + '.svg').then((src) => {
        if (src) holder.appendChild(baseSvg(src));
        else holder.remove();
      })
    );
  });
  stage.appendChild(box);
  wrap.appendChild(stage);
  return wrap;
}

export async function renderEnding(closing, footer) {
  const c = closing || {};
  const scene = el('div', 'end-scene');
  scene.setAttribute('aria-hidden', 'true');
  const job = loadSvg('svg/illustrations/e09.svg').then((src) => {
    if (!src) return;
    const svg = baseSvg(src);
    prepareDraw(svg);
    scene.appendChild(svg);
  });
  const wrap = el('div', 'end-inner');
  wrap.appendChild(scene);
  if (c.end) wrap.appendChild(el('p', 'end-text', c.end));
  if (c.credit) {
    const p = el('p', 'end-credit');
    const a = el('a', null, '♪ ' + c.credit);
    if (c.link && /^https:\/\//i.test(c.link)) {
      a.href = c.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    p.appendChild(a);
    wrap.appendChild(p);
  }
  footer.replaceChildren(wrap);
  await job;
}

function makeDivider() {
  const div = document.createElement('div');
  div.className = 'sec-sep';
  div.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 2 C12.6 8 16 11.4 22 12 C16 12.6 12.6 16 12 22 C11.4 16 8 12.6 2 12 C8 11.4 11.4 8 12 2 Z');
  svg.appendChild(path);
  div.appendChild(svg);
  return div;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export async function renderLetter(data, container) {
  const sections = Array.isArray(data && data.sections) ? data.sections : [];
  const total = sections.length;
  const frag = document.createDocumentFragment();
  const jobs = [];

  sections.forEach((s, idx) => {
    const n = idx + 1;
    const sec = document.createElement('section');
    sec.className = 'sec';
    sec.id = 's' + pad2(n);
    sec.dataset.theme = s.theme || 'paper';
    sec.dataset.index = String(n); // 1..N

    const top = el('div', 'frame frame-top');
    const bottom = el('div', 'frame frame-bottom');
    top.setAttribute('aria-hidden', 'true');
    bottom.setAttribute('aria-hidden', 'true');

    const inner = el('div', 'sec-inner');
    inner.appendChild(el('p', 'sec-num rv', pad2(n) + ' / ' + pad2(total)));

    const ill = el('div', 'sec-ill rv');
    ill.setAttribute('aria-hidden', 'true');
    inner.appendChild(ill);

    inner.appendChild(el('h2', 'sec-title rv', s.title || ''));

    const text = el('div', 'sec-text rv');
    const quote = typeof s.quote === 'string' ? s.quote.trim() : '';
    let marked = false;
    String(s.text || '')
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .forEach((raw) => {
        const p = el('p');
        const t = raw.trim();
        const at = quote && !marked ? t.indexOf(quote) : -1;
        if (at >= 0) {
          marked = true;
          if (at > 0) p.appendChild(document.createTextNode(t.slice(0, at)));
          p.appendChild(el('strong', 'hl', quote));
          if (at + quote.length < t.length) p.appendChild(document.createTextNode(t.slice(at + quote.length)));
        } else {
          p.textContent = t;
        }
        text.appendChild(p);
      });
    inner.appendChild(text);

    sec.append(top, inner, bottom);
    frag.appendChild(sec);
    if (n === 10 && total > 10) frag.appendChild(makeTransition(jobs));
    else if (n < total) frag.appendChild(makeDivider());

    if (s.frame) {
      jobs.push(
        loadSvg('svg/frames/' + encodeURIComponent(s.frame) + '.svg').then((src) => {
          if (!src) {
            top.remove();
            bottom.remove();
            return;
          }
          top.appendChild(frameClone(src, 'top'));
          bottom.appendChild(frameClone(src, 'bottom'));
        })
      );
    } else {
      top.remove();
      bottom.remove();
    }

    if (s.illustration) {
      jobs.push(
        loadSvg('svg/illustrations/' + encodeURIComponent(s.illustration) + '.svg').then((src) => {
          if (!src) {
            ill.remove();
            return;
          }
          const svg = baseSvg(src);
          prepareDraw(svg);
          ill.appendChild(svg);
        })
      );
    } else {
      ill.remove();
    }
  });

  container.replaceChildren(frag);
  await Promise.all(jobs);
}
