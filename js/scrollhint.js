// Flecha fija de «sigue bajando»: aparece con un fundido lento si la lectora se detiene ~4 s
// en una sección ya viva y aún queda carta por debajo. Se va al primer scroll/toque.
const SVG_NS = 'http://www.w3.org/2000/svg';
const IDLE_MS = 4000;

export function initScrollHint(root) {
  if (!root || document.querySelector('.sh-arrow')) return;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sh-arrow';
  btn.setAttribute('aria-label', 'Seguir');
  btn.tabIndex = -1;
  btn.hidden = true;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 4 C12.3 9 11.7 14 12 19 M6 13.5 C8.5 15.5 10.5 17.5 12 19.5 C13.5 17.5 15.5 15.5 18 13.5');
  svg.appendChild(path);
  btn.appendChild(svg);
  document.body.appendChild(btn);

  let timer = 0;
  let shown = false;
  let hideTimer = 0;

  const sections = () => Array.from(root.querySelectorAll('.sec'));

  // Sección actual (la última cuyo borde superior pasó la mitad) y destino del toque.
  function state() {
    const secs = sections();
    const vh = window.innerHeight;
    let idx = -1;
    for (let i = 0; i < secs.length; i++) {
      if (secs[i].getBoundingClientRect().top <= vh * 0.5) idx = i;
      else break;
    }
    if (idx < 0) return null;
    const cur = secs[idx];
    const ending = document.getElementById('ending');
    const endTop = ending && !ending.hidden ? ending.getBoundingClientRect().top : Infinity;
    if (endTop < vh * 0.9) return null; // ya se ve el final
    const el = document.scrollingElement || document.documentElement;
    if (el.scrollHeight - (window.scrollY + vh) < 48) return null; // nada que bajar
    const next = secs[idx + 1] || (ending && !ending.hidden ? ending : null);
    if (!next) return null;
    return { cur, next };
  }

  function canShow() {
    if (document.hidden) return false;
    const fb = document.querySelector('.audio-fallback.is-visible');
    if (fb) return false;
    const s = state();
    return !!(s && s.cur.classList.contains('is-alive'));
  }

  function show() {
    if (shown || !canShow()) { arm(); return; }
    clearTimeout(hideTimer);
    btn.hidden = false;
    void btn.offsetWidth;
    shown = true;
    btn.classList.add('is-on');
    btn.tabIndex = 0;
  }

  function hide() {
    if (!shown) return;
    shown = false;
    btn.classList.remove('is-on');
    btn.tabIndex = -1;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!shown) btn.hidden = true; }, 700);
  }

  function arm() {
    clearTimeout(timer);
    timer = setTimeout(show, IDLE_MS);
  }

  function activity() {
    hide();
    arm();
  }

  const opt = { passive: true };
  window.addEventListener('scroll', activity, opt);
  window.addEventListener('touchstart', activity, opt);
  window.addEventListener('wheel', activity, opt);
  window.addEventListener('keydown', activity, opt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else arm(); });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = state();
    hide();
    arm();
    if (!s) return;
    const vh = window.innerHeight;
    let top = s.next.getBoundingClientRect().top + window.scrollY;
    // sección más alta que la pantalla: bajar un trecho en vez de saltarse texto
    if (top - window.scrollY > vh * 1.2) top = window.scrollY + vh * 0.85;
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  });

  arm();
}
