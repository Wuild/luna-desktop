#!/usr/bin/env python3
"""Follow the selected MPRIS app and capture only its playback stream."""
import ctypes
import os
import cmath
import json
import math
import signal
import struct
import subprocess
import sys
import select
import time
import threading

RATE = 22050
SIZE = 1024
HOP = round(RATE / 60)
WINDOW = [0.5 - 0.5 * math.cos(2 * math.pi * i / (SIZE - 1)) for i in range(SIZE)]

def levels(samples, bars=24, sensitivity=1):
    data = [complex(v * WINDOW[i]) for i, v in enumerate(samples)]
    j = 0
    for i in range(1, SIZE):
        bit = SIZE >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            data[i], data[j] = data[j], data[i]
    length = 2
    while length <= SIZE:
        step = cmath.exp(-2j * math.pi / length)
        for start in range(0, SIZE, length):
            phase = 1
            for i in range(start, start + length // 2):
                a, b = data[i], data[i + length // 2] * phase
                data[i], data[i + length // 2] = a + b, a - b
                phase *= step
        length *= 2
    result = []
    for band in range(bars):
        low = max(1, int(50 * (10000 / 50) ** (band / bars) * SIZE / RATE))
        high = min(SIZE // 2, max(low + 1, int(50 * (10000 / 50) ** ((band + 1) / bars) * SIZE / RATE)))
        amplitude = max((abs(value) * 4 / SIZE for value in data[low:high]), default=0)
        db = 20 * math.log10(max(1e-9, amplitude * sensitivity))
        # Keep fixed gain: automatic normalization would flatten loud sections.
        # Suppress the quiet floor while preserving headroom for strong peaks.
        level = max(0, min(1, (db + 55) / 50)) ** 1.7
        result.append(round(level, 3))
    return result

def app_id(value):
    return str(value or '').lower().removesuffix('.desktop')


def choose_stream(streams, player):
    """Prefer the bus owner's PID; app IDs cover sandbox/browser audio processes."""
    identities = {app_id(player.get('DesktopEntry')), app_id(player.get('Identity'))}
    identities.add(app_id(player.get('name', '').removeprefix('org.mpris.MediaPlayer2.').split('.')[0]))
    identities.discard('')
    matches = []
    for stream in streams:
        if stream.get('corked') in (True, 'yes'):
            continue
        props = stream.get('properties', {})
        pid_match = bool(player.get('pid')) and str(props.get('application.process.id')) == str(player['pid'])
        names = {app_id(props.get(key)) for key in
                 ('application.id', 'application.name', 'application.process.binary', 'application.desktop')}
        if pid_match or identities.intersection(names):
            matches.append((2 if pid_match else 1, stream))
    return max(matches, key=lambda item: item[0])[1] if matches else None


def audio_source(player):
    def listing(kind):
        result = subprocess.run(['pactl', '--format=json', 'list', kind],
                                capture_output=True, text=True, timeout=2, check=True)
        return json.loads(result.stdout)
    stream = choose_stream(listing('sink-inputs'), player)
    if stream is None:
        return None
    sink = next((sink for sink in listing('sinks') if str(sink['index']) == str(stream['sink'])), None)
    if sink is None or not sink.get('monitor_source'):
        return None
    return str(stream['index']), str(sink['monitor_source'])


def latest_window(buffer, hop=HOP):
    """Skip queued old frames after a stall, retaining overlap for the next FFT."""
    end = len(buffer) - len(buffer) % 4
    if end < SIZE * 4:
        return None, buffer
    return buffer[end - SIZE * 4:end], buffer[end - max(0, SIZE - hop) * 4:]


class SourceWatcher:
    """Never block PCM processing on pactl or an unresponsive audio server."""
    def __init__(self, player):
        self.result = (None, 'Waiting for selected app audio')
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.watch, args=(player,), daemon=True)
        self.thread.start()

    def watch(self, player):
        while not self.stopped.is_set():
            try:
                self.result = (audio_source(player), 'Waiting for selected app audio')
            except (OSError, ValueError, subprocess.SubprocessError):
                self.result = (None, 'Audio server unavailable (requires PulseAudio or PipeWire PulseAudio support)')
            self.stopped.wait(1)

    def close(self):
        self.stopped.set()


def main():
    bars = max(8, min(48, int(sys.argv[1]) if len(sys.argv) > 1 else 24))
    player = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    sensitivity = max(0.25, min(3, float(sys.argv[3]) if len(sys.argv) > 3 else 1))
    update_rate = max(10, min(60, float(sys.argv[4]) if len(sys.argv) > 4 else 60))
    hop = round(RATE / update_rate)
    next_frame = 0
    process = None
    source = None
    retry_at = 0
    buffer = b''
    last_status = None

    def status(message):
        nonlocal last_status
        if message != last_status:
            print(json.dumps({'status': message}), flush=True)
            last_status = message

    def close_capture():
        nonlocal process, buffer
        if process:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            process.stdout.close()
            process = None
        buffer = b''

    def stop(*_args):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    parent = os.getppid()
    ctypes.CDLL(None).prctl(1, signal.SIGTERM, 0, 0, 0)
    if os.getppid() != parent:
        return
    watcher = SourceWatcher(player)
    last_audio = time.monotonic()
    try:
        while True:
            now = time.monotonic()
            selected, message = watcher.result
            if selected != source:
                close_capture()
                source = selected
                retry_at = 0
            if process and process.poll() is not None:
                close_capture()
                retry_at = now + 1
            if source and process is None and now >= retry_at:
                index, monitor = source
                process = subprocess.Popen(['parec', f'--device={monitor}', f'--monitor-stream={index}',
                    '--format=float32le', f'--rate={RATE}', '--channels=1', '--latency-msec=20',
                    '--process-time-msec=10', '--client-name=LunaDesktop Visualizer',
                    '--stream-name=Selected player spectrum'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                last_audio = now
                status('Live spectrum of the selected app')
            if not source:
                status(message)
            if process is None:
                time.sleep(0.1)
                continue
            if not select.select([process.stdout], [], [], 0.1)[0]:
                if now - last_audio > 1:
                    status('Waiting for selected app audio')
                continue
            chunk = os.read(process.stdout.fileno(), 65536)
            if not chunk:
                close_capture()
                retry_at = now + 1
                status('Player audio capture stopped; retrying')
                continue
            last_audio = time.monotonic()
            buffer += chunk
            if last_audio < next_frame:
                buffer = buffer[-SIZE * 4:]
                continue
            data, buffer = latest_window(buffer, hop)
            if data is not None:
                next_frame = last_audio + 1 / update_rate
                status('Live spectrum of the selected app')
                print(json.dumps({'levels': levels(struct.unpack(f'<{SIZE}f', data), bars, sensitivity),
                                  'time': time.monotonic()}), flush=True)
    except BrokenPipeError:
        pass
    finally:
        watcher.close()
        close_capture()


if __name__ == '__main__':
    main()
