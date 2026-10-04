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

// Vida continua: índices por tipo de animación (--k) para escalonar fases y duraciones sin repetir el patrón.
// Las clases lv-* las pone el propio SVG; el CSS (bloque vida) decide qué hacen y cuándo.
function prepareAlive(svg) {
  const count = {};
  svg.querySelectorAll('[class*="lv-"]').forEach((el) => {
    const key = Array.from(el.classList).find((c) => c.startsWith('lv-'));
    if (!key) return;
    const k = count[key] || 0;
    count[key] = k + 1;
    el.style.setProperty('--k', String(k));
    el.style.setProperty('--w', String(k % 6));
    el.style.setProperty('--v', String(k % 3));
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
  prepareAlive(svg);
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

// Rosas: los dibujos base (r01-r05, r11) se clonan en las ranuras [data-slot] de las enredaderas y el lecho.
const ROSE_SLOTS = ['r01', 'r02', 'r03', 'r04', 'r05', 'r11'];

function fillSlots(svg, symbols) {
  svg.querySelectorAll('[data-slot]').forEach((slot) => {
    const src = symbols[slot.getAttribute('data-slot')];
    slot.removeAttribute('data-slot');
    if (!src) {
      slot.remove();
      return;
    }
    const pop = document.createElementNS(SVG_NS, 'g');
    pop.setAttribute('class', 'rz-pop');
    Array.from(src.childNodes).forEach((n) => pop.appendChild(n.cloneNode(true)));
    slot.appendChild(pop);
  });
}

// Trazos que se dibujan: todo menos los pétalos (que se abren por capas).
function prepareRz(svg) {
  let i = 0;
  svg.querySelectorAll('[pathLength]').forEach((p) => {
    if (p.closest('.lay, .sep')) return;
    p.classList.add('draw');
    p.style.setProperty('--i', String(i % 10));
    i += 1;
  });
}

function rzSvg(src, symbols) {
  const svg = baseSvg(src);
  fillSlots(svg, symbols);
  prepareRz(svg);
  return svg;
}

function buildRoses(night, jobs, gift) {
  const names = ['r06', 'r07', 'r08', 'r09', 'r10'].concat(ROSE_SLOTS);
  const art = el('div', 'rz');
  art.setAttribute('aria-hidden', 'true');
  const vl = el('div', 'rz-vine rz-vine-l');
  const vr = el('div', 'rz-vine rz-vine-r');
  const bed = el('div', 'rz-bed');
  const fall = el('div', 'rz-fall');
  art.append(vl, vr, bed, fall);
  night.appendChild(art);

  jobs.push(
    Promise.all(names.map((n) => loadSvg('svg/illustrations/' + n + '.svg'))).then((list) => {
      const map = {};
      names.forEach((n, i) => {
        map[n] = list[i];
      });
      const symbols = {};
      ROSE_SLOTS.forEach((n) => {
        symbols[n] = map[n];
      });
      if (map.r06) vl.appendChild(rzSvg(map.r06, symbols));
      if (map.r07) vr.appendChild(rzSvg(map.r07, symbols));
      if (map.r08) bed.appendChild(rzSvg(map.r08, symbols));
      // Pétalos que caen muy despacio.
      if (map.r09) {
        const spec = [
          [12, 17, 0, 0.9], [27, 23, 6, 0.7], [41, 19, 12, 1], [58, 26, 3, 0.75], [73, 21, 15, 0.85], [88, 24, 9, 0.7]
        ];
        spec.forEach(([x, dur, delay, sc], i) => {
          const p = el('span', 'rz-petal');
          p.style.setProperty('--x', x + '%');
          p.style.setProperty('--fd', dur + 's');
          p.style.setProperty('--fo', delay + 's');
          p.style.setProperty('--fs', String(sc));
          p.style.setProperty('--dx', (i % 2 ? -1 : 1) * (26 + i * 5) + 'px');
          const s = baseSvg(map.r09);
          s.classList.add('rz-petal-svg');
          p.appendChild(s);
          fall.appendChild(p);
        });
      }
      if (gift && map.r10) {
        const holder = gift.querySelector('.gift-env');
        if (holder) holder.appendChild(baseSvg(map.r10));
      }
    })
  );
}

// Luciérnagas: puntos de luz cálida; [x%, y%, deriva px, duración deriva s, duración parpadeo s, desfase s, tamaño px]
const FIREFLIES = [
  [22, 20, 26, 17, 5.2, 0, 5], [33, 56, 22, 21, 6.4, 3.5, 4.5], [43, 38, 20, 13, 4.6, 7, 4],
  [60, 44, 20, 15, 5.8, 1.5, 5], [70, 62, 24, 19, 7, 9, 4.5], [80, 24, 28, 23, 5.4, 5, 5], [52, 66, 20, 16, 6.2, 11, 4.5]
];

function buildFireflies() {
  const box = el('div', 'ff-wrap');
  box.setAttribute('aria-hidden', 'true');
  FIREFLIES.forEach(([x, y, d, dur, bl, off, sz], i) => {
    const f = el('span', 'ff');
    f.style.left = x + '%';
    f.style.top = y + '%';
    f.style.setProperty('--fx', (i % 2 ? -d : d) + 'px');
    f.style.setProperty('--fy', (i % 3 === 0 ? d : -d * 0.8) + 'px');
    f.style.setProperty('--fd', dur + 's');
    f.style.setProperty('--fb', bl + 's');
    f.style.setProperty('--fo', '-' + off + 's');
    f.style.setProperty('--fz', sz + 'px');
    f.appendChild(el('span', 'ff-glow'));
    box.appendChild(f);
  });
  return box;
}

function buildGift(text) {
  const wrap = el('div', 'gift');
  const btn = el('button', 'gift-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Abrir');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'gift-card');
  const bob = el('span', 'gift-bob');
  const env = el('span', 'gift-env');
  bob.appendChild(env);
  btn.appendChild(bob);
  const card = el('p', 'gift-card', text);
  card.id = 'gift-card';
  card.setAttribute('aria-live', 'polite');
  wrap.append(btn, card);

  const setOpen = (on) => {
    if (on) wrap.classList.add('was-opened');
    wrap.classList.toggle('is-open', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Cerrar' : 'Abrir');
  };
  btn.addEventListener('click', () => setOpen(!wrap.classList.contains('is-open')));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrap.classList.contains('is-open')) setOpen(false);
  });
  return wrap;
}

export async function renderEnding(closing, footer) {
  const c = closing || {};
  const jobs = [];

  // Atardecer: el sol se oculta tras las pirámides.
  const dusk = el('div', 'end-dusk');
  const scene = el('div', 'end-scene');
  scene.setAttribute('aria-hidden', 'true');
  jobs.push(
    loadSvg('svg/illustrations/e09.svg').then((src) => {
      if (!src) return;
      const svg = baseSvg(src);
      prepareDraw(svg);
      scene.appendChild(svg);
    })
  );
  dusk.appendChild(scene);

  // Noche: rosas, enredaderas, texto y sobre.
  const night = el('div', 'end-night');
  const gift = typeof c.gift === 'string' && c.gift.trim() ? buildGift(c.gift.trim()) : null;
  buildRoses(night, jobs, gift);
  const wrap = el('div', 'end-inner');
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
  night.appendChild(wrap);
  if (gift) {
    const ff = buildFireflies();
    night.append(ff, gift);
    gift.addEventListener('click', () => {
      if (gift.classList.contains('was-opened')) ff.classList.add('is-calm');
    });
    ff.addEventListener('transitionend', () => {
      if (ff.classList.contains('is-calm')) ff.classList.add('is-done');
    });
    // Las animaciones de llamada solo corren con el final a la vista.
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((es) => {
        es.forEach((e) => night.classList.toggle('is-away', !e.isIntersecting));
      }).observe(night);
    }
  }

  footer.replaceChildren(dusk, night);
  await Promise.all(jobs);
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
          prepareAlive(svg);
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
