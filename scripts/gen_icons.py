"""
One-off script (not part of the app runtime) to generate placeholder PWA
icons in the app's cocoa/paper palette. Draws a simple parcel glyph so the
home-screen icon reads as "shipment tracking" rather than a generic letter
mark. Regenerate any time with: python3 scripts/gen_icons.py
"""
from PIL import Image, ImageDraw

COCOA = (92, 58, 33, 255)      # #5C3A21
PAPER = (250, 249, 246, 255)   # #FAF9F6
COCOA_DARK = (62, 39, 22, 255) # #3E2716


def draw_parcel(draw, cx, cy, size, color):
    """Simple isometric-ish parcel/box glyph centered at (cx, cy)."""
    half = size / 2
    # box outline (rounded square)
    box = [cx - half, cy - half * 0.85, cx + half, cy + half * 0.85]
    draw.rounded_rectangle(box, radius=size * 0.09, outline=color, width=max(2, int(size * 0.045)))
    # vertical ribbon
    draw.line([(cx, cy - half * 0.85), (cx, cy + half * 0.85)], fill=color, width=max(2, int(size * 0.045)))
    # top flap "v"
    flap_w = half * 0.55
    draw.line([(cx - flap_w, cy - half * 0.85), (cx, cy - half * 0.85 + flap_w * 0.6)], fill=color, width=max(2, int(size * 0.045)))
    draw.line([(cx + flap_w, cy - half * 0.85), (cx, cy - half * 0.85 + flap_w * 0.6)], fill=color, width=max(2, int(size * 0.045)))


def make_icon(path, size, bg, fg, safe_zone_ratio=1.0):
    img = Image.new("RGBA", (size, size), bg)
    draw = ImageDraw.Draw(img)
    glyph_size = size * 0.52 * safe_zone_ratio
    draw_parcel(draw, size / 2, size / 2, glyph_size, fg)
    img.save(path)
    print(f"wrote {path}")


if __name__ == "__main__":
    import os
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out_dir, exist_ok=True)

    make_icon(os.path.join(out_dir, "icon-192.png"), 192, COCOA, PAPER)
    make_icon(os.path.join(out_dir, "icon-512.png"), 512, COCOA, PAPER)
    # Maskable: keep glyph within the safe ~80% zone since OS may crop to a circle
    make_icon(os.path.join(out_dir, "icon-maskable-512.png"), 512, COCOA, PAPER, safe_zone_ratio=0.7)
