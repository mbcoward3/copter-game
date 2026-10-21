"""Cuts the game's sounds out of real recordings (src/assets/sfx/*.mp3): seamless loops for engines and the sea, wind,
rain and fire, and short one-shots for everything else.

Sources (put in build/audio-src, which git ignores):
  BigSoundBank, CC0 (https://bigsoundbank.com/UPLOAD/mp3/NNNN.mp3, saved as bsb_NNNN.mp3): the numbers below.
  Wikimedia Commons: Propeller-plane-flying-steady-01.wav by Versatile Virtuoso, CC BY-SA 4.0
    (https://commons.wikimedia.org/wiki/File:Propeller-plane-flying-steady-01.wav), saved as commons_prop_steady.wav

    python tools/pack_audio.py
(tools/audio_scan.py prints loudness and brightness second by second, for choosing the stretches by hand.)
"""
import os

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'build', 'audio-src')
OUT = os.path.join(ROOT, 'src', 'assets', 'sfx')
SR = 44100
F = lambda n: 'bsb_%04d.mp3' % n

# ---- loops: (source, start s, end s); end None = pick the steadiest `length` seconds anywhere in it
LOOPS = {
    'heli_idle': (F(2734), 60.0, 72.0),        # turning over on the pad at full rotor speed
    'heli_fly': (F(263), 0.15, 6.25),           # close by, in flight
    'plane_low': (F(501), 0.3, 5.8),            # small piston engine, near
    'plane_high': ('commons_prop_steady.wav', 1.0, 17.0),    # cruising
    'boat_engine': (F(697), 10.0, 25.0),        # the engine, from the back deck
    'boat_water': (F(694), 55.0, 70.0),         # bow wave and spray, from the foredeck
    'sea': (F(266), 14, None),                  # small waves (14 s)
    'wind': (F(595), 16, None),
    'rain': (F(1019), 16, None),
    'fire': (F(987), 12, None),                 # a big fire in branches, crackling
}
# ---- one-shots: name: (sources, how many to take from each, longest s, shortest s). The loudest events in the recording are found and
# trimmed tight round each (a little before it starts, until it has died away), with short fades so nothing clicks.
SHOTS = {
    'splash_big': ([F(1519), F(1520), F(1521)], 1, 2.6, 1.2),
    'splash_small': ([F(1529), F(1530), F(1531)], 1, 1.4, 0.6),
    'hiss': ([F(3011)], 1, 2.5),                # steam hissing off a fire as the water hits it
    'beep': ([F(2380)], 1, 0.9),                # rescue radio: someone needs help
    'ship_horn': ([F(3507)], 1, 4.5, 3.0),           # the fishing boat's hello
    'air_horn': ([F(1832)], 1, 1.2, 0.6),            # the rescue boat's horn
    'horn': ([F(3594)], 1, 1.2, 0.6),                # the helicopter's and seaplane's horn
    'laugh': ([F(1660)], 1, 2.5, 1.8),               # two pilots bumping noses
    'chime': ([F(2079)], 1, 3.0, 2.4),               # a friend home safe
    'applause': ([F(814)], 1, 7.0, 6.0),             # mission complete
    'firework': ([F(831)], 4, 2.2, 1.2),             # bangs for the celebration
    'door': ([F(1510)], 1, 1.6),                # the cabin door sliding open
    'winch': ([F(708)], 1, 1.3),                # the hoist motor
    'gull': ([F(2573)], 3, 1.6),                # gulls taking off
    'dog': ([F(682)], 1, 1.2),
    'cat': ([F(494), F(390)], 1, 1.2),
    'chick': ([F(672)], 2, 0.8, 0.45),
    'pig': ([F(1658)], 1, 1.4, 0.7),
    'sheep': ([F(2343), F(2344)], 1, 1.4),
    'frog': ([F(819)], 2, 1.0),
}
# ---- whole files, as they are: the jingles between missions, Kenney's Music Jingles (CC0, https://kenney.nl/assets/music-jingles,
# unzipped into build/audio-src/kenney-jingles)
STEEL = 'kenney-jingles/Audio/Steel jingles/jingles_STEEL%02d.ogg'
WHOLE = {
    'jingle_start_1': STEEL % 10,      # climbs: off we go
    'jingle_done_1': STEEL % 2,        # rises and ends high: done
}
LOOP_DB, SHOT_DB = -18.0, -14.0       # every loop at one loudness and every one-shot at another; the game sets the mix
XFADE = 0.6


def read(file):
    x, sr = sf.read(os.path.join(SRC, file), always_2d=True)
    m = x.mean(axis=1)
    if sr != SR:      # (simple resampling is plenty for these)
        m = np.interp(np.arange(0, len(m) * SR / sr) * sr / SR, np.arange(len(m)), m)
    return m - m.mean()


def env_db(m, hop=441):
    n = len(m) // hop
    e = np.sqrt(np.mean(m[:n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-7
    return 20 * np.log10(e), hop


def level(seg, db, peak=0.95):
    seg = seg * 10 ** (db / 20) / (np.sqrt(np.mean(seg ** 2)) + 1e-9)
    p = np.max(np.abs(seg))
    return seg * (peak / p) if p > peak else seg


def steadiest(m, length):
    e, hop = env_db(m)
    w = int(length * SR / hop)
    best, bi = 1e9, 0
    for i in range(0, len(e) - w, 10):
        win = e[i:i + w]
        score = win.std() - 0.05 * win.mean()            # steady, and not the quietest stretch
        if score < best: best, bi = score, i
    return bi * hop / SR


def write(name, seg, kind):
    path = os.path.join(OUT, name + '.mp3')
    sf.write(path, seg.astype(np.float32), SR, format='MP3', compression_level=0.45)
    clip = np.mean(np.abs(seg) > 0.99) * 100
    print('%-6s %-14s %5.2f s %4d KB%s' % (kind, name, len(seg) / SR, os.path.getsize(path) // 1024, '  CLIPPED %.2f%%' % clip if clip > 0.01 else ''))


def make_loop(name, file, a, b):
    m = read(file)
    if b is None:
        length = a
        a = steadiest(m, length + XFADE)
        b = a + length + XFADE
    seg = m[int(a * SR):int(b * SR)]
    n = int(XFADE * SR)
    t = np.linspace(0, np.pi / 2, n)
    body = seg[:-n].copy()
    body[:n] = seg[:n] * np.sin(t) + seg[-n:] * np.cos(t)          # equal-power: the tail fades out over the head
    write(name, level(body, LOOP_DB), 'loop')


def events(m, count, longest, shortest):
    """The `count` loudest separate events: each from just before it rises to where it has died away."""
    e, hop = env_db(m)
    taken, out = np.zeros(len(e), bool), []
    for _ in range(count):
        cand = np.where(taken, -999, e)
        p = int(np.argmax(cand))
        if cand[p] < -60: break
        floor = max(e[p] - 32, np.percentile(e, 10) + 3)
        s = p
        while s > 0 and e[s - 1] > floor and (p - s) * hop < 0.4 * SR: s -= 1
        s = max(0, s - 2)
        # (to the last moment it is still above the floor, not the first dip: splashes and applause come in bursts)
        lim = min(len(e) - 1, s + int(longest * SR / hop))
        above = np.where(e[p:lim + 1] > floor)[0]
        t = p + (int(above[-1]) if len(above) else 0)
        t = min(lim, max(t, s + int(shortest * SR / hop)))
        taken[max(0, s - 20):t + 20] = True
        out.append((s * hop, (t + 1) * hop))
    return sorted(out)


def make_shots(name, files, count, longest, shortest=0.3):
    k = 0
    for file in files:
        m = read(file)
        for a, b in events(m, count, longest, min(shortest, longest)):
            seg = m[a:b].copy()
            fi, fo = int(0.004 * SR), min(int(0.12 * SR), len(seg) // 3)
            seg[:fi] *= np.linspace(0, 1, fi)
            seg[-fo:] *= np.linspace(1, 0, fo) ** 1.5
            k += 1
            write('%s_%d' % (name, k), level(seg, SHOT_DB), 'shot')


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))
for k, v in LOOPS.items():
    make_loop(k, *v)
for k, v in SHOTS.items():
    make_shots(k, *v)
for k, v in WHOLE.items():
    m = read(v)
    fo = int(0.05 * SR)
    m[-fo:] *= np.linspace(1, 0, fo)
    write(k, level(m, SHOT_DB), 'whole')
