#!/usr/bin/env python3
"""Genera data/a1.mp3: musica de ambiente original, sintetizada (stdlib + ffmpeg).

Estructura (segundos):
  0 .. LOOP_END      cuerpo en bucle; es circular por construccion (todo se suma con
                     modulo LOOP_LEN), asi que el final enlaza sin costura con el inicio.
  LOOP_END .. TOTAL  salida: la continuacion circular del cuerpo con fundido a silencio.
"""
import array, math, os, random, subprocess, sys, wave
import imageio_ffmpeg

SR = 32000
LOOP_LEN = 96.0          # cuerpo en bucle (s)
LOOP_END = 96.0          # inicio de la salida (s)
OUTRO = 6.0
TOTAL = LOOP_END + OUTRO  # 102.0 s
CHORD = 12.0
PEAK_DB = -8.0
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORK = os.path.join(ROOT, 'private', 'work_ambient')
N = int(LOOP_LEN * SR)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)

# notas MIDI de cada acorde (D mayor / Si menor / Sol mayor / La sus)
D, FS, A, CS, E, B, G, FS2 = 50, 54, 57, 61, 64, 59, 55, 66
CHORDS = [
    [38, 45, 54, 57, 61, 64],        # Dmaj9
    [35, 45, 54, 57, 61, 62 + 12],   # Bm9
    [31, 47, 54, 57, 62, 66],        # Gmaj7
    [33, 45, 50, 52, 54, 64],        # A6sus4
    [38, 45, 54, 57, 61, 64],        # Dmaj9
    [30 + 12, 45, 52, 57, 61, 64],   # F#m7
    [31, 47, 54, 57, 62, 66],        # Gmaj7
    [33, 45, 52, 57, 59, 64],        # Asus4 add9
]
SCALE_PC = {2, 4, 6, 7, 9, 11, 1}    # D mayor
SCALE_PC = {p % 12 for p in (2, 4, 6, 7, 9, 11, 13)}


def pad(buf, start, notes, amp):
    """Colchon: sinusoides desafinadas + armonicos tenues, ataque/relajacion lentos."""
    fade = 4.0
    t0, t1 = -fade, CHORD + fade
    n0, n1 = int(t0 * SR), int(t1 * SR)
    voices = []
    for k, m in enumerate(notes):
        f = hz(m)
        for det, a in ((1.0, 1.0), (1.0017, 0.7), (0.9984, 0.7)):
            voices.append((2 * math.pi * f * det, a, k * 1.7 + det * 3))
        voices.append((2 * math.pi * f * 2.0005, 0.16, k))
        voices.append((2 * math.pi * f * 3.0, 0.05, k * 0.5))
    norm = amp / len(notes)
    lfo = 2 * math.pi * 0.11
    for i in range(n0, n1):
        t = i / SR
        if t < 0:
            e = 0.5 - 0.5 * math.cos(math.pi * (t + fade) / fade)
        elif t > CHORD:
            e = 0.5 + 0.5 * math.cos(math.pi * (t - CHORD) / fade)
        else:
            e = 1.0
        s = 0.0
        for w, a, ph in voices:
            s += a * math.sin(w * (t + start) + ph)
        s *= (0.88 + 0.12 * math.sin(lfo * (t + start))) * e * norm
        buf[(int(start * SR) + i) % N] += s


def bell(buf, t, f, amp, dec):
    """Nota tipo caja de musica: ataque corto, decaimiento largo."""
    length = int(min(7.0, dec * 6) * SR)
    base = int(t * SR)
    w = 2 * math.pi * f
    for i in range(length):
        x = i / SR
        env = (1 - math.exp(-x * 600)) * math.exp(-x / dec)
        env2 = (1 - math.exp(-x * 600)) * math.exp(-x / (dec * 0.4))
        s = math.sin(w * x) + 0.28 * math.sin(2 * w * x) * env2 / max(env, 1e-9) * (env > 1e-9)
        buf[(base + i) % N] += s * env * amp


def main():
    rnd = random.Random(20260611)
    body = array.array('d', bytes(8 * N))
    for ci, ch in enumerate(CHORDS):
        pad(body, ci * CHORD, ch, 0.9)
    # notas sueltas de la escala, segun el acorde activo
    notes = array.array('d', bytes(8 * N))
    t = 2.5
    while t < LOOP_LEN - 1.0:
        ci = int(t // CHORD) % len(CHORDS)
        cands = [m for m in range(69, 91) if (m % 12) in SCALE_PC]
        chord_pcs = {m % 12 for m in CHORDS[ci]}
        pool = [m for m in cands if (m % 12) in chord_pcs] * 3 + cands
        m = rnd.choice(pool)
        a = rnd.uniform(0.07, 0.13)
        dec = rnd.uniform(0.9, 1.5)
        bell(notes, t, hz(m), a, dec)
        if rnd.random() < 0.45:   # eco suave
            d = rnd.choice((0.5, 0.75))
            bell(notes, t + d, hz(m), a * 0.38, dec)
            bell(notes, t + 2 * d, hz(m), a * 0.14, dec)
        t += rnd.uniform(2.6, 6.2)
    # suavizado ligero del timbre de las notas (paso bajo de un polo) y mezcla
    lp, k = 0.0, 0.35
    for i in range(N):
        lp += k * (notes[i] - lp)
        notes[i] = lp
    for i in range(N):
        body[i] += notes[i]
    # normaliza el pico del cuerpo; la salida es la continuacion circular con fundido
    nout = int(OUTRO * SR)
    full = array.array('d', body)
    for i in range(nout):
        x = i / nout
        full.append(body[i % N] * (0.5 + 0.5 * math.cos(math.pi * x)) ** 1.5)
    # compresion suave de picos (cresta alta del colchon) para subir la sonoridad sin subir el pico
    pk0 = max(abs(v) for v in full)
    DRIVE = 1.8
    full = array.array('d', (math.tanh(DRIVE * v / pk0) for v in full))
    peak = max(abs(v) for v in full)
    g = (10 ** (PEAK_DB / 20)) / peak
    pcm = array.array('h', (int(round(v * g * 32767)) for v in full))
    os.makedirs(WORK, exist_ok=True)
    wav = os.path.join(WORK, 'ambient.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    out = os.path.join(ROOT, 'data', 'a1.mp3')
    subprocess.check_call([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-v', 'error', '-i', wav, '-ac', '1',
                           '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1',
                           '-id3v2_version', '0', out])
    print('LOOP_END', LOOP_END, 'TOTAL', TOTAL, 'peak', PEAK_DB, 'bytes', os.path.getsize(out))


if __name__ == '__main__':
    main()
