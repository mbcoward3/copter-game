"""Prints how loud and how bright each recording is, second by second, to find the steady stretches worth looping.

    python tools/audio_scan.py build/audio-src/*.mp3
"""
import sys

import numpy as np
import soundfile as sf

STEP = 1.0
for path in sys.argv[1:]:
    x, sr = sf.read(path, always_2d=True)
    mono = x.mean(axis=1)
    print('== %s  %.1f s  %d Hz' % (path, len(mono) / sr, sr))
    n = int(STEP * sr)
    rows = []
    for i in range(0, len(mono) - n, n):
        seg = mono[i:i + n]
        rms = np.sqrt(np.mean(seg ** 2)) + 1e-9
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
        f = np.fft.rfftfreq(len(seg), 1 / sr)
        cen = (spec * f).sum() / (spec.sum() + 1e-9)
        # strongest low-frequency line (blade rate, prop rate, engine firing): 8..120 Hz of the loudness envelope
        env = np.abs(seg)
        env = env.reshape(-1, 48)[:, :].mean(axis=1) if len(env) % 48 == 0 else env[: len(env) // 48 * 48].reshape(-1, 48).mean(axis=1)
        es = np.abs(np.fft.rfft(env - env.mean()))
        ef = np.fft.rfftfreq(len(env), 48 / sr)
        band = (ef > 6) & (ef < 120)
        beat = ef[band][np.argmax(es[band])] if band.any() else 0
        rows.append('%4d %5.1fdB %5dHz %5.1fHz' % (i // n, 20 * np.log10(rms), cen, beat))
    for k in range(0, len(rows), 4):
        print('   ' + ' | '.join(rows[k:k + 4]))
