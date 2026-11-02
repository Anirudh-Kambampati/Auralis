# Soundtrack + SFX for the brag video, one piece on one grid: 120 BPM, C major, counted from frame 0.
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
import wave
from pathlib import Path

SR, DUR = 44100, 21.5
N = int(SR * DUR)
rng = np.random.default_rng(7)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
music = np.zeros((2, N)); sfx = np.zeros((2, N)); dry = np.zeros((2, N))  # dry: bass + kick stay out of the reverb


def add(buf, at, sig, gain=1.0, pan=0.0):
    i = int(round(at * SR)); sig = sig[: max(0, N - i)]
    if i >= N or len(sig) == 0: return
    buf[0, i:i + len(sig)] += sig * gain * np.sqrt((1 - pan) / 2)
    buf[1, i:i + len(sig)] += sig * gain * np.sqrt((1 + pan) / 2)


def env(n, a=0.005, decay=None, rel=0.05):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) if a > 0 else np.ones(n)
    if decay: e = e * np.exp(-t / decay)
    r = int(rel * SR)
    if r and r < n: e[-r:] *= np.linspace(1, 0, r)
    return e


def tone(m, dur, kind='sine', decay=None, a=0.005, rel=0.05, slide=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = hz(m) * (1 + slide * np.minimum(1, t / max(dur, 1e-3)))
    ph = 2 * np.pi * np.cumsum(f) / SR
    if kind == 'sine': s = np.sin(ph)
    elif kind == 'ep': s = np.sin(ph) + 0.25 * np.sin(2 * ph) * np.exp(-t / 0.15) + 0.08 * np.sin(3 * ph)
    elif kind == 'square': s = sum(np.sin(k * ph) / k for k in (1, 3, 5, 7, 9))  # soft, band-limited
    elif kind == 'tri': s = sum(((-1) ** ((k - 1) // 2)) * np.sin(k * ph) / k ** 2 for k in (1, 3, 5, 7))
    return s * env(n, a, decay, rel)


def noise(dur, lo=None, hi=None):
    s = rng.standard_normal(int(dur * SR))
    if lo: s = sosfilt(butter(2, lo, 'hp', fs=SR, output='sos'), s)
    if hi: s = sosfilt(butter(2, hi, 'lp', fs=SR, output='sos'), s)
    return s / (np.abs(s).max() + 1e-9)


# ---------- harmony ----------
CHORDS = [  # (start, voicing, bass root)
    (0, [60, 64, 67, 71], 36), (2, [57, 60, 64, 67], 33), (4, [57, 60, 64, 65], 41), (6, [55, 59, 62, 67], 43),
    (8, [60, 64, 67, 71], 36), (10, [57, 60, 64, 67], 33), (12, [57, 60, 64, 65], 41), (14, [55, 59, 62, 67], 43),
    (16, [57, 60, 64, 65], 41), (17.5, [55, 59, 62, 67], 43), (18.5, [60, 64, 67, 71, 74], 36),
]
ends = [c[0] for c in CHORDS[1:]] + [DUR]
for (st, notes, root), en in zip(CHORDS, ends):
    for m in notes:  # warm pad under everything
        add(music, st, tone(m, en - st + 0.3, 'sine', a=0.25, rel=0.4), 0.045)
    # electric-piano stabs: beat 1 and the "and" of 2 of each bar
    for off in (0, 0.75, 1.0, 1.5):
        at = st + off
        if at < min(en, 18.5):
            for m in notes: add(music, at, tone(m + 12, 0.6, 'ep', decay=0.25), 0.065 if off in (0, 1.0) else 0.04, pan=-0.2)
    # bass: half-time in the hook, full groove from the reveal at 3.0
    for off, d in ((0, 0.45), (0.75, 0.2), (1.0, 0.45), (1.5, 0.4)):
        at = st + off
        if st == 18.5:
            if off == 0: add(dry, at, tone(root, 2.5, 'tri', rel=0.4), 0.32)
        elif at < min(en, 18.5) and (at >= 3 or off in (0, 1.0)):
            add(dry, at, tone(root, d, 'tri', decay=0.4, rel=0.04), 0.32 if at >= 3 else 0.26)
add(music, 18.5, tone(84, 2.8, 'ep', decay=1.2), 0.04)

# ---------- lead melody ----------
A = [(0, 76, .5), (.5, 79, .5), (1, 81, .25), (1.25, 79, .25), (1.5, 76, .5), (2, 72, .5), (2.5, 74, .5), (3, 76, 1)]
B = [(0, 81, .5), (.5, 79, .5), (1, 76, .5), (1.5, 74, .5), (2, 74, .5), (2.5, 76, .25), (2.75, 79, .25), (3, 74, 1)]
for start, phrase, upto in ((4, B, 8), (8, A, 12), (12, B, 16), (16, B, 18.5)):
    for off, m, d in phrase:
        if start + off < upto:
            add(music, start + off, tone(m, min(d, upto - start - off) * 0.95, 'square', decay=0.35, a=0.01), 0.028, pan=0.15)

# ---------- drums (from the reveal at 3.0 to the outro at 18.5) ----------
def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(45 + 90 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.12)
def snare(): return noise(0.18, 1200, 6000) * env(int(0.18 * SR), 0.001, 0.05) * 0.7 + tone(55, 0.18, 'sine', decay=0.04) * 0.3
def hat(): return noise(0.05, 7000) * env(int(0.05 * SR), 0.001, 0.015)
b = 3.0
while b < 18.5 - 1e-6:
    pos = round((b % 2) / 0.5, 3)  # beat within the bar (0..3.75)
    if pos in (0, 1.5, 2): add(dry, b, kick(), 0.5)
    if pos in (1, 3): add(music, b, snare(), 0.12)
    add(music, b, hat(), 0.035 if pos % 1 else 0.02, pan=0.3)
    b += 0.25
add(dry, 18.5, kick(), 0.5)

# ---------- SFX, in key, on the grid ----------
def pling(m1=84, m2=91, g=1.0):  # the game's own message ping (C6 -> G6)
    return [(0, tone(m1, 0.12, 'sine', decay=0.08), g), (0.0625, tone(m2, 0.35, 'sine', decay=0.15), g)]
def play(at, parts, gain, pan=0.0):
    for off, s, g in parts: add(sfx, at + off, s, gain * g, pan)
def whoosh(at, length=0.5):  # swell into the cut at `at`
    s = noise(length, 300, 3000) * np.linspace(0, 1, int(length * SR)) ** 2
    add(sfx, at - length, s, 0.06)
def bloop(at, m=60, gain=0.12): add(sfx, at, tone(m, 0.25, 'sine', decay=0.1, slide=1.0), gain)

for k in range(1, 7): play(k * 0.5, pling(), 0.11, pan=-0.25)  # a coin per "minute"
whoosh(3.0, 0.75)
bloop(3.5, 60)
for at, m in ((4.5, 79), (5.0, 84), (5.5, 88)): add(sfx, at, tone(m, 0.18, 'sine', decay=0.07), 0.07)
whoosh(7.0); whoosh(7.25, 0.25)
bloop(8.5, 67, 0.14)
for i, m in enumerate((88, 91, 96)): add(sfx, 8.5 + 0.125 * (i + 1), tone(m, 0.2, 'sine', decay=0.08), 0.05)
whoosh(11.0)
PENT = [72, 74, 76, 79, 81, 84, 86, 88, 91]
for i in range(18): add(sfx, 11.25 + i * 0.125, tone(PENT[i % 9] - (0 if (i // 9) % 2 == 0 else 12), 0.12, 'sine', decay=0.05), 0.05, pan=((i % 6) - 2.5) / 5)
whoosh(15.0, 0.4)
bloop(15.25, 55, 0.16)
for i, m in enumerate((84, 88, 91, 96)): add(sfx, 15.25 + 0.125 * (i + 1), tone(m, 0.3, 'sine', decay=0.12), 0.05)
play(16.5, pling(), 0.09)
for i, m in enumerate((72, 76, 79)): add(sfx, 18.75 + i * 0.25, tone(m, 1.3, 'sine', decay=0.45, a=0.02), 0.11)  # the game's reward chime
add(sfx, 19.5, tone(91, 0.2, 'sine', decay=0.08), 0.05)

# ---------- one room, one mix ----------
def reverb(x, secs=1.1, seed=0):
    r = np.random.default_rng(seed); n = int(secs * SR)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR / (secs / 5)); ir /= np.abs(ir).sum() ** 0.5 * 4
    return fftconvolve(x, ir)[:N]
wet_in = music + sfx
mix = dry + music + sfx * 0.9 + np.stack([reverb(wet_in[0], seed=1), reverb(wet_in[1], seed=2)]) * 0.35
mix = sosfilt(butter(1, 30, 'hp', fs=SR, output='sos'), mix)
mix *= np.r_[np.ones(N - int(0.9 * SR)), np.linspace(1, 0, int(0.9 * SR))]
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 10 ** (-1 / 20) / np.abs(mix).max()
out = (mix.T * 32767).astype('<i2')
with wave.open(str(Path(__file__).parent / 'audio.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('peak', np.abs(mix).max(), 'rms dB', 20 * np.log10(np.sqrt((mix ** 2).mean())))
