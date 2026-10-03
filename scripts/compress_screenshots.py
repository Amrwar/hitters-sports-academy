"""
Compresses docs/screenshots/*.png into docs/screenshots/jpg/*.jpg for the proposal document.
The proposal PDF renderer drops images above roughly 300 KB, so every file is kept under ~230 KB.
    python scripts/compress_screenshots.py
"""
from pathlib import Path
from PIL import Image

SRC = Path("docs/screenshots")
OUT = SRC / "jpg"
OUT.mkdir(exist_ok=True)
LIMIT = 230_000
# very tall pages get a narrower width so they stay under the limit at a readable quality
WIDTHS = {"design-system": 1200, "marketing-landing": 1400}

for png in sorted(SRC.glob("*.png")):
    im = Image.open(png).convert("RGB")
    w, h = im.size
    target = WIDTHS.get(png.stem, 1600 if w > 1600 else w)
    if target != w:
        im = im.resize((target, round(h * target / w)), Image.LANCZOS)
    out = OUT / f"{png.stem}.jpg"
    q = 82
    while True:
        im.save(out, "JPEG", quality=q, optimize=True, progressive=True)
        if out.stat().st_size < LIMIT or q <= 40:
            break
        q -= 5
    print(f"{out.stat().st_size:>8} q{q:<3} {im.size[0]}x{im.size[1]:<5} {out.name}")
