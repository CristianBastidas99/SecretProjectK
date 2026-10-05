# Carta interactiva

Sitio estático (HTML, CSS y JavaScript sin dependencias ni paso de build) que presenta una carta
personal como una experiencia de scroll: un sobre que se abre con una clave, un saludo animado,
secciones ilustradas con SVG dibujados a trazo, una transición temática y un cierre con música.

El contenido de la carta y la canción no están en el repositorio en claro: se publican cifrados
(AES-256-GCM con clave derivada por PBKDF2-SHA256) y se descifran en el navegador con Web Crypto
cuando se introduce la clave correcta. Lo descifrado vive solo en memoria.

## Estructura

```
index.html          Página única (portada con el sobre, carta y cierre)
css/styles.css      Estilos y animaciones
js/
  main.js           Orquestación: clave -> descifrado -> apertura -> saludo
  crypto.js         Descifrado en el navegador (PBKDF2 + AES-GCM)
  render.js         Construye las secciones a partir de los datos descifrados
  animations.js     Revelado por sección, tema de color y progreso
  greeting.js       Animación del saludo
  egypt.js          Transición temática ligada al scroll
  audio.js          Música de ambiente y reproducción de la canción
svg/                Marcos e ilustraciones de cada sección
data/               Archivos cifrados (carta.enc, song.enc) y música de ambiente (a1.mp3)
tools/              Scripts de Python para servir, cifrar y preparar audio
```

## Requisitos

- Un navegador moderno (Web Crypto requiere `https://` o `localhost`).
- Python 3.9+ para los scripts de `tools/`.
- Dependencias de Python (solo para cifrar y generar audio):

```bash
pip install cryptography imageio-ffmpeg
```

## Ver el sitio en local

```bash
python tools/serve.py          # http://localhost:8000
python tools/serve.py 8080     # otro puerto
```

Es un servidor estático con soporte de peticiones `Range`, que Safari necesita para reproducir
audio. Abrir `index.html` directamente desde el disco no funciona (fetch y Web Crypto lo bloquean).

## Scripts

Todos se ejecutan desde la raíz del proyecto.

### `tools/encrypt.py` — cifrar y verificar los datos

Cifra la carta (JSON) y la canción (MP3) y genera `data/carta.enc` y `data/song.enc`.

```bash
python tools/encrypt.py encrypt --carta ruta/carta.json --song ruta/song.mp3 [--out data]
python tools/encrypt.py verify  --carta ruta/carta.json --song ruta/song.mp3 [--out data]
```

La clave se toma, por orden, de la variable de entorno `K_KEY`, de `--key-file <archivo>` (última
línea no vacía) o se pide por consola. `verify` descifra los `.enc` y los compara con los
originales; devuelve código de salida 1 si algo no coincide.

> Los archivos originales en claro y la clave no deben subirse al repositorio.

### `tools/trim_audio.py` — recortar la canción

Recorta un MP3 a un fragmento, le aplica un fundido de salida y elimina los metadatos.

```bash
python tools/trim_audio.py --input entrada.mp3 --output salida.mp3 --start 0 --end 105 --fade 3 --bitrate 128k
```

### `tools/ambient.py` — generar la música de ambiente

Sintetiza una pista original en bucle (colchón de acordes y notas tipo caja de música) y la
exporta a `data/a1.mp3`. No necesita parámetros.

```bash
python tools/ambient.py
```

Si se cambia su duración, hay que actualizar `LOOP_END`, `LOOP_LEN` y `TOTAL` en `js/audio.js`.

## Publicación

El sitio se puede servir desde cualquier hosting estático (por ejemplo GitHub Pages; el archivo
`.nojekyll` ya está incluido). Al cambiar los datos cifrados o los recursos, conviene subir
`VERSION` en `js/main.js` para evitar que el navegador use copias en caché.
