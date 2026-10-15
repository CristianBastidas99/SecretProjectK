// Mano que enseña que los dibujos se pueden tocar. Estado solo en memoria.
const MAX_SHOWN = 3;
const NS = 'http://www.w3.org/2000/svg';

export function initTapHint(root) {
  if (!root || !window.IntersectionObserver) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let tapped = false;
  let shown = 0;
  let current = null; // { sec, el }

  const build = () => {
    const el = document.createElement('div');
    el.className = 'th-hint';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg class="th-rip" viewBox="-30 -30 60 60" xmlns="' + NS + '" fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle class="th-ring" r="22"/><circle class="th-ring th-ring2" r="22"/></svg>' +
      '<svg class="th-hand" viewBox="0 0 42 48" xmlns="' + NS + '" stroke-linejoin="round">' +
      '<path d="M10 8 A4 4 0 0 1 18 8 V19 Q18 16.5 21.5 16.5 Q25 16.5 25 19 Q25.5 17.5 28.5 17.5 Q32 17.5 32 21 Q32.5 20.5 34.5 21.5 Q37.5 23 37.5 26.5 V34 Q37.5 44.5 28 44.5 H19 Q11.5 44.5 8.5 38 L5 31.5 Q3.8 28.5 6.8 27.6 Q9.2 27.2 10 30 Z"/>' +
      '</svg>' +
      '<span class="th-label">toca</span>';
    return el;
  };

  const hide = (h) => {
    if (!h) return;
    h.el.classList.remove('is-on');
    setTimeout(() => h.el.remove(), 450);
  };

  const stop = () => {
    tapped = true;
    hide(current);
    current = null;
  };

  const show = (sec) => {
    if (tapped || shown >= MAX_SHOWN) return;
    const ill = sec.querySelector('.sec-ill');
    if (!ill) return;
    if (current && current.sec === sec) return;
    hide(current);
    const el = build();
    ill.appendChild(el);
    current = { sec, el };
    shown++;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
  };

  // Un toque en cualquier ilustración (o la aparición de .is-tap) apaga la pista para siempre.
  root.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.sec-ill')) stop(); }, true);

  const watch = (sec) => {
    const check = () => {
      if (sec.classList.contains('is-tap')) { stop(); return; }
      if (sec.classList.contains('is-alive') && sec.querySelector('.sec-ill')) show(sec);
    };
    new MutationObserver(check).observe(sec, { attributes: true, attributeFilter: ['class'] });
    check();
  };
  root.querySelectorAll('.sec').forEach(watch);
}
