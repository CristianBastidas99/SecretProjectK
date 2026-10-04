// Revelado por sección, tema activo e indicador de progreso.
// Hook para fases posteriores: registrar callbacks con `hooks.onActive.push(fn)`;
// se llaman con (sectionElement) al cambiar la sección activa, y se emite
// el evento 'section:active' en document. La transición a Egipto (entre 10 y 11)
// se engancha aquí.

import { initEgypt, fireEgyptReady } from './egypt.js';

export const hooks = { onActive: [] };

const THEME_COLORS = {
  paper: '#F4EFE6',
  'paper-cool': '#E9EBE6',
  dim: '#A7A49C',
  night: '#252C35',
  'paper-warm': '#F1E7D6',
  'paper-light': '#FAF6EE',
  sand: '#E8D6B7',
  gold: '#D2AE72',
  dusk: '#C99A5B'
};

function setThemeColor(theme) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme] || THEME_COLORS.paper;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Grosor visual constante (px en pantalla): el trazo en unidades de viewBox se ajusta al tamaño de render.
const STROKE_PX = 1.35;
function fitStrokes(roots) {
  const svgs = [];
  roots.forEach((r) => {
    if (r) r.querySelectorAll('.frame svg, .sec-ill svg, .et-piece svg, .end-scene svg').forEach((n) => svgs.push(n));
  });
  const widths = svgs.map((n) => n.getBoundingClientRect().width); // todas las lecturas primero
  svgs.forEach((n, i) => {
    const vb = n.viewBox && n.viewBox.baseVal;
    if (!widths[i] || !vb || !vb.width) return;
    const v = Math.min(3, Math.max(0.5, (STROKE_PX * vb.width) / widths[i]));
    n.style.setProperty('--lw', v.toFixed(3));
  });
}

export function initAnimations(root, ending) {
  const sections = Array.from(root.querySelectorAll('.sec'));
  const total = sections.length;
  if (!total) return;

  // Indicador fijo NN / 12
  let progress = document.getElementById('progress');
  if (!progress) {
    progress = document.createElement('div');
    progress.id = 'progress';
    progress.className = 'progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);
  }

  if (!('IntersectionObserver' in window)) {
    sections.forEach((s) => s.classList.add('is-in', 'is-gp'));
    if (ending) ending.classList.add('is-in');
    fireEgyptReady();
    return;
  }

  // Entrada: revelado de cada sección (una sola vez).
  const revealIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          revealIO.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );

  // Sección activa: la última cuyo borde superior ya pasó la mitad de la pantalla.
  // Se recalcula con posiciones reales cuando un observador avisa (o al terminar el scroll),
  // así un salto brusco nunca deja un valor obsoleto.
  let active = null;
  let activeIdx = 0;
  let numVisible = true;
  let endingVisible = false;
  const syncProgress = () => {
    progress.classList.toggle('is-on', Boolean(active) && !numVisible && !endingVisible);
  };
  const activate = (sec) => {
    active = sec;
    const theme = sec.dataset.theme || 'paper';
    document.body.dataset.theme = theme;
    setThemeColor(theme);
    progress.textContent = pad2(sec.dataset.index) + ' / ' + pad2(total);
    activeIdx = Number(sec.dataset.index);
    hooks.onActive.forEach((fn) => {
      try { fn(sec); } catch (err) { /* un hook no debe romper el scroll */ }
    });
    document.dispatchEvent(new CustomEvent('section:active', { detail: { section: sec, index: activeIdx } }));
  };
  const deactivate = () => {
    active = null;
    delete document.body.dataset.theme;
    setThemeColor('paper');
    activeIdx = 0;
  };
  const update = () => {
    const mid = window.innerHeight * 0.5;
    let found = null;
    for (let i = 0; i < total; i++) {
      if (sections[i].getBoundingClientRect().top <= mid) found = sections[i];
      else break;
    }
    if (found !== active) {
      if (found) activate(found);
      else deactivate();
    }
    if (found) {
      const nm = found.querySelector('.sec-num');
      numVisible = nm ? nm.getBoundingClientRect().bottom > 0 : true;
    }
    syncProgress();
  };

  const activeIO = new IntersectionObserver(update, { threshold: [0, 1], rootMargin: '-48% 0px -48% 0px' });
  const numIO = new IntersectionObserver(update, { threshold: 0 });

  // Seguimiento en el scroll: una sola pasada por frame con 2-3 lecturas (siguiente sección,
  // actual y su número), todas antes de cualquier escritura de estilo; solo si algo cambia se
  // recalcula. El temporizador final cubre saltos largos sin cruces de observador.
  let ticking = false;
  const check = () => {
    ticking = false;
    const mid = window.innerHeight * 0.5;
    const next = sections[activeIdx];
    const nextIn = next ? next.getBoundingClientRect().top <= mid : false;
    const curOut = active ? active.getBoundingClientRect().top > mid : false;
    const nm = active ? active.querySelector('.sec-num') : null;
    const nv = nm ? nm.getBoundingClientRect().bottom > 0 : true;
    if (nextIn || curOut || (active && nv !== numVisible)) update();
  };
  let idle = 0;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(check);
    }
    clearTimeout(idle);
    idle = setTimeout(update, 150);
  }, { passive: true });

  // Marcador de la frase destacada: se pinta cuando la frase entra en pantalla.
  const hlIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-marked');
        hlIO.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -20% 0px' }
  );

  sections.forEach((s) => {
    const nm = s.querySelector('.sec-num');
    if (nm) numIO.observe(nm);
    const hl = s.querySelector('.hl');
    if (hl) hlIO.observe(hl);
    revealIO.observe(s);
    activeIO.observe(s);
  });

  fitStrokes([root, ending]);
  let fitT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(fitT);
    fitT = setTimeout(() => fitStrokes([root, ending]), 150);
  });

  initEgypt(root, { getActive: () => activeIdx, getTheme: () => (active && active.dataset.theme) || '' });
  initGlyphPath(sections[11]);
  if (ending) initEnding(ending);

  // Final: atardecer; el indicador se retira.
  function initEnding(foot) {
    const endIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          endingVisible = e.isIntersecting;
          syncProgress();
          if (e.isIntersecting) {
            foot.classList.add('is-in');
            document.body.dataset.theme = 'dusk';
            setThemeColor('dusk');
          } else if (e.boundingClientRect.top > 0 && active) {
            document.body.dataset.theme = active.dataset.theme || 'paper';
            setThemeColor(active.dataset.theme);
          }
          update();
        });
      },
      { threshold: 0.3 }
    );
    endIO.observe(foot);
    document.addEventListener('section:active', (e) => {
      if (endingVisible) {
        document.body.dataset.theme = 'dusk';
        setThemeColor('dusk');
      }
    });
  }
}

// Sección 12: glifos que se dibujan y camino que sale del marco, con la cita ya en pantalla.
function initGlyphPath(sec) {
  if (!sec) return;
  const frame = sec.querySelector('.frame-bottom');
  const quote = sec.querySelector('.hl');
  if (!frame || !('IntersectionObserver' in window)) {
    if (sec) sec.classList.add('is-gp');
    return;
  }
  let seenFrame = false;
  let seenQuote = !quote;
  const go = () => {
    if (seenFrame && seenQuote) sec.classList.add('is-gp');
  };
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        if (e.target === frame) seenFrame = true;
        else seenQuote = true;
        io.unobserve(e.target);
        go();
      });
    },
    { threshold: 0.5 }
  );
  io.observe(frame);
  if (quote) io.observe(quote);
}
