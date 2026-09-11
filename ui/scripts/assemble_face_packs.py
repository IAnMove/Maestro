#!/usr/bin/env python3
"""Assemble 9×6 viseme/expression face packs and a synthetic vowel WAV."""
from __future__ import annotations

import math
import struct
import subprocess
import sys
import wave
import zlib
from pathlib import Path

TILE = 128
COLS, ROWS = 9, 6
VISEMES = ('rest', 'M', 'A', 'E', 'I', 'O', 'U', 'F', 'L')
EXPRESSIONS = ('neutral', 'happy', 'angry', 'worried', 'surprised', 'sleepy')
SRC = Path.home() / '.grok/sessions/%2Fhome%2Fina%2Fpinokio%2Fapi%2FMaestro-next.git/01a08b0b-218e-70c3-8a34-9524f3f316f3/images'
OUT = Path(__file__).resolve().parents[1] / 'public/examples/face-pack'
FFMPEG = 'ffmpeg'

TV_VISEMES = {'rest': 1, 'M': 11, 'A': 7, 'E': 6, 'I': 13, 'O': 9, 'U': 16, 'F': 15, 'L': 19}
TV_EXPR = {'neutral': 1, 'happy': 18, 'angry': 23, 'worried': 22, 'surprised': 24, 'sleepy': 25}
SK_VISEMES = {'rest': 2, 'M': 3, 'A': 5, 'E': 8, 'I': 12, 'O': 10, 'U': 17, 'F': 14, 'L': 21}
SK_EXPR = {'neutral': 2, 'happy': 28, 'angry': 26, 'worried': 29, 'surprised': 27, 'sleepy': 30}


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def load_tile(index: int, crop: str) -> bytes:
    src = SRC / f'{index}.jpg'
    vf = f'{crop},scale=128:128' if crop else 'scale=128:128'
    proc = subprocess.run(
        [FFMPEG, '-v', 'error', '-i', str(src), '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
        check=True, stdout=subprocess.PIPE,
    )
    if len(proc.stdout) != TILE * TILE * 3:
        raise RuntimeError(f'{src} decoded to {len(proc.stdout)} bytes')
    return proc.stdout


def paste_mouth(base: bytes, viseme: bytes, cx: float, cy: float, rx: float, ry: float) -> bytes:
    out = bytearray(base)
    for y in range(TILE):
        ny = (y + 0.5 - cy) / ry
        for x in range(TILE):
            nx = (x + 0.5 - cx) / rx
            d = nx * nx + ny * ny
            if d > 1.2:
                continue
            a = 1.0 if d <= 0.92 else max(0.0, 1.0 - (d - 0.92) / 0.28)
            i = (y * TILE + x) * 3
            for c in range(3):
                out[i + c] = int(out[i + c] * (1 - a) + viseme[i + c] * a)
    return bytes(out)


def write_png(path: Path, width: int, height: int, rgb: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + rgb[y * width * 3:(y + 1) * width * 3] for y in range(height))
    path.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


def assemble(name: str, visemes: dict[str, int], expressions: dict[str, int], crop: str, mouth: tuple[float, float, float, float]) -> None:
    vis_tiles = {key: load_tile(index, crop) for key, index in visemes.items()}
    expr_tiles = {key: load_tile(index, crop) for key, index in expressions.items()}
    width, height = TILE * COLS, TILE * ROWS
    canvas = bytearray(width * height * 3)
    cx, cy, rx, ry = mouth
    for row, expression in enumerate(EXPRESSIONS):
        base = expr_tiles[expression]
        for col, viseme in enumerate(VISEMES):
            tile = vis_tiles[viseme] if expression == 'neutral' or viseme == 'rest' else paste_mouth(base, vis_tiles[viseme], cx, cy, rx, ry)
            for y in range(TILE):
                dst = ((row * TILE + y) * width + col * TILE) * 3
                src = y * TILE * 3
                canvas[dst:dst + TILE * 3] = tile[src:src + TILE * 3]
    write_png(OUT / f'{name}-pack.png', width, height, bytes(canvas))
    rest_row = bytearray(TILE * COLS * TILE * 3)
    for col, viseme in enumerate(VISEMES):
        tile = vis_tiles[viseme]
        for y in range(TILE):
            dst = (y * TILE * COLS + col * TILE) * 3
            src = y * TILE * 3
            rest_row[dst:dst + TILE * 3] = tile[src:src + TILE * 3]
    write_png(OUT / f'{name}-visemes.png', TILE * COLS, TILE, bytes(rest_row))


def synth_vowels(path: Path) -> None:
    sr = 22050
    samples: list[float] = [0.0] * int(sr * 8)

    def osc(freq: float, i: int) -> float:
        return math.sin(2 * math.pi * freq * i / sr)

    def put(start: float, dur: float, f1: float, f2: float, amp: float = 0.2) -> None:
        n0 = int(start * sr)
        n = int(dur * sr)
        for i in range(n):
            t = i / sr
            env = min(1.0, t * 40) * min(1.0, (dur - t) * 18)
            s = 0.55 * osc(f1, i) + 0.32 * osc(f2, i) + 0.13 * osc(f1 * 2, i)
            samples[n0 + i] += amp * env * s

    # Two identical vowel passes: CRT 0–4 s, skull 4–8 s.
    for base in (0.0, 4.0):
        put(base + 0.35, 0.5, 700, 1200, 0.22)   # A
        put(base + 1.05, 0.5, 530, 1840, 0.2)    # E
        put(base + 1.75, 0.5, 270, 2290, 0.18)   # I
        put(base + 2.45, 0.5, 570, 840, 0.22)    # O
        put(base + 3.15, 0.5, 300, 870, 0.2)     # U

    with wave.open(str(path), 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        frames = b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples)
        wav.writeframes(frames)


def main() -> int:
    if not (SRC / '1.jpg').is_file():
        print('missing Imagine sources', file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    assemble('tv', TV_VISEMES, TV_EXPR, crop='crop=520:600:252:210', mouth=(64, 84, 36, 22))
    assemble('skull', SK_VISEMES, SK_EXPR, crop='crop=iw*0.72:ih*0.72:(iw-iw*0.72)/2:(ih-ih*0.72)/2', mouth=(64, 90, 44, 32))
    synth_vowels(OUT / 'neutral-vowels.wav')
    for name in ('tv-pack.png', 'skull-pack.png', 'tv-visemes.png', 'skull-visemes.png', 'neutral-vowels.wav'):
        print(name, (OUT / name).stat().st_size)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
