// Anillo que enseña que los dibujos se pueden tocar. Estado solo en memoria.
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
      '<svg viewBox="0 0 60 60" xmlns="' + NS + '" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle class="th-ring" cx="30" cy="30" r="18" stroke-width="1.2"/>' +
      '<circle class="th-ring th-ring2" cx="30" cy="30" r="18" stroke-width="1.2"/>' +
      '<g class="th-spark" stroke-width="1.1">' +
      '<path d="M30 21 C30.8 27 33 29.2 39 30 C33 30.8 30.8 33 30 39 C29.2 33 27 30.8 21 30 C27 29.2 29.2 27 30 21Z"/>' +
      '<path d="M41 19.5 C43.5 17 46 16.5 48 17" stroke-width=".9"/>' +
      '<path d="M44 24 C46.5 22.5 48.5 22.5 50.5 23.5" stroke-width=".9"/>' +
      '</g></svg>';
    return el;
  };

  const hide = (h) => {
    if (!h) return;
    h.el.classList.remove('is-on');
    setTimeout(() => h.el.remove(), 900);
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
