// Saludo: «hello wrong» -> tachón a mano -> «right» escrito como tinta.
// Los textos vienen siempre del objeto `greeting` (nunca literales).

const SVG_NS = 'http://www.w3.org/2000/svg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Trazo irregular de izquierda a derecha, algo inclinado, con varios nodos ondulados.
function strikePath(w, h) {
  const pts = [
    [0.00, 0.72], [0.14, 0.64], [0.29, 0.58], [0.45, 0.50],
    [0.60, 0.43], [0.76, 0.37], [0.90, 0.31], [1.00, 0.26]
  ];
  const wob = [0, 0.025, -0.02, 0.025, -0.02, 0.02, -0.015, 0];
  const p = pts.map(([x, y], i) => [x * w, (y + wob[i]) * h]);
  let d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const cx = (x0 + x1) / 2;
    d += ' C' + cx.toFixed(1) + ' ' + y0.toFixed(1) + ' ' + cx.toFixed(1) + ' ' + y1.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
  }
  return d;
}

export async function playGreeting(greeting, el) {
  const reduced = reducedMotion();
  const g = greeting || {};

  const wrap = document.createElement('div');
  wrap.className = 'gr-wrap';
  const line = document.createElement('h1');
  line.className = 'gr-line';

  const hello = document.createElement('span');
  hello.className = 'gr-hello';
  hello.textContent = g.hello || '';

  const wrongWrap = document.createElement('span');
  wrongWrap.className = 'gr-wrongwrap';
  const wrong = document.createElement('span');
  wrong.className = 'gr-wrong';
  wrong.textContent = g.wrong || '';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'gr-strike');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('pathLength', '1');
  svg.appendChild(path);
  wrongWrap.append(wrong, svg);

  const right = document.createElement('span');
  right.className = 'gr-right';
  Array.from(g.right || '').forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'gr-ch';
    s.style.setProperty('--i', String(i));
    s.textContent = ch === ' ' ? ' ' : ch;
    right.appendChild(s);
  });

  line.append(hello, wrongWrap, right);

  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'gr-scroll';
  hint.setAttribute('aria-label', '↓');
  const arrow = document.createElementNS(SVG_NS, 'svg');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('focusable', 'false');
  arrow.setAttribute('aria-hidden', 'true');
  const ap = document.createElementNS(SVG_NS, 'path');
  ap.setAttribute('d', 'M12 4 C12.3 9 11.7 14 12 19 M6 13.5 C8.5 15.5 10.5 17.5 12 19.5 C13.5 17.5 15.5 15.5 18 13.5');
  arrow.appendChild(ap);
  hint.appendChild(arrow);
  hint.addEventListener('click', () => {
    const next = document.getElementById('letter');
    if (next) next.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  });

  wrap.append(line, hint);
  el.replaceChildren(wrap);
  el.classList.remove('is-done');

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (e) { /* seguir */ }
  }

  let struck = false;
  let shift = 0;

  function sizeStrike() {
    const r = wrong.getBoundingClientRect();
    if (!r.width) return;
    const w = r.width * 1.2;
    const h = Math.max(r.height * 0.55, 12);
    svg.style.width = w + 'px';
    svg.style.height = h + 'px';
    svg.style.left = (-(w - r.width) / 2) + 'px';
    svg.setAttribute('viewBox', '0 0 ' + w.toFixed(1) + ' ' + h.toFixed(1));
    svg.setAttribute('preserveAspectRatio', 'none');
    path.setAttribute('d', strikePath(w, h));
    svg.style.setProperty('--sw', Math.max(2.2, r.height * 0.032).toFixed(1) + 'px');
  }

  // Si «right» cabe en la misma línea, empezamos desplazados para que «hello wrong» quede centrado.
  function measureShift() {
    line.style.transition = 'none';
    line.style.transform = '';
    const a = wrongWrap.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const sameLine = Math.abs((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2) < a.height * 0.5;
    shift = sameLine ? (b.right - a.right) / 2 : 0;
  }

  sizeStrike();
  measureShift();
  const onResize = () => {
    sizeStrike();
    if (!struck) {
      measureShift();
      line.style.transform = shift ? 'translateX(' + shift.toFixed(1) + 'px)' : '';
    }
  };
  window.addEventListener('resize', onResize);

  // 1) «hello wrong» aparece y se sostiene
  line.style.transform = shift ? 'translateX(' + shift.toFixed(1) + 'px)' : '';
  void line.getBoundingClientRect();
  wrap.classList.add('is-shown');
  await sleep(reduced ? 1200 : 2300);

  // 2) tachón
  sizeStrike();
  struck = true;
  wrap.classList.add('is-struck');
  await sleep(reduced ? 500 : 800);

  // 3) «right» se escribe; la línea se recoloca
  line.style.transition = '';
  line.style.transform = '';
  wrap.classList.add('is-writing');
  const n = (g.right || '').length;
  await sleep((reduced ? 120 : 130) * n + (reduced ? 400 : 900));

  // 4) indicador de scroll
  wrap.classList.add('is-done');
  await sleep(reduced ? 200 : 800);
}
