"""Generate two tiny, original wooden-fish WAV effects with the standard library."""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 16_000
DURATION_SECONDS = 0.34
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "src" / "assets" / "audio"


def render(path: Path, frequency: float, seed: int) -> None:
    randomizer = random.Random(seed)
    frame_count = round(SAMPLE_RATE * DURATION_SECONDS)
    frames = bytearray()

    for index in range(frame_count):
        time = index / SAMPLE_RATE
        attack = min(1.0, time / 0.0008)
        envelope = attack * math.exp(-13.5 * time)
        body = (
            0.76 * math.sin(2 * math.pi * frequency * time)
            + 0.42 * math.sin(2 * math.pi * frequency * 1.49 * time + 0.2)
            + 0.24 * math.sin(2 * math.pi * frequency * 2.03 * time + 0.8)
            + 0.12 * math.sin(2 * math.pi * frequency * 3.71 * time)
        )
        knock = randomizer.uniform(-1.0, 1.0) * math.exp(-115 * time)
        sample = max(-1.0, min(1.0, (body * 0.46 + knock * 0.12) * envelope))
        frames.extend(struct.pack("<h", round(sample * 32767)))

    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(frames)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    render(OUTPUT_DIR / "mokugyo-soft.wav", 235.0, 23)
    render(OUTPUT_DIR / "mokugyo-bright.wav", 235.0, 47)


if __name__ == "__main__":
    main()
