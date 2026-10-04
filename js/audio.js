// Audio: desbloqueo en gesto del usuario y reproducción del fragmento (stub inicial).

const SILENCE = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

function el() {
  return document.getElementById('song');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

let songUrl = null;       // objectURL de la canción real
let ready = false;        // la canción está cargada
let egyptFired = false;   // ya ocurrió egypt:ready
let autoDone = false;     // ya se intentó el arranque automático
let userPaused = false;   // el usuario pausó a mano
let ui = null;            // { toggle, fallback, iconPlay, iconPause }
let wired = false;

// Debe llamarse de forma síncrona dentro del gesto del usuario.
export function unlockAudio() {
  const a = el();
  if (!a) return;
  a.src = SILENCE;
  const p = a.play();
  // Pausar tras resolver: un pause() inmediato puede abortar el play() en iOS.
  if (p && typeof p.then === 'function') p.then(() => a.pause(), () => {});
  else a.pause();
}

export function isReady() {
  return ready;
}

export function loadSong(bytes) {
  const a = el();
  if (!a) return;
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  if (songUrl) URL.revokeObjectURL(songUrl);
  songUrl = URL.createObjectURL(blob);
  a.src = songUrl;
  a.load();
  ready = true;
  wire(a);
  tryAuto();
}

export function playSong() {
  const a = el();
  if (!a || !ready) return Promise.resolve(false);
  if (a.ended) a.currentTime = 0;
  const p = a.play();
  if (p && typeof p.then === 'function') return p.then(() => true, () => false);
  return Promise.resolve(true);
}

function isSong(a) {
  return ready && !!songUrl && a.src === songUrl;
}

function setToggle(playing) {
  if (!ui) return;
  ui.iconPause.style.display = playing ? '' : 'none';
  ui.iconPlay.style.display = playing ? 'none' : '';
  ui.toggle.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
}

function showToggle() {
  if (!ui) return;
  ui.toggle.classList.add('is-visible');
  ui.fallback.classList.remove('is-visible');
  ui.fallback.setAttribute('tabindex', '-1');
}

function showFallback() {
  if (!ui) return;
  ui.fallback.classList.add('is-visible');
  ui.fallback.setAttribute('tabindex', '0');
}

// Eventos del elemento: se enlazan una sola vez.
function wire(a) {
  if (wired) return;
  wired = true;
  a.addEventListener('playing', () => {
    if (!isSong(a)) return;
    setToggle(true);
    showToggle();
  });
  a.addEventListener('pause', () => {
    if (!isSong(a) || a.ended) return;
    setToggle(false);
  });
  a.addEventListener('ended', () => {
    if (!isSong(a)) return;
    setToggle(false);
  });
}

// Arranque automático: solo la primera vez, y solo con canción lista + Egipto.
function tryAuto() {
  if (autoDone || !ready || !egyptFired || userPaused) return;
  autoDone = true;
  const a = el();
  if (!a) return;
  const p = a.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {}, () => showFallback());
  }
}

// El evento puede llegar antes de initAudio o de loadSong: se registra siempre.
document.addEventListener('egypt:ready', () => {
  egyptFired = true;
  tryAuto();
});

function svgIcon(draw) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.25');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  draw.forEach((d) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  });
  return svg;
}

export function initAudio(closing) {
  if (ui) return;
  const a = el();
  if (!a) return;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'audio-toggle';
  toggle.setAttribute('aria-label', 'Reproducir');
  toggle.setAttribute('tabindex', '-1');
  const iconPause = svgIcon(['M9 6.4 L9.2 17.6', 'M15 6.3 L14.8 17.5']);
  const iconPlay = svgIcon(['M8.6 5.8 L17.8 12 L8.5 18.3 Z']);
  toggle.appendChild(iconPause);
  toggle.appendChild(iconPlay);

  const fallback = document.createElement('button');
  fallback.type = 'button';
  fallback.className = 'audio-fallback';
  fallback.setAttribute('tabindex', '-1');
  const title = closing && typeof closing.songTitle === 'string' ? closing.songTitle : '';
  fallback.textContent = '♪' + (title ? ' ' + title : '');

  document.body.appendChild(toggle);
  document.body.appendChild(fallback);
  ui = { toggle, fallback, iconPlay, iconPause };
  setToggle(false);
  wire(a);

  toggle.addEventListener('click', () => {
    if (!ready) return;
    if (a.paused || a.ended) {
      userPaused = false;
      playSong();
    } else {
      userPaused = true;
      a.pause();
    }
  });

  fallback.addEventListener('click', () => {
    userPaused = false;
    playSong().then((ok) => {
      if (ok) showToggle();
    });
  });

  // Si Egipto y la canción ya estaban listos antes de crear la UI.
  if (isSong(a) && !a.paused) {
    setToggle(true);
    showToggle();
  } else if (ready && autoDone && a.paused && !a.ended && !userPaused && isSong(a) && a.currentTime === 0) {
    showFallback();
  } else {
    tryAuto();
  }
}
