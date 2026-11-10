#!/usr/bin/env python3
"""Generate the extension icons.

Draws a camera outline with a strike through it and writes RGBA PNGs with the
standard library only, so the icons can be regenerated on any machine without
installing anything.

    python3 tools/make-icons.py
"""

import math
import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"
SIZES = (16, 32, 48, 128)
SAMPLES = 4  # supersampling factor per axis

BG = (0x16, 0x17, 0x1B, 255)
INK = (0xF2, 0xF3, 0xF5, 255)
ACCENT = (0x4F, 0x8C, 0xFF, 255)


def rounded_rect(px, py, cx, cy, half_w, half_h, radius):
    """Signed distance to a rounded rectangle. Negative inside."""
    qx = abs(px - cx) - (half_w - radius)
    qy = abs(py - cy) - (half_h - radius)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - radius


def segment(px, py, ax, ay, bx, by):
    """Signed distance to a line segment."""
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    denom = bax * bax + bay * bay
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (pax * bax + pay * bay) / denom))
    return math.hypot(pax - bax * t, pay - bay * t)


def over(dst, src):
    """Source-over compositing on straight alpha."""
    sa = src[3] / 255.0
    if sa <= 0:
        return dst
    da = dst[3] / 255.0
    out_a = sa + da * (1 - sa)
    if out_a <= 0:
        return (0, 0, 0, 0)
    channels = tuple(
        round((src[i] * sa + dst[i] * da * (1 - sa)) / out_a) for i in range(3)
    )
    return channels + (round(out_a * 255),)


def sample(x, y, size):
    """Colour of one subpixel at (x, y) in a `size` by `size` icon."""
    c = size / 2.0
    detailed = size >= 48

    px = BG if rounded_rect(x, y, c, c, c, c, size * 0.22) < 0 else (0, 0, 0, 0)

    stroke = size * 0.085
    body = rounded_rect(x, y, c, c, size * 0.30, size * 0.30, size * 0.10)
    if abs(body) < stroke / 2:
        px = over(px, INK)

    if detailed:
        lens = abs(math.hypot(x - c, y - c) - size * 0.135)
        if lens < stroke / 2:
            px = over(px, INK)

    # The strike, carved out of the shapes underneath so it stays legible.
    pad = size * 0.16
    d = segment(x, y, pad, pad, size - pad, size - pad)
    if d < stroke * 1.05:
        px = over(px, BG)
    if d < stroke / 2:
        px = over(px, ACCENT)

    return px


def render(size):
    rows = []
    step = 1.0 / SAMPLES
    offset = step / 2.0
    for py in range(size):
        row = bytearray()
        for pxi in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SAMPLES):
                for sx in range(SAMPLES):
                    col = sample(
                        pxi + offset + sx * step, py + offset + sy * step, size
                    )
                    a = col[3] / 255.0
                    acc[0] += col[0] * a
                    acc[1] += col[1] * a
                    acc[2] += col[2] * a
                    acc[3] += col[3]
            n = SAMPLES * SAMPLES
            alpha = acc[3] / n
            if alpha <= 0:
                row += bytes(4)
                continue
            weight = acc[3] / 255.0
            row += bytes(
                (
                    round(acc[0] / weight),
                    round(acc[1] / weight),
                    round(acc[2] / weight),
                    round(alpha),
                )
            )
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        write_png(path, size, render(size))
        print(f"wrote {path.relative_to(OUT_DIR.parent)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
