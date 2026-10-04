// Orquestación: portada -> descifrado -> saludo.
import { decryptCarta, decryptSong } from './crypto.js';
import * as audio from './audio.js';
import { renderLetter, renderEnding } from './render.js';
import { initAnimations } from './animations.js';
import { playGreeting } from './greeting.js';

export const VERSION = 12;

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

  greeting.hidden = false;
  letter.hidden = false;
  ending.hidden = false;
  window.scrollTo(0, 0);
  if (typeof audio.initAudio === 'function') audio.initAudio(carta.closing);
  initAnimations(letter, ending);
  playGreeting(carta.greeting, greeting).catch(() => {});

  // Canción en segundo plano.
  decryptSong(pass, 'data/song.enc?v=' + VERSION).then((b) => (typeof audio.loadSong === 'function' ? audio.loadSong(b) : null)).catch(() => {});
});
