#!/usr/bin/env python3
"""Generate the Cogito GIF character pack."""
import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


PROJECT = Path(__file__).resolve().parent.parent
OUT = PROJECT / "characters" / "cogito"
PREVIEW = PROJECT / "characters" / "cogito-preview.png"
W, H = 96, 100
S = 4

BG = (0, 0, 0)
METAL = (178, 188, 191)
METAL_DARK = (86, 98, 102)
METAL_LIGHT = (232, 239, 239)
SCREEN = (8, 18, 20)
SCREEN_HI = (21, 43, 45)
GLOW = (27, 238, 196)
GLOW_DIM = (16, 126, 111)
INK = (5, 6, 7)
HAT = (12, 70, 40)
HAT_HI = (42, 140, 82)
RIBBON = (35, 238, 198)
GOLD = (218, 184, 86)
WARN = (255, 216, 93)
PINK = (255, 112, 152)
RED = (255, 62, 75)
WHITE = (236, 246, 242)


def sc(v):
    return int(round(v * S))


def point(p):
    return tuple(sc(v) for v in p)


def box(b):
    return tuple(sc(v) for v in b)


def rgba():
    return Image.new("RGBA", (W * S, H * S), (*BG, 255))


def rounded(draw, b, r, fill, outline=None, width=1):
    draw.rounded_rectangle(box(b), radius=sc(r), fill=fill, outline=outline, width=sc(width))


def rect(draw, b, fill, outline=None, width=1):
    draw.rectangle(box(b), fill=fill, outline=outline, width=sc(width))


def ellipse(draw, b, fill, outline=None, width=1):
    draw.ellipse(box(b), fill=fill, outline=outline, width=sc(width))


def line(draw, pts, fill, width=1):
    draw.line([point(p) for p in pts], fill=fill, width=sc(width), joint="curve")


def poly(draw, pts, fill, outline=None):
    draw.polygon([point(p) for p in pts], fill=fill, outline=outline)


def text5(draw, xy, text, fill, scale=1):
    font = {
        "0": ["111", "101", "101", "101", "111"],
        "1": ["010", "110", "010", "010", "111"],
        "?": ["111", "001", "011", "000", "010"],
        "!": ["1", "1", "1", "0", "1"],
        "Z": ["111", "001", "010", "100", "111"],
        ">": ["100", "010", "001", "010", "100"],
        "_": ["000", "000", "000", "000", "111"],
        ".": ["0", "0", "0", "0", "1"],
    }
    x, y = xy
    for ch in text:
        pat = font.get(ch.upper(), font["."])
        for row, bits in enumerate(pat):
            for col, bit in enumerate(bits):
                if bit == "1":
                    rect(draw, (x + col * scale, y + row * scale,
                                x + (col + 1) * scale - 0.1, y + (row + 1) * scale - 0.1), fill)
        x += (len(pat[0]) + 1) * scale


def spiral(draw, cx, cy, r, phase=0.0, color=GLOW, width=1.5, dim=False):
    steps = 52
    pts = []
    for i in range(steps):
        t = i / (steps - 1)
        a = phase + t * math.tau * 1.65
        rr = r * (1.0 - t * 0.82)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    line(draw, pts, color if not dim else GLOW_DIM, width)
    ellipse(draw, (cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1), None, GLOW_DIM, 0.7)


def heart(draw, cx, cy, s, fill):
    pts = [
        (cx, cy + 2.2 * s), (cx - 3.6 * s, cy - 1.1 * s),
        (cx - 2.8 * s, cy - 4.0 * s), (cx, cy - 2.5 * s),
        (cx + 2.8 * s, cy - 4.0 * s), (cx + 3.6 * s, cy - 1.1 * s),
    ]
    poly(draw, pts, fill)


def spark(draw, cx, cy, r, fill):
    line(draw, [(cx - r, cy), (cx + r, cy)], fill, 1)
    line(draw, [(cx, cy - r), (cx, cy + r)], fill, 1)


def body(draw, t=0, state="idle", xoff=0, yoff=0, eye_phase=0.0, eye_scale=1.0,
         eye_mode="spiral", lid=0.0, hat_tip=0.0, glow=1.0, arms="down", mouth="cursor",
         chest=None, extras=None):
    x = xoff
    y = yoff + math.sin(t * math.tau) * 0.8
    head = (20 + x, 26 + y, 76 + x, 68 + y)
    screen = (27 + x, 34 + y, 69 + x, 58 + y)

    # Tiny limbs.
    leg_shift = math.sin(t * math.tau) * 0.8
    line(draw, [(38 + x, 82 + y), (36 + x, 89 + y + leg_shift)], METAL_DARK, 3)
    line(draw, [(58 + x, 82 + y), (60 + x, 89 + y - leg_shift)], METAL_DARK, 3)
    ellipse(draw, (31 + x, 88 + y + leg_shift, 42 + x, 92 + y + leg_shift), METAL)
    ellipse(draw, (54 + x, 88 + y - leg_shift, 65 + x, 92 + y - leg_shift), METAL)

    if arms == "type":
        line(draw, [(23 + x, 70 + y), (12 + x, 79 + y + math.sin(t * math.tau) * 2)], METAL, 3)
        line(draw, [(73 + x, 70 + y), (84 + x, 79 + y - math.sin(t * math.tau) * 2)], METAL, 3)
        rounded(draw, (18 + x, 81 + y, 78 + x, 91 + y), 2, (28, 33, 35), METAL_DARK, 1)
        for i in range(10):
            rect(draw, (23 + x + i * 5, 84 + y + (i % 2), 25 + x + i * 5, 86 + y + (i % 2)), GLOW_DIM)
    elif arms == "alert":
        line(draw, [(23 + x, 70 + y), (10 + x, 50 + y)], METAL, 3)
        line(draw, [(73 + x, 70 + y), (86 + x, 50 + y)], METAL, 3)
        ellipse(draw, (6 + x, 46 + y, 15 + x, 55 + y), METAL_LIGHT)
        ellipse(draw, (81 + x, 46 + y, 90 + x, 55 + y), METAL_LIGHT)
    elif arms == "tip":
        line(draw, [(23 + x, 70 + y), (16 + x, 74 + y)], METAL, 3)
        line(draw, [(73 + x, 70 + y), (64 + x, 24 + y)], METAL, 3)
        ellipse(draw, (60 + x, 21 + y, 67 + x, 28 + y), METAL_LIGHT)
    elif arms == "heart":
        line(draw, [(23 + x, 70 + y), (32 + x, 76 + y)], METAL, 3)
        line(draw, [(73 + x, 70 + y), (64 + x, 76 + y)], METAL, 3)
    elif arms == "sleep":
        line(draw, [(24 + x, 70 + y), (31 + x, 80 + y)], METAL, 3)
        line(draw, [(72 + x, 70 + y), (65 + x, 80 + y)], METAL, 3)
        ellipse(draw, (28 + x, 78 + y, 36 + x, 86 + y), METAL_LIGHT)
        ellipse(draw, (60 + x, 78 + y, 68 + x, 86 + y), METAL_LIGHT)
    else:
        line(draw, [(23 + x, 70 + y), (12 + x, 75 + y)], METAL, 3)
        line(draw, [(73 + x, 70 + y), (84 + x, 75 + y)], METAL, 3)
        ellipse(draw, (9 + x, 72 + y, 17 + x, 80 + y), METAL_LIGHT)
        ellipse(draw, (79 + x, 72 + y, 87 + x, 80 + y), METAL_LIGHT)

    # Body and neck.
    rounded(draw, (32 + x, 66 + y, 64 + x, 84 + y), 6, METAL, METAL_DARK, 1)
    rect(draw, (39 + x, 64 + y, 57 + x, 70 + y), METAL_DARK)
    rounded(draw, head, 10, METAL, METAL_DARK, 1.4)
    rounded(draw, (23 + x, 29 + y, 73 + x, 65 + y), 8, METAL_LIGHT, None)
    rounded(draw, head, 10, None, METAL_DARK, 1.4)
    rounded(draw, screen, 5, SCREEN, SCREEN_HI, 1)

    # Screen scanlines.
    for yy in (39, 46, 53):
        line(draw, [(30 + x, yy + y), (66 + x, yy + y)], (10, 34, 33), 0.5)

    # Eyes.
    col = tuple(int(GLOW_DIM[i] + (GLOW[i] - GLOW_DIM[i]) * glow) for i in range(3))
    if eye_mode == "closed" or lid >= 1:
        line(draw, [(34 + x, 45 + y), (43 + x, 45 + y)], col, 2)
        line(draw, [(53 + x, 45 + y), (62 + x, 45 + y)], col, 2)
    elif eye_mode == "spiral":
        spiral(draw, 38 + x, 45 + y, 4.5 * eye_scale, eye_phase, col, 1.15)
        spiral(draw, 58 + x, 45 + y, 4.5 * eye_scale, eye_phase + 1.2, col, 1.15)
        if lid > 0:
            rect(draw, (31 + x, 40 + y, 65 + x, 45 + y + lid * 5), SCREEN)
    elif eye_mode == "focus":
        rounded(draw, (33 + x, 41 + y, 44 + x, 49 + y), 2, col, GLOW_DIM, 0.7)
        rounded(draw, (52 + x, 41 + y, 63 + x, 49 + y), 2, col, GLOW_DIM, 0.7)
        rect(draw, (37 + x, 43 + y, 39 + x, 47 + y), SCREEN)
        rect(draw, (56 + x, 43 + y, 58 + x, 47 + y), SCREEN)
    elif eye_mode == "wide":
        ellipse(draw, (32 + x, 38 + y, 45 + x, 51 + y), SCREEN, col, 1.8)
        ellipse(draw, (51 + x, 38 + y, 64 + x, 51 + y), SCREEN, col, 1.8)
        ellipse(draw, (37 + x, 43 + y, 40 + x, 46 + y), col)
        ellipse(draw, (56 + x, 43 + y, 59 + x, 46 + y), col)
    elif eye_mode == "happy":
        line(draw, [(33 + x, 47 + y), (38 + x, 42 + y), (43 + x, 47 + y)], col, 2)
        line(draw, [(53 + x, 47 + y), (58 + x, 42 + y), (63 + x, 47 + y)], col, 2)
    elif eye_mode == "heart":
        heart(draw, 38 + x, 45 + y, 1.45, PINK)
        heart(draw, 58 + x, 45 + y, 1.45, PINK)
    elif eye_mode == "glitch":
        line(draw, [(33 + x, 40 + y), (43 + x, 50 + y)], RED, 2)
        line(draw, [(43 + x, 40 + y), (33 + x, 50 + y)], RED, 2)
        line(draw, [(53 + x, 40 + y), (63 + x, 50 + y)], GLOW, 2)
        line(draw, [(63 + x, 40 + y), (53 + x, 50 + y)], GLOW, 2)
    else:
        ellipse(draw, (34 + x, 41 + y, 43 + x, 50 + y), col)
        ellipse(draw, (53 + x, 41 + y, 62 + x, 50 + y), col)

    # Mouth / terminal cursor.
    if mouth == "flat":
        line(draw, [(42 + x, 56 + y), (55 + x, 56 + y)], GLOW_DIM, 1)
    elif mouth == "tiny_smile":
        line(draw, [(43 + x, 55 + y), (48 + x, 57 + y), (53 + x, 55 + y)], GLOW_DIM, 1)
    elif mouth == "heart":
        heart(draw, 48 + x, 55 + y, 0.9, PINK)
    elif mouth == "warn":
        text5(draw, (46 + x, 53 + y), "!", WARN, scale=1)
    elif mouth == "teeth":
        rounded(draw, (39 + x, 53 + y, 57 + x, 59 + y), 1, WHITE, GLOW_DIM, 0.5)
        for xx in (43, 48, 53):
            line(draw, [(xx + x, 53.5 + y), (xx + x, 58.5 + y)], SCREEN_HI, 0.5)
    else:
        text5(draw, (42 + x, 53 + y), ">_", col, scale=0.9)

    if chest == "heart":
        heart(draw, 48 + x, 77 + y, 1.4, PINK)
    elif chest == "warn":
        text5(draw, (46 + x, 73 + y), "!", WARN, scale=1)
    elif chest == "code":
        text5(draw, (41 + x, 74 + y), "101", GLOW_DIM, scale=0.8)
    else:
        rect(draw, (44 + x, 74 + y, 52 + x, 78 + y), SCREEN_HI)
        rect(draw, (45 + x, 75 + y, 48 + x, 77 + y), GLOW_DIM)

    # Tophat. Tip is a small upward/tipped pose, not a full rotation.
    hx = x + math.sin(hat_tip) * 3
    hy = y - abs(math.sin(hat_tip)) * 4
    rounded(draw, (37 + hx, 2 + hy, 59 + hx, 20 + hy), 3, HAT_HI, None)
    rounded(draw, (40 + hx, 4 + hy, 56 + hx, 19 + hy), 2, HAT, None)
    rect(draw, (31 + hx, 17 + hy, 65 + hx, 22 + hy), HAT_HI)
    rect(draw, (34 + hx, 16 + hy, 62 + hx, 20 + hy), HAT)
    rect(draw, (40 + hx, 13 + hy, 56 + hx, 16 + hy), RIBBON)
    line(draw, [(42 + hx, 7 + hy), (53 + hx, 7 + hy)], HAT_HI, 1)

    if extras:
        extras(draw, x, y)


def finish(img):
    return img.resize((W, H), Image.Resampling.LANCZOS).convert("RGB")


def frame(**kwargs):
    im = rgba()
    draw = ImageDraw.Draw(im)
    body(draw, **kwargs)
    return finish(im)


def save_gif(name, frames, duration=120):
    OUT.mkdir(parents=True, exist_ok=True)
    pal_frames = [f.convert("P", palette=Image.ADAPTIVE, colors=64) for f in frames]
    pal_frames[0].save(
        OUT / name,
        save_all=True,
        append_images=pal_frames[1:],
        duration=duration,
        loop=0,
        optimize=False,
        disposal=1,
    )


def sleep_frames():
    out = []
    for i in range(10):
        t = i / 10
        def extras(draw, x, y, i=i):
            if i % 2 == 0:
                text5(draw, (69, 18 - (i % 5)), "Z", GLOW_DIM, scale=1)
        out.append(frame(t=t, eye_mode="closed", glow=0.35, hat_tip=-0.7, yoff=3,
                         arms="sleep", mouth="flat", extras=extras))
    return out


def idle(kind):
    out = []
    for i in range(12):
        t = i / 12
        phase = t * math.tau
        kw = dict(t=t, eye_phase=phase * 0.35, glow=0.75 + 0.25 * math.sin(phase))
        if kind == 1:
            kw.update(xoff=math.sin(phase) * 1.4, eye_phase=phase * 0.6)
        elif kind == 2:
            kw.update(hat_tip=math.sin(phase) * 0.55, arms="tip")
        elif kind == 3:
            def extras(draw, x, y, i=i):
                text5(draw, (72, 28 + (i % 4)), "1", GLOW_DIM, scale=1)
                text5(draw, (16, 31 + ((i + 2) % 4)), "0", GLOW_DIM, scale=1)
            kw.update(extras=extras, chest="code")
        elif kind == 4:
            def extras(draw, x, y, i=i):
                for n, (sx, sy) in enumerate(((20, 22), (76, 23), (14, 49), (80, 51))):
                    if (i + n) % 3 == 0:
                        spark(draw, sx, sy, 2.5, GOLD)
            kw.update(extras=extras, mouth="flat")
        elif kind == 5:
            kw.update(yoff=math.sin(phase) * 1.5, mouth="tiny_smile")
        out.append(frame(**kw))
    return out


def busy_frames():
    out = []
    for i in range(10):
        t = i / 10
        def extras(draw, x, y, i=i):
            for n in range(3):
                yy = 28 + ((i + n * 2) % 10)
                line(draw, [(6, yy), (18, yy)], GLOW_DIM if n else GLOW, 1)
                line(draw, [(78, yy + 12), (91, yy + 12)], GLOW_DIM, 1)
        out.append(frame(t=t, arms="type", chest="code", eye_mode="focus",
                         glow=0.95, yoff=1, mouth="cursor", extras=extras))
    return out


def attention_frames():
    out = []
    for i in range(8):
        pulse = 1 if i % 2 == 0 else 0
        def extras(draw, x, y, pulse=pulse):
            if pulse:
                text5(draw, (46, 7), "!", WARN, scale=1.4)
                spark(draw, 48, 24, 4, WARN)
                line(draw, [(20, 33), (9, 28)], WARN, 1)
                line(draw, [(76, 33), (87, 28)], WARN, 1)
        out.append(frame(t=i / 8, arms="alert", chest="warn", eye_mode="wide",
                         glow=1, yoff=-2 - pulse, mouth="warn", extras=extras))
    return out


def celebrate_frames():
    out = []
    for i in range(16):
        t = i / 16
        hop = -7 * math.sin(t * math.pi)
        def extras(draw, x, y, i=i):
            for n, sx in enumerate((10, 22, 34, 64, 76, 88)):
                sy = 22 + ((i * 3 + n * 7) % 42)
                spark(draw, sx, sy, 2, (GOLD, GLOW, WHITE, PINK)[n % 4])
        out.append(frame(t=t, yoff=hop, hat_tip=math.sin(t * math.pi) * 0.7, arms="tip",
                         eye_mode="happy", mouth="teeth", glow=0.95, extras=extras))
    return out


def dizzy_frames():
    out = []
    for i in range(12):
        wobble = -5 if i % 2 == 0 else 5
        def extras(draw, x, y, i=i):
            text5(draw, (18, 20 + (i % 3)), "?", WARN, scale=1)
            text5(draw, (76, 30 - (i % 3)), "?", WARN, scale=1)
        out.append(frame(t=i / 12, xoff=wobble, hat_tip=wobble / 4, eye_scale=1.35,
                         eye_mode="spiral", eye_phase=i * 1.2, glow=1,
                         mouth="flat", extras=extras))
    return out


def heart_frames():
    out = []
    for i in range(12):
        t = i / 12
        def extras(draw, x, y, i=i):
            for n, sx in enumerate((24, 72)):
                yy = 28 - ((i * 2 + n * 5) % 18)
                heart(draw, sx, yy, 1.1, PINK)
        out.append(frame(t=t, arms="heart", chest="heart", eye_mode="heart", mouth="heart",
                         glow=0.85 + 0.15 * math.sin(t * math.tau), extras=extras))
    return out


def write_manifest():
    manifest = {
        "name": "cogito",
        "colors": {
            "body": "#B2BCBF",
            "bg": "#000000",
            "text": "#FFFFFF",
            "textDim": "#808080",
            "ink": "#050607",
        },
        "states": {
            "sleep": "sleep.gif",
            "idle": [f"idle_{i}.gif" for i in range(6)],
            "busy": "busy.gif",
            "attention": "attention.gif",
            "celebrate": "celebrate.gif",
            "dizzy": "dizzy.gif",
            "heart": "heart.gif",
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def preview():
    files = ["sleep.gif"] + [f"idle_{i}.gif" for i in range(6)] + [
        "busy.gif", "attention.gif", "celebrate.gif", "dizzy.gif", "heart.gif"
    ]
    cols = 4
    label_h = 12
    rows = math.ceil(len(files) / cols)
    sheet = Image.new("RGB", (cols * W, rows * (H + label_h)), (18, 18, 18))
    draw = ImageDraw.Draw(sheet)
    for idx, name in enumerate(files):
        src = Image.open(OUT / name).convert("RGB")
        x = (idx % cols) * W
        y = (idx // cols) * (H + label_h)
        sheet.paste(src, (x, y))
        draw.text((x + 2, y + H), name, fill=(220, 220, 220))
    sheet.save(PREVIEW)


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    save_gif("sleep.gif", sleep_frames(), 140)
    for i in range(6):
        save_gif(f"idle_{i}.gif", idle(i), 120)
    save_gif("busy.gif", busy_frames(), 90)
    save_gif("attention.gif", attention_frames(), 100)
    save_gif("celebrate.gif", celebrate_frames(), 80)
    save_gif("dizzy.gif", dizzy_frames(), 80)
    save_gif("heart.gif", heart_frames(), 120)
    write_manifest()
    preview()
    total = sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())
    print(f"wrote {OUT} ({total:,} bytes)")
    print(f"preview {PREVIEW}")


if __name__ == "__main__":
    main()
