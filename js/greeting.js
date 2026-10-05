// Saludo: «hello» fijo y, al lado, un rodillo que pasa por los apodos y se detiene en el último.
// Los textos vienen siempre del objeto `greeting` (nunca literales).

const SVG_NS = 'http://www.w3.org/2000/svg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Duración del giro y pausa de lectura de cada paso: el rodillo frena hacia el final.
const SPIN = [260, 290, 330, 380, 490];
const HOLD = [475, 500, 540, 600];
const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';
const EASE_LAST = 'cubic-bezier(0.3, 1.25, 0.55, 1)'; // leve rebote al llegar

export async function playGreeting(greeting, el) {
  const reduced = reducedMotion();
  const g = greeting || {};
  let names = Array.isArray(g.names) ? g.names.filter((s) => typeof s === 'string' && s.trim()) : [];
  if (!names.length) names = [g.wrong, g.right].filter(Boolean);
  const last = names.length - 1;

  const wrap = document.createElement('div');
  wrap.className = 'gr-wrap';
  const line = document.createElement('h1');
  line.className = 'gr-line';
  line.setAttribute('aria-label', ((g.hello || '') + ' ' + (names[last] || '')).trim());

  const hello = document.createElement('span');
  hello.className = 'gr-hello';
  hello.setAttribute('aria-hidden', 'true');
  hello.textContent = g.hello || '';

  const reel = document.createElement('span');
  reel.className = 'gr-reel';
  reel.setAttribute('aria-hidden', 'true');
  const track = document.createElement('span');
  track.className = 'gr-track';
  const words = names.map((name) => {
    const item = document.createElement('span');
    item.className = 'gr-name';
    const w = document.createElement('span');
    w.textContent = name;
    item.appendChild(w);
    track.appendChild(item);
    return w;
  });
  reel.appendChild(track);

  line.append(hello, reel);

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

  let idx = reduced ? last : 0;
  let widths = [];

  // Todo el saludo en una sola línea: si el apodo más largo no cabe, se reduce la letra.
  function fit() {
    line.style.fontSize = '';
    const avail = wrap.clientWidth * 0.94;
    widths = words.map((w) => w.getBoundingClientRect().width);
    const gap = parseFloat(getComputedStyle(line).columnGap) || 0;
    const need = hello.getBoundingClientRect().width + gap + Math.max(0, ...widths);
    if (need > avail && need > 0) {
      const k = avail / need;
      line.style.fontSize = (parseFloat(getComputedStyle(line).fontSize) * k).toFixed(1) + 'px';
      widths = widths.map((v) => v * k);
    }
  }

  function show(i, spin, ease) {
    track.style.transition = spin ? 'transform ' + spin + 'ms ' + ease : 'none';
    reel.style.transition = spin ? 'width ' + spin + 'ms ' + EASE : 'none';
    track.style.transform = 'translateY(' + ((-i * 100) / names.length).toFixed(4) + '%)';
    reel.style.width = (widths[i] || 0).toFixed(1) + 'px';
  }

  fit();
  show(idx, 0);
  const onResize = () => {
    fit();
    show(idx, 0);
  };
  window.addEventListener('resize', onResize);

  // 1) «hello» y el primer apodo aparecen y se sostienen
  void line.getBoundingClientRect();
  wrap.classList.add('is-shown');

  if (!reduced) {
    await sleep(950);
    // 2) el rodillo pasa por cada apodo y frena en el último
    for (let i = 1; i <= last; i++) {
      const spin = i === last ? SPIN[SPIN.length - 1] : SPIN[Math.min(i - 1, SPIN.length - 2)];
      idx = i;
      show(i, spin, i === last ? EASE_LAST : EASE);
      await sleep(spin);
      if (i < last) await sleep(HOLD[Math.min(i - 1, HOLD.length - 1)]);
    }
  } else {
    await sleep(1000);
  }

  // 3) llegada: énfasis breve en el nombre
  wrap.classList.add('is-landed');
  await sleep(reduced ? 300 : 1100);

  // 4) indicador de scroll
  wrap.classList.add('is-done');
  await sleep(reduced ? 200 : 800);
}
