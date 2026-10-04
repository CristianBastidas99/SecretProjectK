#!/usr/bin/env python3
"""Recorta un MP3 con fade-out, sin metadatos."""
import argparse, subprocess, sys
import imageio_ffmpeg


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="private/original.mp3")
    p.add_argument("--output", default="private/song.mp3")
    p.add_argument("--start", type=float, default=0)
    p.add_argument("--end", type=float, default=105)
    p.add_argument("--fade", type=float, default=3)
    p.add_argument("--bitrate", default="128k")
    a = p.parse_args()
    dur = a.end - a.start
    if dur <= 0 or a.fade > dur:
        sys.exit("error: rango invalido")
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-ss", str(a.start), "-t", str(dur),
           "-i", a.input, "-vn", "-map_metadata", "-1", "-map", "0:a:0",
           "-af", "afade=t=out:st=%s:d=%s" % (dur - a.fade, a.fade),
           "-c:a", "libmp3lame", "-b:a", a.bitrate, "-id3v2_version", "0",
           "-write_xing", "0", a.output]
    sys.exit(subprocess.call(cmd))


if __name__ == "__main__":
    main()
