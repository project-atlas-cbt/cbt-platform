"""The tour video's soundtrack: quiet digital realism, made only from filtered noise.

Sound rule (product owner, 2026-10-06/07): never music, musical instruments, melodies, chords,
beats, chimes or pitched notification tones. Nothing here uses an oscillator. Every sound is a
short burst of noise shaped by a wide band filter and an envelope, so none has a pitch to hear.

Hierarchy, loudest first: a few system events (a deeper "tuk", the publish "final"), then the
everyday interface (a dry "tik", ticks, small state changes), then the near-silent room bed.
Cursor movement on its own is silent.
"""
import numpy as np

SR = 48000
rng = np.random.default_rng(11)


def _env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def _band(x, lo, hi):
    """Wide band-pass in the frequency domain (keep bands an octave or more: narrow ones ring)."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * g, len(x))


def _burst(dur, lo, hi, attack, decay, peak):
    n = int(dur * SR)
    v = _band(rng.standard_normal(n), lo, hi) * _env(n, attack, decay)
    return v / (np.max(np.abs(v)) or 1) * peak


def _at(*parts):
    """Lay (offset seconds, samples) parts into one sound."""
    n = max(int(o * SR) + len(p) for o, p in parts)
    out = np.zeros(n)
    for o, p in parts:
        k = int(o * SR)
        out[k:k + len(p)] += p
    return out


def _grains(dur, density, lo, hi, peak, rise=False):
    """Sparse granular texture: tiny noise grains at random moments (the 'data' sound)."""
    n = int(dur * SR)
    out = np.zeros(n)
    t = rng.uniform(0, 0.03)
    while t < dur:
        g = _burst(rng.uniform(0.003, 0.008), lo, hi, 0.0005, 0.0018, peak * rng.uniform(0.35, 1))
        k = int(t * SR)
        out[k:k + len(g)] += g[: max(0, n - k)]
        d = density * (0.4 + 1.2 * t / dur) if rise else density
        t += rng.exponential(1 / d)
    fade = np.minimum(1, np.minimum(np.arange(n) / (0.12 * SR), (n - np.arange(n)) / (0.15 * SR)))
    return out * np.clip(fade, 0, 1)


def hover():  # the cursor arrives on an important control
    return _burst(0.012, 2500, 9000, 0.0004, 0.0016, 0.018)


def tik():  # an ordinary click: short and dry
    return _at((0, _burst(0.02, 1800, 7000, 0.0004, 0.0024, 0.045)),
               (0, _burst(0.03, 180, 900, 0.001, 0.005, 0.02)))


def tuk():  # an important action: a little deeper and firmer
    return _at((0, _burst(0.015, 2000, 7000, 0.0004, 0.0018, 0.03)),
               (0.001, _burst(0.07, 90, 600, 0.0015, 0.014, 0.085)))


def zoom():  # a breath of air while the view moves, then a small arrival tick
    n = int(0.22 * SR)
    air = _band(rng.standard_normal(n), 500, 3500) * np.sin(np.linspace(0, np.pi, n)) ** 2
    air = air / (np.max(np.abs(air)) or 1) * 0.012
    return _at((0, air), (0.24, _burst(0.01, 2500, 8000, 0.0004, 0.0014, 0.012)))


def state():  # a screen or state changes: two tiny digital grains
    return _at((0, _burst(0.008, 2500, 9000, 0.0003, 0.0012, 0.022)),
               (0.035, _burst(0.008, 2000, 8000, 0.0003, 0.0012, 0.016)))


def confirm():  # something succeeded: a soft tuk and a short settle
    return _at((0, _burst(0.05, 120, 900, 0.0015, 0.010, 0.05)),
               (0, _burst(0.012, 2000, 7000, 0.0004, 0.0016, 0.018)),
               (0.03, _burst(0.16, 150, 1500, 0.02, 0.05, 0.01)))


def drop():  # a file placed on the drop zone
    return _at((0, _burst(0.05, 100, 700, 0.002, 0.012, 0.05)),
               (0.012, _burst(0.012, 2000, 7000, 0.0004, 0.0016, 0.016)))


def interrupt():  # the network drops: a small muted stutter, a change of state, not an alarm
    return _at(*[(i * 0.045, _burst(0.02, 400, 2500, 0.001, 0.006, 0.03 * (1 - i * 0.25))) for i in range(3)])


def sync():  # the network returns: grains gathering, then one tactile tick
    return _at((0, _grains(0.7, 34, 2500, 9000, 0.012, rise=True)),
               (0.72, _burst(0.012, 2000, 7000, 0.0004, 0.0018, 0.03)))


def settle():  # a paper is in: a soft low settle
    return _burst(0.25, 100, 900, 0.02, 0.07, 0.02)


def final():  # results published: firm but restrained
    return _at((0, _burst(0.09, 70, 500, 0.0015, 0.02, 0.1)),
               (0, _burst(0.015, 2000, 7000, 0.0004, 0.0018, 0.028)),
               (0.05, _burst(0.3, 100, 1000, 0.03, 0.08, 0.012)))


POINT = {
    'hover': hover, 'tik': tik, 'click': tik, 'tuk': tuk, 'zoom': zoom, 'state': state,
    'confirm': confirm, 'drop': drop, 'interrupt': interrupt, 'sync': sync,
    'settle': settle, 'final': final,
}


# --- recorded set -------------------------------------------------------------------------------
# Real recordings (CC0, see sounds/README.md) instead of synthesised sounds. Chosen by the product
# owner (2026-10-12): the click is a plain mouse click; moments after an action get a soft
# recorded confirmation. SOUND_SET=synth keeps the synthesised set above.
import os
import wave

_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sounds')


def _load(name):
    with wave.open(os.path.join(_DIR, name + '.wav')) as w:
        return np.frombuffer(w.readframes(w.getnframes()), '<i2') / 32768.0


def _rec_set():
    click, page, thunk = _load('click'), _load('page'), _load('thunk')
    on, off = _load('switch-on'), _load('switch-off')
    quiet = lambda: np.zeros(1)
    return {
        'hover': quiet, 'zoom': quiet, 'settle': lambda: thunk * 0.04,
        'tik': lambda: click * 0.12, 'click': lambda: click * 0.12,
        'tuk': lambda: _at((0, click * 0.16), (0.012, thunk * 0.08)),
        'confirm': lambda: _at((0.1, thunk * 0.07)),
        'drop': lambda: page * 0.10,
        'state': lambda: on * 0.06,
        'interrupt': lambda: off * 0.10,
        'sync': lambda: _at((0, on * 0.10), (0.25, click * 0.06)),
        'final': lambda: _at((0, click * 0.16), (0.012, thunk * 0.14)),
    }


RECORDED = os.environ.get('SOUND_SET') != 'synth' and os.path.isdir(_DIR)
if RECORDED:
    POINT = _rec_set()


def room(n, sections, dips):
    """The bed: broadband computer-room air, very low, a little different in each section.

    sections: (start, end) seconds of each part of the cut; each gets its own noise and a
    slightly different colour, crossfaded at the joins so no single loop runs throughout.
    dips: (start, end) seconds where the room drops back and dulls (the network outage).
    """
    t = np.arange(n) / SR
    bed = np.zeros(n)
    xf = 0.6
    for i, (a, b) in enumerate(sections):
        lo, hi = 60 + 15 * (i % 3), 6000 + 1500 * ((i * 7) % 3)
        k0, k1 = max(0, int((a - xf) * SR)), min(n, int((b + xf) * SR))
        seg = _band(rng.standard_normal(k1 - k0), lo, hi)
        # pink-ish tilt, so it reads as air rather than hiss
        spec = np.fft.rfft(seg)
        f = np.fft.rfftfreq(len(seg), 1 / SR)
        seg = np.fft.irfft(spec / np.sqrt(np.maximum(f, 40) / 40), len(seg))
        seg /= np.sqrt(np.mean(seg ** 2)) or 1
        seg *= 10 ** (((i * 5) % 3 - 1) * 1.0 / 20)  # within a dB or so of each other
        w = np.ones(k1 - k0)
        ramp = int(xf * SR)
        if a > 0:
            w[:ramp] = np.sin(np.linspace(0, np.pi / 2, ramp)) ** 2
        if b < t[-1]:
            w[-ramp:] = np.cos(np.linspace(0, np.pi / 2, ramp)) ** 2
        bed[k0:k1] += seg * w
    gain = np.full(n, 0.0095)
    for a, b in dips:
        k0, k1 = int(a * SR), int(b * SR)
        r = int(0.25 * SR)
        g = np.ones(n)
        g[k0:k1] = 0.5
        g[k0:k0 + r] = np.linspace(1, 0.5, r)
        g[k1:k1 + r] = np.linspace(0.5, 1, r)
        gain *= g
    return bed * gain


# measured on the finished mix: the room near -40 dBFS, everyday clicks near -20, the
# publish 'final' and the deeper 'tuk' near -16
UI_GAIN = 1.6


def mix(total, points, spans, sections, dips, intro, outro, bed=None):
    """points: (t, name); spans: (start, end) of the 'data' texture; intro/outro: card lengths.

    bed: optional recorded background (mono samples at SR, already at its final level) used in
    place of the synthesised room tone; it dips with the network outage like the room does.
    """
    n = int(total * SR)
    if bed is None:
        out = room(n, sections, dips)
    else:
        out = np.resize(bed, n).astype(float)
        g = np.ones(n)
        for a, b in dips:
            k0, k1, r = int(a * SR), int(b * SR), int(0.25 * SR)
            g[k0:k1] = 0.5
            g[k0:k0 + r] = np.linspace(1, 0.5, r)
            g[k1:k1 + r] = np.linspace(0.5, 1, r)
        out *= g
    t = np.arange(n) / SR
    # near silence under the title; the room settles in as the product appears, and leaves
    # under the closing card so the logo and address sit in almost nothing
    out *= np.clip(0.15 + 0.85 * (t - intro + 0.8) / 1.6, 0.15, 1)
    out *= np.clip((total - 1.4 - t) / max(outro - 1.4, 0.5), 0, 1)
    for a, b in ([] if RECORDED else spans):
        g = _grains(max(0.2, b - a), 26, 2500, 9000, 0.011)
        k = int(a * SR)
        out[k:k + len(g)] += g[: max(0, n - k)]
    for st, name in points:
        snd = POINT[name]() * (1.0 if RECORDED else UI_GAIN)
        k = int(st * SR)
        if 0 <= k < n:
            out[k:k + len(snd)] += snd[: n - k]
    return out
