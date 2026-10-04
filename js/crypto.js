// Descifrado en el navegador: PBKDF2-SHA256 + AES-256-GCM (Web Crypto).

const ITERATIONS = 600000;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function getSubtle() {
  const c = globalThis.crypto;
  if (!c || !c.subtle || globalThis.isSecureContext === false) {
    throw fail('UNSUPPORTED', 'Web Crypto no disponible');
  }
  return c.subtle;
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchOk(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch (e) {
    throw fail('NETWORK', 'Fallo de red');
  }
  if (!res.ok) throw fail('NETWORK', 'HTTP ' + res.status);
  return res;
}

// Deriva la clave AES y descifra (ct incluye el tag al final).
async function decrypt(subtle, pass, salt, iv, ct) {
  let plain;
  try {
    const base = await subtle.importKey(
      'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']
    );
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    plain = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch (e) {
    throw fail('WRONG_KEY', 'Clave incorrecta');
  }
  return new Uint8Array(plain);
}

export async function decryptCarta(pass, url) {
  const subtle = getSubtle();
  const res = await fetchOk(url);
  let meta;
  try {
    meta = await res.json();
  } catch (e) {
    throw fail('NETWORK', 'Respuesta no válida');
  }
  if (!meta || meta.v !== 1 || meta.kdf !== 'PBKDF2-SHA256' || meta.iter !== ITERATIONS) {
    throw fail('NETWORK', 'Formato no soportado');
  }
  const bytes = await decrypt(
    subtle, String(pass).trim(), b64ToBytes(meta.salt), b64ToBytes(meta.iv), b64ToBytes(meta.ct)
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function decryptSong(pass, url) {
  const subtle = getSubtle();
  const res = await fetchOk(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 28 + 16) throw fail('NETWORK', 'Archivo no válido');
  return decrypt(
    subtle, String(pass).trim(), buf.slice(0, 16), buf.slice(16, 28), buf.slice(28)
  );
}
