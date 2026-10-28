#!/usr/bin/env python3
"""Recolor the two diagonal T's to the TableTrade wordmark orange on white.

Orange is --ember in src/index.css, the color of the Trade half of the wordmark.
"""

from __future__ import annotations

import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
FOREGROUND = ROOT / "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png"
ORANGE = (255, 107, 53, 255)  # #ff6b35
WHITE = (255, 255, 255, 255)


def is_mark(r: int, g: int, b: int, a: int) -> bool:
    if a < 16:
        return False
    if b > r + 12 and b > 120:
        return True
    # Already recolored: orange, not white.
    if r > 180 and 40 < g < 160 and b < 120 and r > b + 40:
        return True
    return False


def recolor(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if not is_mark(r, g, b, a):
                if a > 0:
                    px[x, y] = (255, 255, 255, a)
                continue
            cov = (255 - min(r, 255)) / (255 - 108) if b > r + 12 else 1
            cov = 0 if cov < 0 else 1 if cov > 1 else cov
            px[x, y] = (
                int(round(255 + (ORANGE[0] - 255) * cov)),
                int(round(255 + (ORANGE[1] - 255) * cov)),
                int(round(255 + (ORANGE[2] - 255) * cov)),
                a,
            )
    return im


def components(im: Image.Image) -> list[list[tuple[int, int]]]:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    out: list[list[tuple[int, int]]] = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or not is_mark(*px[x, y]):
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            pts: list[tuple[int, int]] = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_mark(*px[nx, ny]):
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(pts) > 80:
                out.append(pts)
    return out


def trace(mask: list[list[bool]]) -> list[tuple[int, int]]:
    h = len(mask)
    w = len(mask[0])
    start = None
    for y in range(h):
        for x in range(w):
            if mask[y][x]:
                start = (x, y)
                break
        if start:
            break
    if not start:
        return []
    dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
    sx, sy = start
    x, y = sx, sy
    bdir = 4
    contour: list[tuple[int, int]] = []
    for _ in range(w * h * 2):
        contour.append((x, y))
        found = False
        for k in range(8):
            nd = (bdir + 1 + k) % 8
            dx, dy = dirs[nd]
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and mask[ny][nx]:
                bdir = (nd + 4) % 8
                x, y = nx, ny
                found = True
                break
        if not found or ((x, y) == (sx, sy) and len(contour) > 8):
            break
    return contour


def rdp(points: list[tuple[int, int]], eps: float) -> list[tuple[int, int]]:
    if len(points) < 3:
        return points

    def dist(p, a, b) -> float:
        x, y = p
        x1, y1 = a
        x2, y2 = b
        dx, dy = x2 - x1, y2 - y1
        if dx == dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))

    a, b = points[0], points[-1]
    idx, md = 0, -1.0
    for i in range(1, len(points) - 1):
        d = dist(points[i], a, b)
        if d > md:
            idx, md = i, d
    if md > eps:
        left = rdp(points[: idx + 1], eps)
        right = rdp(points[idx:], eps)
        return left[:-1] + right
    return [a, b]


def write_favicon(im: Image.Image) -> None:
    w, h = im.size
    paths = []
    for pts in components(im):
        mask = [[False] * w for _ in range(h)]
        for x, y in pts:
            mask[y][x] = True
        contour = rdp(trace(mask), 1.6)
        if len(contour) < 3:
            continue
        bits = []
        for i, (x, y) in enumerate(contour):
            cmd = "M" if i == 0 else "L"
            bits.append(f"{cmd}{x / w * 64:.2f} {y / h * 64:.2f}")
        bits.append("Z")
        paths.append(" ".join(bits))
    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
        '<rect width="64" height="64" fill="#ffffff"/>',
    ]
    for d in paths:
        svg.append(f'<path fill="#ff6b35" d="{d}"/>')
    svg.append("</svg>")
    dest = ROOT / "public/favicon.svg"
    dest.write_text("\n".join(svg) + "\n", encoding="utf-8")
    print("wrote", dest)


def pwa_icons(foreground: Image.Image) -> None:
    flat = Image.new("RGBA", foreground.size, WHITE)
    flat.alpha_composite(foreground)
    out = ROOT / "public/icons"
    out.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        flat.resize((size, size), Image.Resampling.LANCZOS).convert("RGB").save(out / f"icon-{size}.png", "PNG")
        print("wrote", out / f"icon-{size}.png")


def main() -> None:
    source = Image.open(FOREGROUND)
    write_favicon(source)
    res = ROOT / "android/app/src/main/res"
    for png in sorted(res.glob("mipmap-*/ic_launcher*.png")):
        recolor(Image.open(png)).save(png, "PNG")
        print("recolored", png.relative_to(ROOT))
    pwa_icons(recolor(Image.open(FOREGROUND)))


if __name__ == "__main__":
    main()
