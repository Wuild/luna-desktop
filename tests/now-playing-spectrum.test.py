import importlib.util
from pathlib import Path
import math
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('spectrum', Path(__file__).resolve().parents[1] / 'dist/desktop/widgets/now-playing/spectrum.py')
spectrum = importlib.util.module_from_spec(spec)
spec.loader.exec_module(spectrum)

class SpectrumTest(unittest.TestCase):
    def test_selection(self):
        streams = [dict(index=1, properties={'application.name': 'Unrelated'}),
                   dict(index=2, properties={'application.name': 'Firefox'}),
                   dict(index=3, properties={'application.process.id': '123'})]
        player = dict(Identity='Firefox', pid=123)
        self.assertEqual(spectrum.choose_stream(streams, player)['index'], 3)
        streams[2]['corked'] = True
        self.assertEqual(spectrum.choose_stream(streams, player)['index'], 2)
        self.assertIsNone(spectrum.choose_stream(streams[:1], player))
        self.assertIsNone(spectrum.choose_stream(streams, {}))

    def test_output_routing(self):
        import json
        from types import SimpleNamespace
        responses = [SimpleNamespace(stdout=json.dumps([dict(index=7, sink=8, properties={'application.id':'org.test.Player'})])),
                     SimpleNamespace(stdout=json.dumps([dict(index=9, monitor_source='wrong.monitor'), dict(index=8, monitor_source='headphones.monitor')]))]
        with patch.object(spectrum.subprocess, 'run', side_effect=responses):
            self.assertEqual(spectrum.audio_source({'DesktopEntry':'org.test.Player.desktop'}), ('7', 'headphones.monitor'))

    def test_backlog_is_discarded(self):
        import struct
        samples = list(range(spectrum.SIZE * 4))
        raw = struct.pack(f'<{len(samples)}f', *samples) + b'xx'
        frame, retained = spectrum.latest_window(raw)
        self.assertEqual(struct.unpack(f'<{spectrum.SIZE}f', frame), tuple(samples[-spectrum.SIZE:]))
        self.assertEqual(len(retained), (spectrum.SIZE - spectrum.HOP) * 4 + 2)
        self.assertIsNone(spectrum.latest_window(retained)[0])

    def test_dynamic_contrast(self):
        tone = lambda amplitude: [amplitude * math.sin(2 * math.pi * 1000 * i / spectrum.RATE) for i in range(spectrum.SIZE)]
        quiet = max(spectrum.levels(tone(0.01)))
        loud = max(spectrum.levels(tone(0.4)))
        self.assertGreater(loud, quiet * 4)
        self.assertGreater(loud, 0.8)
        self.assertGreater(max(spectrum.levels(tone(0.05), sensitivity=2)), max(spectrum.levels(tone(0.05))))

    def test_signal(self):
        self.assertEqual(spectrum.levels([0] * spectrum.SIZE), [0] * 24)
        wave = [0.2 * math.sin(2 * math.pi * 1000 * i / spectrum.RATE) for i in range(spectrum.SIZE)]
        levels = spectrum.levels(wave)
        self.assertGreater(max(levels), 0.5)
        self.assertTrue(all(0 <= v <= 1 for v in levels))

if __name__ == '__main__': unittest.main()
