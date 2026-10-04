#!/usr/bin/env python3
"""Cifrado y verificacion de los archivos de datos (AES-256-GCM, PBKDF2-SHA256)."""
import argparse, base64, getpass, io, json, os, sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 600000


def read_key(args):
    env = os.environ.get("K_KEY")
    if env and env.strip() and args.key_file:
        sys.exit("error: usar K_KEY o --key-file, no ambos")
    if env is not None and env.strip():
        return env.strip()
    if args.key_file:
        with io.open(args.key_file, encoding="utf-8") as f:
            lines = [l for l in f.read().splitlines() if l.strip()]
        if not lines:
            sys.exit("error: archivo de clave vacio")
        return lines[-1].strip()
    return getpass.getpass("Clave: ").strip()


def derive(key, salt):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER)
    return kdf.derive(key.encode("utf-8"))


def enc_bytes(key, data):
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(derive(key, salt)).encrypt(iv, data, None)
    return salt, iv, ct


def dec_bytes(key, salt, iv, ct):
    return AESGCM(derive(key, salt)).decrypt(iv, ct, None)


def b64(b):
    return base64.b64encode(b).decode("ascii")


def do_encrypt(key, carta, song, out):
    os.makedirs(out, exist_ok=True)
    with open(carta, "rb") as f:
        salt, iv, ct = enc_bytes(key, f.read())
    obj = {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER,
           "salt": b64(salt), "iv": b64(iv), "ct": b64(ct)}
    with open(os.path.join(out, "carta.enc"), "w", encoding="ascii", newline="\n") as f:
        f.write(json.dumps(obj, separators=(",", ":")))
    with open(song, "rb") as f:
        salt, iv, ct = enc_bytes(key, f.read())
    with open(os.path.join(out, "song.enc"), "wb") as f:
        f.write(salt + iv + ct)
    print("cifrado: carta.enc, song.enc")


def do_verify(key, carta, song, out):
    ok = True
    try:
        with open(os.path.join(out, "carta.enc"), encoding="ascii") as f:
            o = json.load(f)
        plain = dec_bytes(key, base64.b64decode(o["salt"]), base64.b64decode(o["iv"]),
                          base64.b64decode(o["ct"]))
        with open(carta, "rb") as f:
            same = plain == f.read()
        print("carta.enc:", "OK" if same else "DIFERENTE")
        ok &= same
    except Exception:
        print("carta.enc: FALLO (clave incorrecta o archivo invalido)")
        ok = False
    try:
        with open(os.path.join(out, "song.enc"), "rb") as f:
            b = f.read()
        plain = dec_bytes(key, b[:16], b[16:28], b[28:])
        with open(song, "rb") as f:
            same = plain == f.read()
        print("song.enc:", "OK" if same else "DIFERENTE")
        ok &= same
    except Exception:
        print("song.enc: FALLO (clave incorrecta o archivo invalido)")
        ok = False
    return ok


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("encrypt", "verify"):
        s = sub.add_parser(name)
        s.add_argument("--carta", required=True)
        s.add_argument("--song", required=True)
        s.add_argument("--out", default="data")
        s.add_argument("--key-file")
    a = p.parse_args()
    key = read_key(a)
    if a.cmd == "encrypt":
        do_encrypt(key, a.carta, a.song, a.out)
    else:
        sys.exit(0 if do_verify(key, a.carta, a.song, a.out) else 1)


if __name__ == "__main__":
    main()
