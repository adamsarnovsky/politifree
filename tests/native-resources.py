"""Deterministic native resource/lifecycle regression checks, no model packages."""
import base64
import importlib.util
import io
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'outputs/Politifree-Companion/native_host.py'
spec = importlib.util.spec_from_file_location('resource_host', SOURCE)
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class ResourceTests(unittest.TestCase):
    def test_budget_blocks_before_reading_body_and_retains_work(self):
        budget = host.ByteBudget(40)
        budget.acquire(35)
        body = json.dumps({'id': 7}).encode()
        stream = io.BytesIO(struct.pack('<I', len(body)) + body)
        result = []
        thread = threading.Thread(target=lambda: result.append(host.read_message(stream, budget)))
        thread.start()
        time.sleep(.05)
        self.assertEqual(stream.tell(), 4)
        self.assertEqual(budget.used, 35)
        budget.release(35)
        thread.join(2)
        self.assertFalse(thread.is_alive())
        self.assertEqual(result, [({'id': 7}, len(body))])
        budget.release(len(body))
        self.assertEqual(budget.used, 0)

    def test_bad_frame_releases_budget(self):
        budget = host.ByteBudget(40)
        with self.assertRaises(ValueError):
            host.read_message(io.BytesIO(struct.pack('<I', 5) + b'[]'), budget)
        self.assertEqual(budget.used, 0)

    @classmethod
    def setUpClass(cls):
        cls.folder = ROOT / 'work/native-resource-fixture'
        cls.folder.mkdir(parents=True, exist_ok=True)
        (cls.folder / 'native_host.py').write_text(SOURCE.read_text().replace('IDLE_SECONDS = 90', 'IDLE_SECONDS = 0.2'))
        (cls.folder / 'server.py').write_text('''import os, threading, time
from pathlib import Path
class Analyzer:
    ready = False
    lock = threading.RLock()
    def load(self): self.ready = True
    def unload(self): self.ready = False
    def release_idle_models(self): pass
    def classify(self, text):
        if text == 'crash': os._exit(9)
        if text in ('slow', 'brief'):
            Path(__file__).with_name('started').write_text(text)
            time.sleep(30 if text == 'slow' else .2)
        return {'complete': True, 'text': text, 'workerPid': os.getpid()}
    def media(self, data, **kwargs):
        Path(__file__).with_name('started').write_text('media')
        time.sleep(30)
        return {'complete': True}
''')
        (cls.folder / 'app.politifree.engine.json').write_text(json.dumps(
            {'allowed_origins': ['chrome-extension://' + 'a' * 32 + '/']}))
        spec = importlib.util.spec_from_file_location('fixture_host', cls.folder / 'native_host.py')
        cls.fixture_host = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.fixture_host)

    def analyze(self, controller, text='hello'):
        return controller.request({'action': 'analyze', 'payload': {'kind': 'text', 'text': text}})

    def test_lazy_health_stop_crash_restart_and_recycle(self):
        module = self.fixture_host
        controller = module.WorkerController()
        try:
            self.assertFalse(controller.request({'action': 'health'})['ready'])
            self.assertIsNone(controller.process)
            first = self.analyze(controller)
            process = controller.process
            self.assertTrue(first['complete'])
            self.assertTrue(controller.request({'action': 'health'})['ready'])
            controller.request({'action': 'stop'})
            self.assertIsNotNone(process.poll())
            self.assertFalse(controller.ready)
            self.assertTrue(controller.request({'action': 'start'})['ready'])
            with self.assertRaises(RuntimeError): self.analyze(controller, 'crash')
            self.assertIsNone(controller.process)
            self.assertFalse(controller.ready)
            self.assertTrue(self.analyze(controller)['complete'])
            module.RECYCLE_RSS_BYTES = 0
            module.RECYCLE_MIN_JOBS = 2
            module.RECYCLE_MIN_SECONDS = 0
            completed = self.analyze(controller, 'retain completed result')
            self.assertEqual(completed['text'], 'retain completed result')
            self.assertIsNone(controller.process)
            self.assertFalse(completed['ready'])
            self.assertTrue(self.analyze(controller)['complete'])
            self.assertIsNotNone(controller.process)  # Never recycle every job.
        finally:
            controller.unload(disconnected=True)
            module.RECYCLE_RSS_BYTES = host.RECYCLE_RSS_BYTES
            module.RECYCLE_MIN_JOBS = host.RECYCLE_MIN_JOBS
            module.RECYCLE_MIN_SECONDS = host.RECYCLE_MIN_SECONDS
        with self.assertRaises(RuntimeError): self.analyze(controller)

    def test_controller_pipe_eof_exits_running_worker(self):
        controller = self.fixture_host.WorkerController()
        self.analyze(controller)
        process = controller.process
        try:
            marker = self.folder / 'started'
            marker.unlink(missing_ok=True)
            host.write_message(process.stdin, {'action': 'analyze', 'payload': {'kind': 'text', 'text': 'slow'}})
            self.wait_started(marker)
            process.stdin.close()  # Simulates unexpected controller death.
            process.wait(timeout=5)
            self.assertEqual(process.returncode, 0)
        finally:
            controller.unload(disconnected=True)

    def wait_started(self, marker):
        deadline = time.monotonic() + 5
        while not marker.exists() and time.monotonic() < deadline: time.sleep(.01)
        self.assertTrue(marker.exists())

    def test_two_maximum_frames_eof_during_inference(self):
        # The shipped bridge posts <=2 total requests, including controls. This
        # maximum-size valid-media test proves EOF remains observable at that
        # protocol bound while a worker is actively blocked in inference.
        process = subprocess.Popen([sys.executable, str(self.folder / 'native_host.py'),
            'chrome-extension://' + 'a' * 32 + '/'], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        marker = self.folder / 'started'
        marker.unlink(missing_ok=True)
        try:
            payload = {'kind': 'media', 'data': base64.b64encode(b'x' * (32*1024*1024)).decode(), 'padding': ''}
            message = {'id': 1, 'action': 'analyze', 'payload': payload}
            size = len(json.dumps(message, separators=(',', ':')).encode())
            payload['padding'] = 'x' * (host.MAX_MESSAGE - size)
            host.write_message(process.stdin, message, host.MAX_MESSAGE)
            self.wait_started(marker)
            message['id'] = 2
            host.write_message(process.stdin, message, host.MAX_MESSAGE)
            process.stdin.close()
            process.wait(timeout=5)
            self.assertEqual(process.returncode, 0)
        finally:
            if process.poll() is None: process.kill(); process.wait()
            process.stdout.close()

    def test_pending_stop_preserves_result_and_health_does_not_extend_idle(self):
        process = subprocess.Popen([sys.executable, str(self.folder / 'native_host.py'),
            'chrome-extension://' + 'a' * 32 + '/'], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            marker = self.folder / 'started'
            marker.unlink(missing_ok=True)
            host.write_message(process.stdin, {'id': 1, 'action': 'analyze',
                'payload': {'kind': 'text', 'text': 'brief'}})
            self.wait_started(marker)
            host.write_message(process.stdin, {'id': 2, 'action': 'stop'})
            first, stop = host.read_message(process.stdout), host.read_message(process.stdout)
            self.assertEqual(first['id'], 1)
            self.assertTrue(first['complete'])
            self.assertEqual(stop['id'], 2)
            self.assertFalse(stop['ready'])
            host.write_message(process.stdin, {'id': 3, 'action': 'start'})
            self.assertTrue(host.read_message(process.stdout)['ready'])
            states = []
            for request_id in range(4, 12):
                time.sleep(.05)
                host.write_message(process.stdin, {'id': request_id, 'action': 'health'})
                states.append(host.read_message(process.stdout)['ready'])
            self.assertFalse(states[-1])
        finally:
            process.stdin.close()
            process.wait(timeout=5)
            process.stdout.close()

    def test_chrome_eof_exits_controller_and_worker(self):
        process = subprocess.Popen([sys.executable, str(self.folder / 'native_host.py'),
            'chrome-extension://' + 'a' * 32 + '/'], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            host.write_message(process.stdin, {'id': 1, 'action': 'health'})
            self.assertFalse(host.read_message(process.stdout)['ready'])
            host.write_message(process.stdin, {'id': 2, 'action': 'analyze',
                'payload': {'kind': 'text', 'text': 'hello'}})
            self.assertTrue(host.read_message(process.stdout)['complete'])
            marker = self.folder / 'started'
            marker.unlink(missing_ok=True)
            host.write_message(process.stdin, {'id': 3, 'action': 'analyze',
                'payload': {'kind': 'text', 'text': 'slow'}})
            self.wait_started(marker)
            process.stdin.close()
            process.wait(timeout=5)
            self.assertEqual(process.returncode, 0)
        finally:
            if process.poll() is None: process.kill(); process.wait()
            process.stdout.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
