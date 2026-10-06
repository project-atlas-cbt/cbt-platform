"""Composes the tour video from recorded scenes (see README.md beside this file).

Each scene folder (from record-teaser.mjs) holds screencast JPEGs and meta.json: frame
timestamps plus a timeline of cursor moves, clicks, keys, zooms, captions and sounds. This
draws the cursor and click marks, applies the gentle zoom, lays captions over the picture,
synthesises the interface sounds (no music) and encodes one MP4.
"""
import json, math, os, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import tempfile
WORK = os.path.join(tempfile.gettempdir(), 'examkeep-tour')
REC = os.environ.get('REC', os.path.join(WORK, 'rec'))
CARDS = os.environ.get('CARDS', os.path.join(WORK, 'cards'))
OUT = os.environ.get('OUTFILE', os.path.join(WORK, 'examkeep-tour-master.mp4'))
os.makedirs(WORK, exist_ok=True)
VIDEO_ONLY = os.path.join(WORK, 'video-only.mp4')
SOUNDS_WAV = os.path.join(WORK, 'sounds.wav')
W, H, FPS, SR = 1920, 1080, 30, 48000
BLUE = (29, 78, 216)
FADE = 0.22  # dip to white between segments

def ease(x):
    x = min(1.0, max(0.0, x))
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2

def ease_out(x):
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3

# --- cursor sprite: a classic arrow, drawn large and downsampled for clean edges ---
def make_cursor(h=36):
    s = 8
    pts = [(0, 0), (0, 25), (6.2, 19.4), (10.4, 29), (14.2, 27.4), (10.2, 18), (18, 18)]
    k = h / 29.0 * s
    pad = 3 * s
    size = (int(18 * k + pad * 2), int(29 * k + pad * 2))
    poly = [(pad + x * k, pad + y * k) for x, y in pts]
    shadow = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon([(x + 1.2 * s, y + 2.2 * s) for x, y in poly], fill=(0, 0, 0, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(2.0 * s))
    arrow = Image.new('RGBA', size, (0, 0, 0, 0))
    ImageDraw.Draw(arrow).polygon(poly, fill=(17, 19, 24, 255), outline=(255, 255, 255, 255), width=int(1.6 * s))
    img = Image.alpha_composite(shadow, arrow)
    return img.resize((size[0] // s, size[1] // s), Image.LANCZOS), pad // s

CURSOR, CURSOR_PAD = make_cursor()

# --- sounds, synthesised so nothing is downloaded ----------------------------------
rng = np.random.default_rng(7)

def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)

def s_click():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # band-limited tick: differentiate noise (high-pass) and smooth it (low-pass)
    hp = np.diff(noise, prepend=0)
    lp = np.convolve(hp, np.ones(6) / 6, mode='same')
    body = np.sin(2 * np.pi * 1650 * t) * env(n, 0.0005, 0.006)
    thump = np.sin(2 * np.pi * 180 * t) * env(n, 0.001, 0.012) * 0.6
    return (lp * env(n, 0.0003, 0.004) * 0.7 + body * 0.5 + thump) * 0.32

def s_key():
    n = int(0.035 * SR)
    t = np.arange(n) / SR
    f = 2300 + rng.uniform(-350, 350)
    noise = np.convolve(np.diff(rng.standard_normal(n), prepend=0), np.ones(4) / 4, mode='same')
    return (noise * env(n, 0.0003, 0.003) * 0.6 + np.sin(2 * np.pi * f * t) * env(n, 0.0003, 0.004) * 0.35) * 0.16

def tone(freqs, dur, gap, decay, gain):
    total = int((dur + gap * len(freqs)) * SR)
    out = np.zeros(total)
    for i, f in enumerate(freqs):
        n = int(dur * SR)
        t = np.arange(n) / SR
        v = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t))
        v *= env(n, 0.004, decay)
        st = int(i * gap * SR)
        out[st:st + n] += v
    return out * gain

SOUNDS = {
    'click': s_click,
    'key': s_key,
    'success': lambda: tone([880.0, 1318.5], 0.9, 0.09, 0.28, 0.10),
    'offline': lambda: tone([659.3, 493.9], 0.6, 0.12, 0.18, 0.08),
    'online': lambda: tone([493.9, 659.3, 987.8], 0.7, 0.09, 0.22, 0.08),
}

# --- segments ----------------------------------------------------------------------
class Card:
    def __init__(self, png, dur):
        self.img = Image.open(png).convert('RGB').resize((W, H), Image.LANCZOS)
        self.dur = dur
        self.sounds = []
        self.captions = []
    def frame(self, t):
        return self.img.copy()

class SceneSeg:
    def __init__(self, name, head=0.0, tail=0.0):
        d = os.path.join(REC, name)
        m = json.load(open(os.path.join(d, 'meta.json')))
        self.dir, self.m = d, m
        self.dsf = m['dsf']
        self.t0 = m['t0'] + head
        self.dur = (m['t1'] - m['t0']) - head - tail
        frames = sorted(m['frames'], key=lambda f: f['t'])
        self.ft = np.array([f['t'] - self.t0 for f in frames])
        self.fi = [f['i'] for f in frames]
        self.cache = (None, None)
        first = Image.open(os.path.join(d, f"{self.fi[0]}.jpg"))
        self.SW, self.SH = first.size
        ev = sorted(m['events'], key=lambda e: e['t'])
        for e in ev:
            e['t'] -= self.t0
        self.ev = ev
        self.moves = [e for e in ev if e['kind'] == 'move']
        self.clicks = [e for e in ev if e['kind'] == 'click']
        self.zooms = [e for e in ev if e['kind'] == 'zoom']
        start = next(e for e in ev if e['kind'] == 'cursor')
        self.c0 = (start['x'], start['y'])
        self.sounds = [(e['t'], e.get('sound', 'click')) for e in self.clicks if e.get('sound')]
        self.sounds += [(e['t'], 'key') for e in ev if e['kind'] == 'key']
        self.sounds += [(e['t'], e['name']) for e in ev if e['kind'] == 'sound']
        caps, cur = [], None
        for e in ev:
            if e['kind'] != 'caption':
                continue
            if cur:
                cur[2] = e['t']
                caps.append(cur)
                cur = None
            if e['text']:
                cur = [e['text'], max(0.0, e['t']), None]
        if cur:
            cur[2] = self.dur
            caps.append(cur)
        self.captions = [(txt, a, b) for txt, a, b in caps]

    def src(self, t):
        k = int(np.searchsorted(self.ft, t, side='right')) - 1
        k = max(0, k)
        if self.cache[0] != k:
            self.cache = (k, Image.open(os.path.join(self.dir, f"{self.fi[k]}.jpg")).convert('RGB'))
        return self.cache[1]

    def cursor(self, t):
        x, y = self.c0
        for mv in self.moves:
            if t < mv['t']:
                break
            k = ease((t - mv['t']) / mv['dur']) if mv['dur'] > 0 else 1
            x = mv['x0'] + (mv['x1'] - mv['x0']) * k
            y = mv['y0'] + (mv['y1'] - mv['y0']) * k
        return x, y

    def view(self, t):
        """Zoom state as (centre x, centre y, scale) in CSS pixels."""
        cx, cy, s = self.m['vw'] / 2, self.m['vh'] / 2, 1.0
        for z in self.zooms:
            if t < z['t']:
                break
            k = ease((t - z['t']) / z['dur'])
            cx, cy, s = cx + (z['cx'] - cx) * k, cy + (z['cy'] - cy) * k, s + (z['scale'] - s) * k
        return cx, cy, s

    def frame(self, t):
        img = self.src(t)
        vw, vh = self.m['vw'], self.m['vh']
        cx, cy, s = self.view(t)
        cw, ch = vw / s, vh / s
        x0 = min(max(cx - cw / 2, 0), vw - cw)
        y0 = min(max(cy - ch / 2, 0), vh - ch)
        sx, sy = self.SW / vw, self.SH / vh
        out = img.resize((W, H), Image.LANCZOS, box=(x0 * sx, y0 * sy, (x0 + cw) * sx, (y0 + ch) * sy))
        k = W / cw  # output px per CSS px

        def to_out(px, py):
            return (px - x0) * k, (py - y0) * k

        ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        # click marks: a soft blue disc that swells and fades, with a crisp ring
        for c in self.clicks:
            a = t - c['t']
            if 0 <= a <= 0.55:
                p = a / 0.55
                ox, oy = to_out(c['x'], c['y'])
                r = 16 + 30 * ease_out(p)
                d.ellipse((ox - r, oy - r, ox + r, oy + r), fill=BLUE + (int(70 * (1 - p)),))
                d.ellipse((ox - r, oy - r, ox + r, oy + r), outline=BLUE + (int(200 * (1 - p)),), width=3)
        out = out.convert('RGBA')
        out.alpha_composite(ov)
        # cursor, pressed slightly while a click lands
        px, py = to_out(*self.cursor(t))
        press = 1.0
        for c in self.clicks:
            a = t - c['t']
            if 0 <= a <= 0.16:
                press = 0.86 + 0.14 * abs(a - 0.08) / 0.08
        cur = CURSOR if press == 1.0 else CURSOR.resize((int(CURSOR.width * press), int(CURSOR.height * press)), Image.LANCZOS)
        out.alpha_composite(cur, (int(px - CURSOR_PAD * press), int(py - CURSOR_PAD * press)))
        return out.convert('RGB')

# --- captions (rendered PNGs, one per text) ---------------------------------------
CAPMAP = json.load(open(os.path.join(CARDS, 'captions.json')))
_capcache = {}
def caption_img(text):
    if text not in _capcache:
        _capcache[text] = Image.open(os.path.join(CARDS, CAPMAP[text])).convert('RGBA')
    return _capcache[text]

def apply_caption(frame, seg, t):
    for text, a, b in seg.captions:
        if a - 0.01 <= t <= b:
            alpha = min(1, (t - a) / 0.25, (b - t) / 0.25)
            if alpha <= 0:
                continue
            im = caption_img(text)
            if alpha < 1:
                im = im.copy()
                im.putalpha(im.getchannel('A').point(lambda v: int(v * alpha)))
            base = frame.convert('RGBA')
            base.alpha_composite(im)
            frame = base.convert('RGB')
    return frame

# --- the cut -----------------------------------------------------------------------
PLAN = [
    ('card', 'title', 3.6),
    ('scene', 'review', 0.2, 0.2),
    ('scene', 'control', 0.2, 0.1),
    ('scene', 'signin', 0.2, 0.1),
    ('scene', 'exam', 0.2, 0.1),
    ('scene', 'offline', 0.0, 0.1),
    ('scene', 'submit', 0.0, 0.2),
    ('scene', 'results', 0.2, 0.2),
    ('card', 'end', 4.6),
]
only = os.environ.get('ONLY')
segs = []
for item in PLAN:
    if only and item[1] not in only.split(','):
        continue
    if item[0] == 'card':
        segs.append(Card(os.path.join(CARDS, f'{item[1]}.png'), item[2]))
    else:
        segs.append(SceneSeg(item[1], item[2], item[3]))

total = sum(s.dur for s in segs)
audio = np.zeros(int((total + 1) * SR))
ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                       '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p',
                       VIDEO_ONLY], stdin=subprocess.PIPE)
white = Image.new('RGB', (W, H), (255, 255, 255))
offset = 0.0
for seg in segs:
    n = int(round(seg.dur * FPS))
    for i in range(n):
        t = i / FPS
        f = seg.frame(t)
        f = apply_caption(f, seg, t)
        fade = min(1, t / FADE, (seg.dur - t) / FADE)
        if fade < 1:
            f = Image.blend(white, f, max(0, fade))
        ff.stdin.write(f.tobytes())
    for st, name in seg.sounds:
        if 0 <= st < seg.dur:
            snd = SOUNDS[name]()
            a = int((offset + st) * SR)
            audio[a:a + len(snd)] += snd[: max(0, len(audio) - a)]
    offset += n / FPS
    print('segment', getattr(seg, 'dir', 'card'), f'{seg.dur:.1f}s', file=sys.stderr)
ff.stdin.close(); ff.wait()

audio = audio[: int(offset * SR)]
peak = np.max(np.abs(audio)) or 1
if peak > 0.9:
    audio *= 0.9 / peak
with wave.open(SOUNDS_WAV, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((audio * 32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', VIDEO_ONLY, '-i', SOUNDS_WAV,
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', OUT], check=True)
print('total', round(offset, 1), 's ->', OUT)
