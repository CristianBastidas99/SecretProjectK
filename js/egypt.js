// Transición a Egipto: fondo, metamorfosis de trazos y aviso de "listo" (una sola vez).
// Todo se calcula a partir del progreso de scroll del bloque .egypt-transition.

const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp01((p - a) / (b - a));

const STOPS = [
  [0, [250, 246, 238]],
  [0.22, [244, 239, 230]],
  [0.58, [232, 214, 183]],
  [1, [200, 166, 106]]
];

function colorAt(p) {
  for (let i = 1; i < STOPS.length; i++) {
    if (p <= STOPS[i][0]) {
      const [p0, c0] = STOPS[i - 1];
      const [p1, c1] = STOPS[i];
      const t = (p - p0) / (p1 - p0);
      return 'rgb(' + c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',') + ')';
    }
  }
  return 'rgb(' + STOPS[STOPS.length - 1][1].join(',') + ')';
}

let readyFired = false;
export function fireEgyptReady() {
  if (readyFired) return;
  readyFired = true;
  document.dispatchEvent(new CustomEvent('egypt:ready'));
}

// opts.getActive() -> índice de la sección activa (1..N)
export function initEgypt(root, opts) {
  const block = root.querySelector('.egypt-transition');
  if (!block) return;
  const sec10 = root.querySelector('#s10');
  const meta = document.querySelector('meta[name="theme-color"]');

  // draw: ventana de dibujado; out: ventana de desvanecido (solo opacidad, la pieza sale entera).
  // Las ventanas no se solapan: la pieza saliente llega a opacidad 0 antes de que la siguiente
  // empiece a dibujarse.
  const defs = [
    { sel: '.et-note', draw: [0.08, 0.3], out: [0.36, 0.46] },
    { sel: '.et-glyph', draw: [0.48, 0.6], out: [0.64, 0.72] },
    { sel: '.et-pyr', draw: [0.74, 0.9], out: null },
    { sel: '.et-sun', draw: [0.2, 0.44], out: null }
  ];
  const pieces = defs
    .map((d) => {
      const el = block.querySelector(d.sel);
      if (!el) return null;
      return Object.assign({ el, paths: Array.from(el.querySelectorAll('[pathLength]')), last: '' }, d);
    })
    .filter(Boolean);

  function applyPiece(pc, p) {
    const d = smooth(seg(p, pc.draw[0], pc.draw[1]));
    const o = pc.out ? smooth(seg(p, pc.out[0], pc.out[1])) : 0;
    const key = d.toFixed(3) + '|' + o.toFixed(3);
    if (key === pc.last) return;
    pc.last = key;
    pc.el.style.opacity = String(smooth(seg(d, 0.15, 0.6)) * (1 - o));
    const n = pc.paths.length;
    pc.paths.forEach((path, i) => {
      if (reduce) {
        path.style.strokeDashoffset = '0';
        return;
      }
      const lag = (i / n) * 0.5;
      path.style.strokeDashoffset = String(1 - clamp01((d - lag) / 0.5));
    });
  }

  let lastFade = null;
  let lastP = -2;
  let lastBand = -1;
  let scrubbing = false;
  let ticking = false;

  function frame() {
    ticking = false;
    const vh = window.innerHeight;
    const r = block.getBoundingClientRect();
    const p = clamp01((vh * 0.7 - r.top) / (vh * 1.4));
    if (p === lastP) return;
    lastP = p;

    pieces.forEach((pc) => applyPiece(pc, p));

    if (sec10) {
      const f = p > 0 ? (1 - smooth(Math.min(1, p / 0.35))).toFixed(3) : '';
      if (f !== lastFade) {
        lastFade = f;
        if (f === '') {
          delete sec10.dataset.fade;
          sec10.style.removeProperty('--et-fade');
        } else {
          sec10.dataset.fade = '1';
          sec10.style.setProperty('--et-fade', f);
        }
      }
    }

    const active = opts && opts.getActive ? opts.getActive() : 0;
    const body = document.body;
    body.classList.toggle('is-transit', p > 0 && (p < 1 || active < 11));
    if (p > 0 && p < 1) {
      const c = colorAt(p);
      body.classList.add('is-scrub');
      body.style.backgroundColor = c;
      scrubbing = true;
      const band = Math.round(p * 10);
      if (meta && band !== lastBand) {
        lastBand = band;
        meta.content = c;
      }
    } else {
      if (scrubbing) {
        scrubbing = false;
        body.style.backgroundColor = '';
        body.classList.remove('is-scrub');
      }
      if (p >= 1) {
        // El tono final lo toma el tema "sand" (mismo color): sin salto.
        if (active < 11 && body.dataset.theme !== 'dusk') body.dataset.theme = 'sand';
      } else if (body.dataset.theme === 'sand' && active < 11) {
        const t = opts && opts.getTheme ? opts.getTheme() : '';
        if (t) body.dataset.theme = t;
        else delete body.dataset.theme;
      }
    }

    if (p >= 0.93) fireEgyptReady();
  }

  function schedule() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('section:active', (e) => {
    if (e.detail && e.detail.index >= 11) fireEgyptReady();
    lastP = -2;
    schedule();
  });
  frame();
}
