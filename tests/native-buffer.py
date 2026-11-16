"""Focused regression tests for the native host's exact-read fast path.

Run with the repository root as cwd, or set POLITIFREE_NATIVE_HOST to a
different native_host.py (for example the saved v0.7.5 baseline).
"""
import importlib.util
import io
import os
from pathlib import Path
import struct
import unittest


ROOT = Path(__file__).resolve().parents[1]
HOST_PATH = Path(os.environ.get(
    "POLITIFREE_NATIVE_HOST",
    ROOT / "outputs" / "Politifree-Companion" / "native_host.py",
)).resolve()
spec = importlib.util.spec_from_file_location("native_host_under_test", HOST_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load native host at {HOST_PATH}")
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class ObjectStream:
    """Stream that can return a known bytes object without copying it."""
    def __init__(self, data):
        self.data = data
        self.read_sizes = []

    def read(self, size=-1):
        self.read_sizes.append(size)
        if len(self.data) > size:
            raise AssertionError("test requested more bytes than the stream contains")
        return self.data


class ChunkStream:
    def __init__(self, chunks):
        self.chunks = iter(chunks)

    def read(self, size=-1):
        try:
            chunk = next(self.chunks)
        except StopIteration:
            return b""
        if len(chunk) > size:
            raise AssertionError("chunk exceeds requested read size")
        return chunk


class ReadExactTests(unittest.TestCase):
    def test_full_read_returns_original_bytes_object(self):
        payload = bytes(bytearray(b"complete message body"))
        stream = ObjectStream(payload)
        self.assertIs(host.read_exact(stream, len(payload)), payload)
        self.assertEqual(stream.read_sizes, [len(payload)])

    def test_fragmented_reads_preserve_exact_bytes(self):
        expected = b"abcdefghi"
        for chunks in ([b"a", b"bc", b"def", b"ghi"],
                       [b"abcd", b"efghi"], [b"ab", b"cdefgh", b"i"]):
            with self.subTest(chunks=chunks):
                self.assertEqual(host.read_exact(ChunkStream(chunks), len(expected)), expected)

    def test_empty_stream_is_clean_eof(self):
        self.assertIsNone(host.read_exact(ChunkStream([]), 4))

    def test_partial_stream_is_truncated(self):
        with self.assertRaisesRegex(ValueError, "Truncated message"):
            host.read_exact(ChunkStream([b"ab", b"c"]), 4)


class ReadMessageTests(unittest.TestCase):
    @staticmethod
    def frame(body):
        return struct.pack("<I", len(body)) + body

    def test_valid_message_and_budget_accounting(self):
        value = {"action": "analyze", "payload": {"kind": "text", "text": "hello"}}
        body = host.json.dumps(value, separators=(",", ":")).encode("utf-8")
        budget = host.ByteBudget(limit=len(body))
        self.assertEqual(host.read_message(io.BytesIO(self.frame(body)), budget), (value, len(body)))
        self.assertEqual(budget.used, len(body))
        self.assertEqual(host.read_message(io.BytesIO(self.frame(body))), value)

    def test_clean_eof_and_truncated_header(self):
        self.assertIsNone(host.read_message(io.BytesIO(b"")))
        with self.assertRaisesRegex(ValueError, "Truncated message"):
            host.read_message(io.BytesIO(b"\x01\x00"))

    def test_truncated_body_releases_budget(self):
        budget = host.ByteBudget()
        with self.assertRaisesRegex(ValueError, "Truncated message"):
            host.read_message(io.BytesIO(struct.pack("<I", 8) + b"{}"), budget)
        self.assertEqual(budget.used, 0)

    def test_rejects_invalid_wire_sizes(self):
        for size in (0, 1, host.MAX_MESSAGE + 1):
            with self.subTest(size=size), self.assertRaisesRegex(ValueError, "Invalid message size"):
                host.read_message(io.BytesIO(struct.pack("<I", size)))

    def test_json_and_object_validation_release_budget(self):
        invalid_bodies = (
            b"{bad json}",
            b"\xff\xfe",  # invalid UTF-8
            b"[]",          # valid JSON, wrong message type
            b"null",
        )
        for body in invalid_bodies:
            with self.subTest(body=body):
                budget = host.ByteBudget()
                with self.assertRaises((ValueError, UnicodeDecodeError)):
                    host.read_message(io.BytesIO(self.frame(body)), budget)
                self.assertEqual(budget.used, 0)


if __name__ == "__main__":
    unittest.main()
