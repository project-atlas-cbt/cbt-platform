"""Composes the tour video from recorded scenes (see README.md beside this file).

Each scene folder (from record-teaser.mjs) holds screencast JPEGs and meta.json: frame
timestamps plus a timeline of cursor moves, clicks, keys, zooms, captions and sounds. This
draws the cursor and click marks, applies the gentle zoom, lays captions over the picture,
adds the soundtrack (sound.py) and encodes one MP4.

The sound comes from sound.py, which follows the product owner's rule: no music, no
instruments, nothing pitched.
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

# --- sound: see sound.py ---------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sound  # noqa: E402

# --- segments ----------------------------------------------------------------------
class Card:
    def __init__(self, png, dur):
        self.img = Image.open(png).convert('RGB').resize((W, H), Image.LANCZOS)
        self.dur = dur
        self.sounds = []
        self.spans = []
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
        # 'skip' pairs cut a wait (a background job) out of the scene's own time
        skips, open_at = [], None
        for e in ev:
            if e['kind'] == 'skip':
                if e['on']:
                    open_at = e['t']
                elif open_at is not None:
                    skips.append((open_at, e['t']))
                    open_at = None
        def warp(x):
            cut = 0.0
            for a, b in skips:
                if x >= b:
                    cut += b - a
                elif x > a:
                    return a - cut
            return x - cut
        for e in ev:
            e['t'] = warp(e['t'])
        self.ft = np.array([warp(x) for x in self.ft])
        self.dur -= sum(b - a for a, b in skips)
        self.ev = ev
        self.moves = [e for e in ev if e['kind'] == 'move']
        self.clicks = [e for e in ev if e['kind'] == 'click']
        self.zooms = [e for e in ev if e['kind'] == 'zoom']
        drags = [e for e in ev if e['kind'] == 'drag']
        drops = [e for e in ev if e['kind'] == 'drop']
        self.drag = (drags[0]['t'], drops[0]['t']) if drags and drops else None
        start = next(e for e in ev if e['kind'] == 'cursor')
        self.c0 = (start['x'], start['y'])
        # interface sounds: a click's own sound, explicit cues, and a breath of air for each
        # zoom in; plain cursor movement stays silent
        self.sounds = [(e['t'], e.get('sound') or 'tik') for e in self.clicks]
        self.sounds += [(e['t'], e['name']) for e in ev if e['kind'] == 'sound']
        scale = 1.0
        for z in self.zooms:
            if z['scale'] > scale + 0.05:
                self.sounds.append((z['t'], 'zoom'))
            scale = z['scale']
        self.sounds = [x for x in self.sounds if x[1] in sound.POINT]
        self.spans, opened = [], None
        for e in ev:
            if e['kind'] == 'span':
                if e['on']:
                    opened = e['t']
                elif opened is not None:
                    self.spans.append((opened, e['t']))
                    opened = None
        caps, cur = [], None
        for e in ev:
            if e['kind'] != 'caption':
                continue
            if cur:
                cur[2] = e['t']
                caps.append(cur)
                cur = None
            if e['text']:
                cur = [e['text'], max(0.0, e['t']), None, e.get('place', 'bottom')]
        if cur:
            cur[2] = self.dur
            caps.append(cur)
        self.captions = [tuple(c) for c in caps]

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
        if self.drag:
            a, b = self.drag
            if a <= t <= b + 0.25:
                k = 1.0 if t <= b else 1 - ease_out((t - b) / 0.25)  # shrinks into the drop
                chip = CHIP if k == 1.0 else CHIP.resize((max(1, int(CHIP.width * k)), max(1, int(CHIP.height * k))), Image.LANCZOS)
                if k < 1:
                    chip.putalpha(chip.getchannel('A').point(lambda v: int(v * k)))
                if t < a + 0.25:
                    chip = chip.copy()
                    chip.putalpha(chip.getchannel('A').point(lambda v, q=(t - a) / 0.25: int(v * q)))
                out.alpha_composite(chip, (int(px + 14 * k), int(py + 22 * k)))
        cur = CURSOR if press == 1.0 else CURSOR.resize((int(CURSOR.width * press), int(CURSOR.height * press)), Image.LANCZOS)
        out.alpha_composite(cur, (int(px - CURSOR_PAD * press), int(py - CURSOR_PAD * press)))
        return out.convert('RGB')

# --- captions (rendered PNGs, one per text) ---------------------------------------
_chip = Image.open(os.path.join(CARDS, 'file-chip.png')).convert('RGBA')
CHIP = _chip.crop(_chip.getchannel('A').getbbox())
CAPMAP = json.load(open(os.path.join(CARDS, 'captions.json')))
_capcache = {}
def caption_img(text):
    if text not in _capcache:
        _capcache[text] = Image.open(os.path.join(CARDS, CAPMAP[text])).convert('RGBA')
    return _capcache[text]

def apply_caption(frame, seg, t):
    for text, a, b, place in seg.captions:
        if a - 0.01 <= t <= b:
            alpha = min(1, (t - a) / 0.25, (b - t) / 0.25)
            if alpha <= 0:
                continue
            im = caption_img(text)
            if alpha < 1:
                im = im.copy()
                im.putalpha(im.getchannel('A').point(lambda v: int(v * alpha)))
            base = frame.convert('RGBA')
            # cards draw the caption at the foot; a head caption is the same image raised
            bbox = im.getchannel('A').getbbox()
            if place == 'top' and bbox:
                im = im.crop(bbox)
                base.alpha_composite(im, (bbox[0], 56))
            else:
                base.alpha_composite(im)
            frame = base.convert('RGB')
    return frame

# --- the cut -----------------------------------------------------------------------
PLAN = [
    ('card', 'title', 3.2),
    ('scene', 'import', 0.2, 0.2),
    ('scene', 'qimport', 0.2, 0.1),
    ('scene', 'qsubmit', 0.2, 0.1),
    ('scene', 'review', 0.2, 0.2),
    ('scene', 'control', 0.2, 0.1),
    ('scene', 'exam', 0.2, 0.1),
    ('scene', 'offline', 0.0, 0.1),
    ('scene', 'submit', 0.0, 0.2),
    ('scene', 'resultdetail', 0.2, 0.2),
    ('scene', 'results', 0.2, 0.2),
    ('scene', 'myresult', 0.2, 0.2),
    ('card', 'end', 4.0),
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
# AUDIO_ONLY=1 remixes the sound over the last rendered picture, for quick sound passes
AUDIO_ONLY = bool(os.environ.get('AUDIO_ONLY')) and os.path.exists(VIDEO_ONLY)
ff = None if AUDIO_ONLY else subprocess.Popen(
    ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS),
     '-i', '-', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', VIDEO_ONLY],
    stdin=subprocess.PIPE)
white = Image.new('RGB', (W, H), (255, 255, 255))
points, spans, sections = [], [], []
offset = 0.0
for seg in segs:
    n = int(round(seg.dur * FPS))
    for i in range(0 if AUDIO_ONLY else n):
        t = i / FPS
        f = seg.frame(t)
        f = apply_caption(f, seg, t)
        # the first frame is the thumbnail, so the title card opens fully on its own colour
        fade = min(1, (seg.dur - t) / FADE) if seg is segs[0] else min(1, t / FADE, (seg.dur - t) / FADE)
        if fade < 1:
            f = Image.blend(white, f, max(0, fade))
        ff.stdin.write(f.tobytes())
    points += [(offset + st, name) for st, name in seg.sounds if 0 <= st < seg.dur]
    spans += [(offset + a, offset + min(b, seg.dur)) for a, b in seg.spans]
    sections.append((offset, offset + n / FPS))
    offset += n / FPS
    print('segment', getattr(seg, 'dir', 'card'), f'{seg.dur:.1f}s', file=sys.stderr)
if ff:
    ff.stdin.close(); ff.wait()

# the room drops back while the network is out: from the interruption to the reconnection
drops = [t for t, nm in points if nm == 'interrupt']
backs = [t for t, nm in points if nm == 'sync']
dips = [(a, min([b for b in backs if b > a] or [a + 3])) for a in drops]
intro = segs[0].dur if isinstance(segs[0], Card) else 0.0
outro = segs[-1].dur if isinstance(segs[-1], Card) else 0.0
# BED=<audio file>[:start-seconds] swaps the synthesised room tone for a recorded background,
# placed well under the interface sounds (BED_DB is its RMS level in dBFS, default -36)
bed = None
if os.environ.get('BED'):
    path, _, start = os.environ['BED'].partition(':')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', start or '0', '-t', str(offset + 2), '-i', path,
                          '-ac', '1', '-ar', str(SR), '-af', 'highpass=f=70', '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    bed = np.frombuffer(raw, '<i2') / 32768
    # nature recordings have sharp snaps and calls; squash anything much above the average so
    # nothing in the bed can ever stand out against the interface sounds
    rms = np.sqrt(np.mean(bed ** 2)) or 1
    ceiling = 2.5 * rms
    bed = ceiling * np.tanh(bed / ceiling)
    bed = bed * 10 ** (float(os.environ.get('BED_DB', -36)) / 20) / (np.sqrt(np.mean(bed ** 2)) or 1)
audio = sound.mix(offset, points, spans, sections, dips, intro, outro, bed)
peak = np.max(np.abs(audio)) or 1
if peak > 0.9:
    audio *= 0.9 / peak
with wave.open(SOUNDS_WAV, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((audio * 32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', VIDEO_ONLY, '-i', SOUNDS_WAV,
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', OUT], check=True)
print('total', round(offset, 1), 's ->', OUT)
