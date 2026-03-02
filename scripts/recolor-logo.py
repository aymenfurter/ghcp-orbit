#!/usr/bin/env python3
"""Recolor blackwhitelogo.png: white->transparent, black->blue/purple gradient, on dark bg."""
from PIL import Image, ImageDraw
import os

assets = os.path.join(os.path.dirname(__file__), '..', 'assets')
src = Image.open(os.path.join(assets, 'blackwhitelogo.png')).convert('RGBA')
w, h = src.size

# Gradient endpoints
c1 = (88, 166, 255)   # #58a6ff blue
c2 = (188, 140, 255)  # #bc8cff purple

# Recolor: white -> transparent, dark -> gradient color
out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
ps = src.load()
po = out.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = ps[x, y]
        brightness = (r + g + b) / 3.0
        if brightness > 220:
            po[x, y] = (0, 0, 0, 0)
        else:
            t = (x / w + y / h) / 2.0
            cr = int(c1[0] * (1 - t) + c2[0] * t)
            cg = int(c1[1] * (1 - t) + c2[1] * t)
            cb = int(c1[2] * (1 - t) + c2[2] * t)
            opacity = int((1.0 - brightness / 255.0) * 255)
            po[x, y] = (cr, cg, cb, opacity)

# Create 512x512 canvas with dark rounded rect
sz = 512
canvas = Image.new('RGBA', (sz, sz), (0, 0, 0, 0))
bg = Image.new('RGBA', (sz, sz), (0, 0, 0, 0))
draw = ImageDraw.Draw(bg)
draw.rounded_rectangle([0, 0, sz - 1, sz - 1], radius=108, fill=(13, 17, 23, 255))
canvas = Image.alpha_composite(canvas, bg)

# Scale logo to ~65% of canvas, center it
logo_max = int(sz * 0.65)
scale = min(logo_max / w, logo_max / h)
nw, nh = int(w * scale), int(h * scale)
logo = out.resize((nw, nh), Image.LANCZOS)
xo = (sz - nw) // 2
yo = (sz - nh) // 2
canvas.paste(logo, (xo, yo), logo)

# Save main icons
canvas.save(os.path.join(assets, 'icon.png'))
canvas.save(os.path.join(assets, 'icon-512.png'))
print('icon.png (512x512)')

for s in [16, 32, 48, 64, 128, 256, 1024]:
    canvas.resize((s, s), Image.LANCZOS).save(os.path.join(assets, f'icon-{s}.png'))
    print(f'icon-{s}.png')

# macOS iconset
isd = os.path.join(assets, 'icon.iconset')
os.makedirs(isd, exist_ok=True)
for name, s in {'icon_16x16.png': 16, 'icon_16x16@2x.png': 32,
                'icon_32x32.png': 32, 'icon_32x32@2x.png': 64,
                'icon_128x128.png': 128, 'icon_128x128@2x.png': 256,
                'icon_256x256.png': 256, 'icon_256x256@2x.png': 512,
                'icon_512x512.png': 512, 'icon_512x512@2x.png': 1024}.items():
    canvas.resize((s, s), Image.LANCZOS).save(os.path.join(isd, name))
print('iconset done')

# Generate .icns
os.system(f'iconutil -c icns "{isd}" -o "{os.path.join(assets, "icon.icns")}"')
print('icon.icns done')
