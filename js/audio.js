// Audio: desbloqueo en gesto del usuario y reproducción del fragmento (stub inicial).

const SILENCE = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

function el() {
  return document.getElementById('song');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Pista de ambiente (data/a1.mp3, generada por tools/ambient.py): cuerpo en bucle de 0 a LOOP_END
// y, desde LOOP_END, una salida de 6 s que se desvanece a silencio. Duración total: TOTAL.
const AMBIENT = 'data/a1.mp3';
const LOOP_END = 96;
const LOOP_LEN = 96;
const TOTAL = 102;

let songUrl = null;       // objectURL de la canción real
let ready = false;        // la canción está cargada
let egyptFired = false;   // ya ocurrió egypt:ready
let autoDone = false;     // ya se intentó el arranque automático de la canción
let userPaused = false;   // el usuario pausó a mano
let phase = 'none';       // none | ambient | outro | song
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

// Música de ambiente: mismo elemento <audio>, ya desbloqueado en el gesto. Si falla, no hay ambiente.
export function startAmbient(version) {
  const a = el();
  if (!a || phase !== 'none') return;
  wire(a);
  phase = 'ambient';
  try { a.volume = 1; } catch (e) { /* iOS: solo lectura */ }
  a.src = AMBIENT + '?v=' + version;
  const p = a.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {}, () => { if (phase === 'ambient') phase = 'none'; });
  }
}

export function loadSong(bytes) {
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  if (songUrl) URL.revokeObjectURL(songUrl);
  songUrl = URL.createObjectURL(blob);
  ready = true;
  tryAuto();
}

export function playSong() {
  const a = el();
  if (!a || !ready || phase !== 'song') return Promise.resolve(false);
  if (a.ended) a.currentTime = 0;
  const p = a.play();
  if (p && typeof p.then === 'function') return p.then(() => true, () => false);
  return Promise.resolve(true);
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
    if (phase === 'none') return;
    setToggle(true);
    showToggle();
  });
  a.addEventListener('pause', () => {
    if (phase === 'none' || a.ended) return;
    setToggle(false);
  });
  a.addEventListener('ended', () => {
    if (phase === 'none') return;
    setToggle(false);
  });
  a.addEventListener('timeupdate', () => {
    if (phase === 'ambient') {
      // Bucle manual: el final enlaza con el inicio sin costura.
      if (a.currentTime >= LOOP_END - 0.15) a.currentTime -= LOOP_LEN;
    } else if (phase === 'outro') {
      if (a.currentTime >= TOTAL - 0.1 && !a.paused) a.pause();
    }
  });
}

// Egipto empieza: el ambiente salta a su salida y se desvanece solo.
document.addEventListener('egypt:start', () => {
  const a = el();
  if (!a || phase !== 'ambient') return;
  phase = 'outro';
  if (a.paused) return;
  // Bajada breve de volumen (sin efecto en iOS) para que el salto no suene.
  try { a.volume = 0; } catch (e) { /* ignorar */ }
  setTimeout(() => {
    if (phase !== 'outro') return;
    a.currentTime = LOOP_END;
    const back = () => {
      if (phase === 'outro') {
        try { a.volume = 1; } catch (e) { /* ignorar */ }
      }
    };
    a.addEventListener('seeked', back, { once: true });
    setTimeout(back, 500);
  }, 90);
});

// Cambia el elemento a la canción real (una sola vez).
function startSong() {
  const a = el();
  if (!a || !ready) return;
  autoDone = true;
  phase = 'song';
  try { a.volume = 1; } catch (e) { /* iOS: solo lectura */ }
  a.src = songUrl;
  if (userPaused) {
    // Ella pausó el ambiente: la canción queda lista, sin sonar.
    setToggle(false);
    showToggle();
    return;
  }
  const p = a.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {}, () => showFallback());
  }
}

// Arranque único: con canción lista + Egipto.
function tryAuto() {
  if (autoDone || !ready || !egyptFired) return;
  startSong();
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
    if (phase === 'none') return;
    const tryPlay = () => {
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    };
    if (a.paused || a.ended) {
      userPaused = false;
      if (phase === 'song') playSong();
      else if (phase === 'ambient') tryPlay();
      else if (a.currentTime < TOTAL - 0.2 && !a.ended) tryPlay();
      else if (ready && egyptFired) startSong();
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

  // Si algo ya sonaba antes de crear la UI (ambiente o canción).
  if (phase !== 'none' && !a.paused) {
    setToggle(true);
    showToggle();
  } else if (phase === 'song' && a.paused && !a.ended && !userPaused && a.currentTime === 0) {
    showFallback();
  } else {
    tryAuto();
  }
}
