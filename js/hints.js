// Pistas de navegación: flecha de «sigue bajando» cuando la lectora se detiene, y anillo que enseña
// que los dibujos se pueden tocar. Cada parte vive en su propio módulo.
import { initScrollHint } from './scrollhint.js';
import { initTapHint } from './taphint.js';

export function initHints(root) {
  try { initScrollHint(root); } catch (err) { /* una pista nunca debe romper la carta */ }
  try { initTapHint(root); } catch (err) { /* idem */ }
}
