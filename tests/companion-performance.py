"""Deterministic optimization parity checks; never load or run real models."""
import hashlib
import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def load_server(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BASELINE = ROOT / 'tests/fixtures/companion-v0616-server.py'
if not BASELINE.is_file():
    BASELINE = ROOT / 'work/performance-v075-baseline/Politifree-Companion/server.py'
BASE = load_server("performance_baseline", BASELINE)
NEW = load_server("performance_updated", ROOT / "outputs/Politifree-Companion/server.py")


class Tokenizer:
    def encode(self, window, hypothesis):
        value = int.from_bytes(hashlib.sha256((window + hypothesis).encode()).digest()[:4], "little")
        return SimpleNamespace(ids=[value], attention_mask=[1], type_ids=[0])


class Session:
    def __init__(self):
        self.calls = 0
        self.fail_at = None

    def get_inputs(self):
        return [SimpleNamespace(name=n) for n in ("input_ids", "attention_mask", "token_type_ids")]

    def run(self, _, inputs):
        self.calls += 1
        if self.calls == self.fail_at:
            raise RuntimeError("injected inference failure")
        value = int(inputs["input_ids"][0, 0])
        return [np.array([[value % 17 / 5, value % 31 / 7, value % 13 / 3]], dtype=np.float32)]


def analyzer(module):
    result = module.Analyzer()
    result.semantic = Session()
    result.tokenizer = Tokenizer()
    result.entailment = 2
    return result


class PerformanceParity(unittest.TestCase):
    def test_semantic_boundaries_transformations_and_original_text(self):
        old, new = analyzer(BASE), analyzer(NEW)
        for length in (7, 8, 999, 1000, 1001, 1149, 1150, 1151, 5999, 6000, 6001):
            text = ("A garden café 世界 engine governor; go pro. " * 160)[:length]
            self.assertEqual(old.classify(text), new.classify(text))
        for text in ("The engine governor controls speed.",
                     "The engine speed controller controls speed.",
                     "I want to go pro in tennis.", "I want to become a professional athlete in tennis.",
                     "We go pro-choice and discuss political advocacy."):
            self.assertEqual(old.classify(text), new.classify(text))

    def test_shared_long_prefix_reuses_exactly_five_windows(self):
        old, new = analyzer(BASE), analyzer(NEW)
        prefix = ("A daily garden journal, café 世界. " * 200)[:5700]
        for tail in ("The council discussed schools.", "The council discussed transport."):
            self.assertEqual(old.classify(prefix + tail), new.classify(prefix + tail))
        self.assertEqual(old.semantic.calls, 36)
        self.assertEqual(new.semantic.calls, 21)
        self.assertEqual(len(new.semantic_window_cache), 7)

    def test_cache_is_bounded_and_cleared_on_unload(self):
        new = analyzer(NEW)
        for i in range(513):
            new.classify(f"Unique independent evidence {i:04d}")
        self.assertEqual(len(new.semantic_window_cache), 512)
        calls = new.semantic.calls
        new.classify("Unique independent evidence 0000")
        self.assertEqual(new.semantic.calls, calls + 3)
        new.unload()
        self.assertEqual(len(new.semantic_window_cache), 0)

    def test_failed_hypothesis_never_caches_partial_window(self):
        new = analyzer(NEW)
        new.semantic.fail_at = 2
        with self.assertRaisesRegex(RuntimeError, "injected"):
            new.classify("Evidence with a failed hypothesis")
        self.assertFalse(new.semantic_window_cache)
        new.semantic.fail_at = None
        new.classify("Evidence with a failed hypothesis")
        self.assertEqual(new.semantic.calls, 5)
        self.assertEqual(len(next(iter(new.semantic_window_cache.values()))), 3)

    def test_ocr_pixels_and_input_ownership(self):
        for size in ((800, 900), (320, 180), (1200, 90), (1900, 1300)):
            original = Image.new("RGB", size, (35, 102, 211))
            captured = []
            for module in (BASE, NEW):
                item = analyzer(module)
                item.ensure_model = lambda kind: None
                pixels = []
                item.ocr = lambda array: (pixels.append((array.shape, hashlib.sha256(array).hexdigest())) or ([], None))
                before = original.tobytes()
                result = item.image_pixels(original, visual=False)
                self.assertEqual(original.size, size)
                self.assertEqual(original.tobytes(), before)
                captured.append((pixels, result))
            self.assertEqual(*captured)

    def test_visual_hash_and_audio_hash_are_identical(self):
        image = Image.new("RGB", (900, 800), (7, 44, 121))
        old_key = hashlib.sha256(image.tobytes() + str(image.size).encode()).hexdigest()
        new = analyzer(NEW)
        expected = {"visualScore": 0, "visualUncertain": False}
        new.visual_cache[old_key] = expected
        self.assertEqual(new.visual_evidence(image), expected)
        for length in (1, 32000, 480000):
            chunk = np.linspace(-1, 1, length, dtype=np.float32)
            for view in (chunk, chunk[:max(1, length - 1)]):
                self.assertEqual(hashlib.sha256(view).digest(), hashlib.sha256(view.tobytes()).digest())


if __name__ == "__main__":
    unittest.main()
