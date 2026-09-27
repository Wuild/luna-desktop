#!/usr/bin/python3
"""Synthetic pactl/parec data; only used by the capture lifecycle test."""
import json
import math
import os
import struct
import sys
import time

if os.path.basename(sys.argv[0]) == 'pactl':
    data = ([{'index': 7, 'sink': 8, 'properties': {'application.id': 'org.test.Player'}}]
            if sys.argv[-1] == 'sink-inputs' else [{'index': 8, 'monitor_source': 'test.monitor'}])
    print(json.dumps(data))
else:
    assert '--device=test.monitor' in sys.argv and '--monitor-stream=7' in sys.argv
    wave = struct.pack('<1024f', *(0.4 * math.sin(2 * math.pi * 1000 * i / 22050) for i in range(1024)))
    try:
        while True:
            sys.stdout.buffer.write(wave)
            sys.stdout.buffer.flush()
            time.sleep(0.02)
    except BrokenPipeError:
        pass
