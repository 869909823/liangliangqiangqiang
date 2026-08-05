"""Generate two mellow, original wooden-fish WAV effects with the standard library.

从「尖锐短促」调整为「低沉空灵」：
- 采样率 16k -> 44.1k，时长 0.72s -> 1.4s（容纳混响尾音）
- 基频 175Hz -> soft 104Hz / bright 128Hz
- 删除 5 次谐波；高次谐波独立更快衰减，模拟木头阻尼
- 主包络 exp(-7.2t) -> exp(-3.1t)，余韵拉长
- 敲击瞬态改为低通后的噪声，闷实的「咚」头
- 新增一阶低通（约 900Hz）与 Schroeder 混响（4 路 comb + 1 路 allpass）
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 44_100
DURATION_SECONDS = 1.4
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "src" / "assets" / "audio"


def lowpass(samples: list[float], cutoff: float, sample_rate: int) -> list[float]:
    """一阶低通滤波，用于整体去毛刺。"""
    dt = 1.0 / sample_rate
    alpha = dt / (dt + 1.0 / (2 * math.pi * cutoff))
    out: list[float] = []
    previous = 0.0
    for sample in samples:
        previous += alpha * (sample - previous)
        out.append(previous)
    return out


def comb(samples: list[float], delay: int, feedback: float) -> list[float]:
    """反馈式梳状滤波器：y[n] = x[n] + g * y[n - D]。"""
    out: list[float] = []
    for index, sample in enumerate(samples):
        delayed = out[index - delay] if index - delay >= 0 else 0.0
        out.append(sample + delayed * feedback)
    return out


def allpass(samples: list[float], delay: int, gain: float) -> list[float]:
    """全通滤波器：y[n] = -g * x[n] + x[n - D] + g * y[n - D]。"""
    out: list[float] = []
    for index, sample in enumerate(samples):
        past_input = samples[index - delay] if index - delay >= 0 else 0.0
        past_output = out[index - delay] if index - delay >= 0 else 0.0
        out.append(-gain * sample + past_input + gain * past_output)
    return out


def render(path: Path, frequency: float, seed: int) -> None:
    randomizer = random.Random(seed)
    frame_count = round(SAMPLE_RATE * DURATION_SECONDS)
    # 谐波：(倍频, 幅度, 相位)。删掉 5 次谐波，去掉刺耳高频。
    harmonics = [(1.0, 0.72, 0.0), (2.0, 0.16, 0.2), (2.76, 0.07, 0.8), (4.1, 0.025, 1.4)]
    dry: list[float] = []

    for index in range(frame_count):
        time = index / SAMPLE_RATE
        attack = min(1.0, time / 0.0008)
        envelope = attack * math.exp(-3.1 * time)
        pitch = frequency * (1.0 + 0.06 * math.exp(-40.0 * time))
        body = 0.0
        for k, amp, phase in harmonics:
            decay = math.exp(-(3.1 + 2.4 * (k - 1.0)) * time)
            body += amp * decay * math.sin(2 * math.pi * pitch * k * time + phase)
        knock = randomizer.uniform(-1.0, 1.0) * math.exp(-120.0 * time)
        dry.append((body * 0.55 + knock * 0.035) * envelope)

    body = lowpass(dry, 900.0, SAMPLE_RATE)

    # Schroeder 混响：4 路 comb 并联求和，再接 1 路 allpass 染色，wet 取 0.28。
    comb_delays = [round(d * SAMPLE_RATE / 1000) for d in (37, 43, 53, 61)]
    comb_feedback = [0.35, 0.31, 0.27, 0.24]
    wet = [0.0] * frame_count
    for delay, feedback in zip(comb_delays, comb_feedback):
        tail = comb(body, delay, feedback)
        for index, value in enumerate(tail):
            wet[index] += value
    wet = allpass(wet, round(5 * SAMPLE_RATE / 1000), 0.5)

    frames = bytearray()
    for index, sample in enumerate(body):
        mixed = max(-1.0, min(1.0, sample + wet[index] * 0.28))
        frames.extend(struct.pack("<h", round(mixed * 32767)))

    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(frames)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    render(OUTPUT_DIR / "mokugyo-soft.wav", 104.0, 23)
    render(OUTPUT_DIR / "mokugyo-bright.wav", 128.0, 47)


if __name__ == "__main__":
    main()
