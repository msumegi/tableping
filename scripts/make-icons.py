#!/usr/bin/env python3
"""Generate TablePing PWA icons. No secrets; local asset only."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
ROOT.mkdir(parents=True, exist_ok=True)


def paint(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), "#12100e")
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    # ping rings
    d.ellipse(
        [cx - size * 0.36, cy - size * 0.36, cx + size * 0.36, cy + size * 0.36],
        outline="#f5d76e",
        width=max(2, size // 64),
    )
    d.ellipse(
        [cx - size * 0.24, cy - size * 0.24, cx + size * 0.24, cy + size * 0.24],
        outline="#ff6b35",
        width=max(3, size // 48),
    )
    # card silhouette
    cw, ch = size * 0.22, size * 0.32
    d.rounded_rectangle(
        [cx - cw / 2, cy - ch / 2 - size * 0.02, cx + cw / 2, cy + ch / 2 - size * 0.02],
        radius=size * 0.03,
        fill="#f3ead8",
        outline="#1c1410",
        width=max(2, size // 80),
    )
    r = size * 0.055
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="#ff6b35")
    return img


for n in (192, 512):
    paint(n).save(ROOT / f"icon-{n}.png", "PNG")
    print("wrote", ROOT / f"icon-{n}.png")
