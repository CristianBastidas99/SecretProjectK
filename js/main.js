// Orquestación: portada -> descifrado -> saludo.
import { decryptCarta, decryptSong } from './crypto.js';
import * as audio from './audio.js';
import { renderLetter, renderEnding } from './render.js?v=2';
import { initAnimations } from './animations.js?v=2';
import { playGreeting } from './greeting.js';
import { initHints } from './hints.js';
import { buildKeepsake } from './keepsake.js?v=2';

export const VERSION = 30;

const OPEN_MS = 950;

const $ = (id) => document.getElementById(id);
const form = $('keyform');
const input = $('key');
const button = $('open');
const note = $('note');
const envelope = $('envelope');
const cover = $('cover');
const greeting = $('greeting');
const letter = $('letter');
const ending = $('ending');
const loader = $('loader');

// Datos descifrados: solo en memoria.
let carta = null;
let busy = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Aviso al autor cuando alguien abre la carta (misma config cifrada que el regalo).
// Con #yo en la URL no avisa, para las pruebas propias.
function notifyOpen(closing) {
  const n = closing && closing.notify;
  const o = n && n.open;
  if (!o || typeof n.url !== 'string' || !n.url || typeof n.topic !== 'string' || !n.topic) return;
  if (location.hash === '#yo') return;
  const ua = navigator.userAgent || '';
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : 'computador';
  const when = new Date().toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  fetch(n.url, {
    method: 'POST',
    keepalive: true,
    body: JSON.stringify({ topic: n.topic, title: o.title || '', message: (o.message || '') + ' · ' + device + ' · ' + when, tags: ['love_letter'] })
  }).catch(() => {});
}

function showNote(text) {
  note.textContent = text || '';
  note.classList.toggle('is-visible', Boolean(text));
}

function shake() {
  envelope.classList.remove('is-shaking');
  void envelope.getBoundingClientRect(); // reinicia la animación
  envelope.classList.add('is-shaking');
}

function setBusy(on) {
  busy = on;
  button.disabled = on;
  input.readOnly = on;
}

const MESSAGES = {
  WRONG_KEY: 'Prueba de nuevo.',
  NETWORK: 'No se pudo cargar. Revisa tu conexión e inténtalo otra vez.',
  UNSUPPORTED: 'Este navegador no puede abrirlo. Prueba con otro.'
};

envelope.addEventListener('animationend', () => envelope.classList.remove('is-shaking'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;

  // Gesto del usuario: desbloqueo de audio antes de cualquier await.
  if (typeof audio.unlockAudio === 'function') audio.unlockAudio();

  const pass = input.value.trim();
  showNote('');
  setBusy(true);

  try {
    carta = await decryptCarta(pass, 'data/carta.enc?v=' + VERSION);
  } catch (err) {
    setBusy(false);
    const code = err && err.code;
    if (code === 'WRONG_KEY') shake();
    showNote(MESSAGES[code] || MESSAGES.NETWORK);
    return;
  }

  notifyOpen(carta.closing);

  // Ambiente suave desde aquí (el elemento ya se desbloqueó en el gesto).
  if (typeof audio.startAmbient === 'function') audio.startAmbient(VERSION);

  // Éxito: render en paralelo con la apertura del sobre, luego saludo.
  const rendering = Promise.all([renderLetter(carta, letter), renderEnding(carta.closing, ending)]).catch(() => {});
  envelope.classList.add('is-open');
  cover.classList.add('is-opening');
  await wait(OPEN_MS);
  cover.classList.add('is-leaving');
  await wait(700);

  // Hueco con red lenta: la pluma solo aparece si el render aún no terminó.
  let ready = false;
  rendering.then(() => { ready = true; });
  await Promise.race([rendering, wait(250)]);
  if (!ready) {
    loader.hidden = false;
    void loader.getBoundingClientRect();
    loader.classList.add('is-on');
    await Promise.all([rendering, wait(900)]);
    loader.classList.remove('is-on');
    await wait(500);
    loader.hidden = true;
  }
  cover.hidden = true;

  // Botón para guardar la carta en PDF, bajo el crédito de la canción.
  const keep = buildKeepsake(carta);
  const endInner = ending.querySelector('.end-inner');
  if (keep && endInner) endInner.appendChild(keep);

  greeting.hidden = false;
  letter.hidden = false;
  ending.hidden = false;
  window.scrollTo(0, 0);
  if (typeof audio.initAudio === 'function') audio.initAudio(carta.closing);
  initAnimations(letter, ending);
  initHints(letter);
  playGreeting(carta.greeting, greeting).catch(() => {});

  // Canción en segundo plano.
  decryptSong(pass, 'data/song.enc?v=' + VERSION).then((b) => (typeof audio.loadSong === 'function' ? audio.loadSong(b) : null)).catch(() => {});
});
