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
      fetch(url, { cache: 'no-cache' }) // revalida: tras cambiar un SVG no se queda el viejo en caché
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

// Rosas que caen y se amontonan desde abajo: filas [fondo %, cuántas]; las de abajo caen primero.
const PILE_ROWS = [[1, 6], [8, 6], [15, 6], [22, 6], [29, 5], [36, 5], [43, 5], [50, 4], [57, 5], [64, 4], [71, 5], [78, 4], [85, 5], [92, 4], [99, 4]];
const PILE_KINDS = ['r01', 'r02', 'r11', 'r02', 'r01', 'r11', 'r03'];
// Arriba, rosas más livianas (menos trazos) para no cargar el celular.
const PILE_KINDS_UP = ['r02', 'r03', 'r02', 'r11'];

function rand(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPile(pile, map) {
  const r = rand(1710);
  const last = PILE_ROWS.length - 1;
  let k = 0;
  PILE_ROWS.forEach(([b, n], row) => {
    const up = row / last;
    for (let j = 0; j < n; j++) {
      const kinds = b > 55 ? PILE_KINDS_UP : PILE_KINDS;
      const kind = kinds[k % kinds.length];
      const src = map[kind];
      k += 1;
      if (!src) continue;
      const x = ((j + 0.5 + (r() - 0.5) * 0.7) / n) * 100;
      const mid = 1 - Math.min(1, Math.abs(x - 50) / 30);
      const d = el('span', 'rz-drop');
      d.style.left = x.toFixed(1) + '%';
      d.style.bottom = (b + (r() - 0.5) * 4).toFixed(1) + '%';
      d.style.setProperty('--w', ((0.27 - up * 0.1 + r() * 0.05) * (kind === 'r03' ? 0.7 : 1)).toFixed(3));
      d.style.setProperty('--up', (100 - b).toFixed(0));
      d.style.setProperty('--dd', (3.4 + r() * 1.4).toFixed(2) + 's');
      d.style.setProperty('--do', (1.2 + row * 1.5 + j * 0.35 + r() * 0.7).toFixed(2) + 's');
      d.style.setProperty('--dx', ((r() - 0.5) * 60).toFixed(0) + 'px');
      d.style.setProperty('--r0', ((r() - 0.5) * 160).toFixed(0) + 'deg');
      d.style.setProperty('--rot', ((r() - 0.5) * 50).toFixed(0) + 'deg');
      d.style.setProperty('--sd', (6 + r() * 4).toFixed(1) + 's');
      // Más tenues cuanto más arriba y más al centro, para no tapar el texto.
      d.style.setProperty('--o', (0.95 - up * (0.45 + mid * 0.3)).toFixed(2));
      const inner = el('span', 'rz-drop-in');
      inner.appendChild(baseSvg(src));
      d.appendChild(inner);
      pile.appendChild(d);
    }
  });
}

function buildRoses(night, jobs, gift) {
  const names = ['r08', 'r09', 'r10'].concat(ROSE_SLOTS);
  const art = el('div', 'rz');
  art.setAttribute('aria-hidden', 'true');
  const pile = el('div', 'rz-pile');
  const bed = el('div', 'rz-bed');
  const fall = el('div', 'rz-fall');
  art.append(pile, bed, fall);
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
      if (map.r08) bed.appendChild(rzSvg(map.r08, symbols));
      buildPile(pile, map);
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

function buildReply(n) {
  const box = el('div', 'gift-reply');
  const btn = el('button', 'gift-reply-btn', n.button || '');
  btn.type = 'button';
  const hint = n.hint ? el('span', 'gift-reply-hint', n.hint) : null;
  const status = el('span', 'gift-reply-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  box.append(btn);
  if (hint) box.append(hint);
  box.append(status);
  let busy = false;
  let sent = false;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (busy || sent) return;
    busy = true;
    btn.disabled = true;
    box.classList.add('is-sending');
    box.classList.remove('is-error');
    status.textContent = '';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    let ok = false;
    try {
      const when = new Date().toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const res = await fetch(n.url, {
        method: 'POST',
        signal: ctl.signal,
        body: JSON.stringify({ topic: n.topic, title: n.title, message: (n.message || '') + ' · ' + when, tags: ['gift'] })
      });
      ok = !!res.ok;
    } catch (err) {
      ok = false;
    }
    clearTimeout(timer);
    box.classList.remove('is-sending');
    busy = false;
    if (ok) {
      sent = true;
      box.classList.add('is-done');
      btn.hidden = true;
      if (hint) hint.hidden = true;
      status.textContent = n.done || '';
    } else {
      btn.disabled = false;
      box.classList.add('is-error');
      status.textContent = n.error || '';
    }
  });
  return box;
}

function buildGift(text, notify) {
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
  const card = el('div', 'gift-card');
  card.id = 'gift-card';
  card.appendChild(el('p', 'gift-text', text));
  const n = notify && typeof notify === 'object' ? notify : null;
  if (n && typeof n.url === 'string' && n.url && typeof n.topic === 'string' && n.topic) card.appendChild(buildReply(n));
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

// Disco solar alado con el retrato: el SVG viaja dentro de la carta cifrada.
function buildPortrait(src) {
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
  const box = el('div', 'end-portrait');
  box.setAttribute('aria-hidden', 'true');
  box.appendChild(document.importNode(svg, true));
  return box;
}

// Disco con dos caras (.face-a / .face-b): al tocarlo gira como una moneda. Devuelve el botón «toca para voltear».
function initFlip(box) {
  if (!box.querySelector('.face-b') || !box.querySelector('.coin')) return null;
  box.classList.add('can-flip');
  const hint = el('button', 'flip-hint');
  hint.type = 'button';
  hint.setAttribute('aria-label', 'Voltear el disco');
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.4');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  ['M6.2 9.4 A6.6 6.6 0 1 1 5.6 14.2', 'M5.4 5.4 L6.2 9.6 L10.4 8.8'].forEach((d) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    icon.appendChild(p);
  });
  hint.append(icon, document.createTextNode('toca para voltear'));
  let busy = false;
  let sparkT = 0;
  const flip = () => {
    if (busy) return;
    busy = true;
    // is-spark: chispas en cada giro (se quita y se vuelve a poner para reiniciarlas)
    box.classList.remove('is-spark');
    void box.getBoundingClientRect();
    box.classList.add('was-flipped', 'flip-out', 'is-spark');
    clearTimeout(sparkT);
    sparkT = setTimeout(() => box.classList.remove('is-spark'), 1800);
    hint.classList.add('is-done');
    setTimeout(() => {
      // was-back: el reverso ya se vio una vez (su entrada no se repite)
      if (box.classList.toggle('is-back')) box.classList.add('was-back');
      box.classList.remove('flip-out');
      box.classList.add('flip-in');
      setTimeout(() => {
        box.classList.remove('flip-in');
        busy = false;
      }, 520);
    }, 330);
  };
  box.addEventListener('click', flip);
  hint.addEventListener('click', flip);
  return hint;
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

  // Noche: rosas, texto y sobre.
  const night = el('div', 'end-night');
  const gift = typeof c.gift === 'string' && c.gift.trim() ? buildGift(c.gift.trim(), c.notify) : null;
  buildRoses(night, jobs, gift);
  const wrap = el('div', 'end-inner');
  const portrait = typeof c.portrait === 'string' ? buildPortrait(c.portrait) : null;
  if (portrait) {
    night.classList.add('has-portrait');
    wrap.appendChild(portrait);
    const hint = initFlip(portrait);
    if (hint) wrap.appendChild(hint);
  }
  if (c.end) wrap.appendChild(el('p', 'end-text', c.end));
  if (c.date) wrap.appendChild(el('p', 'end-date', c.date));
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

// Guardar el baile: botón bajo el bailarín que abre el GIF en grande (en iPhone se guarda en Fotos manteniéndolo
// presionado; en computador, con «Descargar»). El GIF solo se pide al abrir la ventana.
const DANCE_GIF = 'data/d1.gif?v=1';

function buildDanceSave(d) {
  const wrap = el('div', 'dzs');
  const btn = el('button', 'keep-btn dzs-btn', d.label);
  btn.type = 'button';
  wrap.appendChild(btn);
  let ov = null;
  const close = () => {
    if (!ov) return;
    ov.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    btn.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const open = () => {
    if (!ov) {
      ov = el('div', 'dzs-ov');
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', d.label);
      const card = el('div', 'dzs-card is-loading');
      const img = el('img', 'dzs-img');
      img.alt = d.label;
      img.decoding = 'async';
      img.addEventListener('load', () => card.classList.remove('is-loading'));
      img.src = DANCE_GIF;
      const acts = el('div', 'dzs-acts');
      if (d.download) {
        const dl = el('a', 'keep-btn dzs-dl', d.download);
        dl.href = DANCE_GIF;
        dl.setAttribute('download', d.file || 'baile.gif');
        acts.appendChild(dl);
      }
      const x = el('button', 'keep-btn dzs-x', d.close || '×');
      x.type = 'button';
      x.addEventListener('click', close);
      acts.appendChild(x);
      card.append(img, el('p', 'dzs-hint', d.hint || ''), acts);
      ov.appendChild(card);
      ov.addEventListener('click', (e) => {
        if (e.target === ov) close();
      });
      document.body.appendChild(ov);
      void ov.offsetWidth;
    }
    ov.classList.add('is-open');
    document.addEventListener('keydown', onKey);
    ov.querySelector('.dzs-x').focus({ preventScroll: true });
  };
  btn.addEventListener('click', open);
  return wrap;
}

export async function renderLetter(data, container) {
  const sections = Array.isArray(data && data.sections) ? data.sections : [];
  const total = sections.length;
  const dance = data && data.dance && typeof data.dance.label === 'string' && data.dance.label ? data.dance : null;
  const frag = document.createDocumentFragment();
  const jobs = [];

  sections.forEach((s, idx) => {
    const n = idx + 1;
    const sec = document.createElement('section');
    sec.className = 'sec';
    sec.id = 's' + pad2(n);
    sec.dataset.theme = s.theme || 'paper';
    sec.dataset.index = String(n); // 1..N
    if (n === total - 1) sec.classList.add('sec-song'); // penúltima: canción y baile

    const top = el('div', 'frame frame-top');
    const bottom = el('div', 'frame frame-bottom');
    top.setAttribute('aria-hidden', 'true');
    bottom.setAttribute('aria-hidden', 'true');

    const inner = el('div', 'sec-inner');
    inner.appendChild(el('p', 'sec-num rv', pad2(n) + ' / ' + pad2(total)));

    const ill = el('div', 'sec-ill rv');
    ill.setAttribute('aria-hidden', 'true');
    inner.appendChild(ill);
    if (n === total - 1 && dance) inner.appendChild(buildDanceSave(dance));

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
    if (n === total - 2 && total > 2) frag.appendChild(makeTransition(jobs));
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
