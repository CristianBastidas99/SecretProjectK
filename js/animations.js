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
  dusk: '#C99A5B',
  'rose-night': '#232A35'
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
    if (r) r.querySelectorAll('.frame svg, .sec-ill svg, .et-piece svg, .end-scene svg, .rz > .rz-vine > svg, .rz > .rz-bed > svg').forEach((n) => svgs.push(n));
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
    if (ending) {
      ending.classList.add('is-in');
      const nt = ending.querySelector('.end-night');
      if (nt) nt.classList.add('is-bloom');
    }
    fireEgyptReady();
    return;
  }

  // Vida continua: cuando el dibujado de entrada ya terminó (~3 s tras is-in) la sección recibe
  // is-alive; mientras no esté en pantalla (is-vis) el CSS pausa sus animaciones.
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goAlive = (sec) => {
    sec.querySelectorAll('.lv-run').forEach((p) => {
      try {
        p.style.setProperty('--len', Math.max(8, Math.round(p.getTotalLength())) + 'px');
      } catch (err) { /* sin longitud: se usa el valor por defecto */ }
    });
    sec.classList.add('is-alive');
  };
  const visIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-vis', e.isIntersecting));
    },
    { rootMargin: '10% 0px' }
  );

  // Entrada: revelado de cada sección (una sola vez).
  const revealIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          revealIO.unobserve(e.target);
          if (!calm) setTimeout(() => goAlive(e.target), 3300);
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
    visIO.observe(s);
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

  // Final: del atardecer a la noche. El fondo se interpola con el scroll (solo variables del body);
  // las rosas se abren una vez al llegar la noche.
  function initEnding(foot) {
    const dusk = foot.querySelector('.end-dusk');
    const night = foot.querySelector('.end-night');
    const scene = foot.querySelector('.end-scene');
    if (!dusk || !night) return;
    const D = { bg: [201, 154, 91], fg: [36, 34, 31], soft: [51, 41, 31], accent: [79, 47, 24] };
    const N = { bg: [35, 42, 53], fg: [230, 221, 203], soft: [181, 174, 160], accent: [205, 170, 112] };
    // El cielo pasa por un malva apagado (no por un gris) camino de la noche.
    const SKY = [[0, [201, 154, 91]], [0.4, [140, 101, 86]], [0.72, [78, 68, 84]], [1, [35, 42, 53]]];
    const sky = (t) => {
      for (let i = 1; i < SKY.length; i++) {
        if (t <= SKY[i][0]) {
          const [p0, c0] = SKY[i - 1];
          const [p1, c1] = SKY[i];
          return mix(c0, c1, (t - p0) / (p1 - p0));
        }
      }
      return mix(N.bg, N.bg, 0);
    };
    const mix = (a, b, t) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
    const ease = (t) => t * t * (3 - 2 * t);
    const body = document.body;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let footVisible = false;
    let duskSeen = false;
    let curP = 0;
    let bloomed = false;
    let ticking = false;
    let lastBand = -1;
    let lastKey = '';

    const clearScrub = () => {
      if (!body.classList.contains('is-scrub-end')) return;
      body.classList.remove('is-scrub-end');
      body.classList.remove('is-scrub');
      ['--bg', '--fg', '--fg-soft', '--accent'].forEach((k) => body.style.removeProperty(k));
    };

    const sync = () => {
      if (!footVisible) return;
      if (curP >= 1) {
        clearScrub();
        if (body.dataset.theme !== 'rose-night') {
          body.dataset.theme = 'rose-night';
          setThemeColor('rose-night');
        }
      } else if (curP > 0) {
        const t = ease(Math.max(0, (curP - 0.45) / 0.55));
        body.classList.add('is-scrub', 'is-scrub-end');
        body.style.setProperty('--bg', sky(curP));
        body.style.setProperty('--fg', mix(D.fg, N.fg, t));
        body.style.setProperty('--fg-soft', mix(D.soft, N.soft, t));
        body.style.setProperty('--accent', mix(D.accent, N.accent, t));
        if (body.dataset.theme !== 'dusk') body.dataset.theme = 'dusk';
        const band = Math.round(curP * 10);
        if (band !== lastBand) {
          lastBand = band;
          setThemeColor(curP > 0.5 ? 'rose-night' : 'dusk');
        }
      } else if (duskSeen) {
        clearScrub();
        if (body.dataset.theme !== 'dusk') {
          body.dataset.theme = 'dusk';
          setThemeColor('dusk');
        }
      }
    };

    const frame = () => {
      ticking = false;
      const vh = window.innerHeight;
      const top = night.getBoundingClientRect().top;
      curP = Math.min(1, Math.max(0, (vh * 0.85 - top) / (vh * 0.55)));
      if (!bloomed && top < vh * 0.6) {
        bloomed = true;
        night.classList.add('is-bloom');
      }
      const key = curP.toFixed(3) + '|' + footVisible + '|' + duskSeen;
      if (key !== lastKey) {
        lastKey = key;
        if (scene) {
          const o = curP > 0.08 ? 1 - ease(Math.min(1, (curP - 0.08) / 0.5)) : 1;
          scene.style.opacity = o < 1 ? o.toFixed(3) : '';
        }
        sync();
      }
    };
    const schedule = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(frame);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    // El atardecer (el sol baja) empieza cuando la escena entra a la vista.
    const duskIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            foot.classList.add('is-in');
            duskSeen = true;
            schedule();
          }
        });
      },
      { threshold: 0.3 }
    );
    duskIO.observe(dusk);

    const footIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        footVisible = e.isIntersecting;
        endingVisible = e.isIntersecting;
        syncProgress();
        if (!e.isIntersecting && e.boundingClientRect.top > 0) {
          // Se vuelve a subir: el final queda por debajo y se restaura el tema de la sección.
          duskSeen = false;
          clearScrub();
          if (active) {
            document.body.dataset.theme = active.dataset.theme || 'paper';
            setThemeColor(active.dataset.theme);
          }
        }
        update();
        schedule();
      });
    });
    footIO.observe(foot);

    document.addEventListener('section:active', () => {
      if (footVisible) {
        lastKey = '';
        schedule();
      }
    });
    if (reduceMotion) night.classList.add('is-reduce');
    schedule();
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
