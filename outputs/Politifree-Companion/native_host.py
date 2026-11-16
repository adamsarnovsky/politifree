"""Private Chrome native messaging host. No HTTP listener, token or autostart."""
import base64
import json
import os
from pathlib import Path
import queue
import re
import struct
import sys
import threading
import subprocess
import time

MAX_MESSAGE = 45_000_000
# The shipped native bridge posts at most two requests total, including control
# messages: one active frame and one queued frame. The reader can consequently
# always return to the next header to observe Chrome EOF. An arbitrary producer
# exceeding that protocol bound can delay EOF while byte/count backpressure is
# blocked; Windows cannot observe pipe closure behind unread buffered bytes.
MAX_QUEUED_BYTES = MAX_MESSAGE
IDLE_SECONDS = 90
RECYCLE_RSS_BYTES = 1536 * 1024 * 1024
RECYCLE_MIN_SECONDS = 300
RECYCLE_MIN_JOBS = 8


class ByteBudget:
    """Reserve wire bytes before allocating a queued body; never discard work."""
    def __init__(self, limit=MAX_QUEUED_BYTES):
        self.limit, self.used = limit, 0
        self.condition = threading.Condition()

    def acquire(self, size):
        if size > self.limit: raise ValueError('Message exceeds queue budget')
        with self.condition:
            self.condition.wait_for(lambda: self.used + size <= self.limit)
            self.used += size

    def release(self, size):
        with self.condition:
            self.used -= size
            self.condition.notify_all()


def request_priority(message):
    # Control requests precede inference; captions precede queued media.
    # A running inference remains serialized to protect model state.
    if message.get('action') != 'analyze': return 0
    payload = message.get('payload')
    return 1 if isinstance(payload, dict) and payload.get('kind') == 'text' else 2


def read_exact(stream, size):
    if size <= 0: return b''
    first = stream.read(size)
    if not first: return None
    # Buffered native pipes normally satisfy the entire read. Retain that
    # immutable buffer instead of copying the full message twice more.
    if len(first) == size:
        return first if type(first) is bytes else bytes(first)
    chunks = bytearray(first)
    while len(chunks) < size:
        chunk = stream.read(size - len(chunks))
        if not chunk:
            raise ValueError('Truncated message')
        chunks.extend(chunk)
    return bytes(chunks)


def read_message(stream, budget=None):
    header = read_exact(stream, 4)
    if header is None: return None
    size = struct.unpack('<I', header)[0]
    if size < 2 or size > MAX_MESSAGE: raise ValueError('Invalid message size')
    if budget is not None: budget.acquire(size)
    try:
        body = read_exact(stream, size)
        if body is None: raise ValueError('Truncated message')
        value = json.loads(body)
        if not isinstance(value, dict): raise ValueError('Invalid message')
        return (value, size) if budget is not None else value
    except BaseException:
        if budget is not None: budget.release(size)
        raise


def write_message(stream, value, limit=1_000_000):
    body = json.dumps(value, separators=(',', ':')).encode('utf-8')
    if len(body) > limit: raise ValueError('Result too large')
    stream.write(struct.pack('<I', len(body)) + body); stream.flush()


def handle(analyzer, message):
    action = message.get('action')
    if action == 'health': return {'ready':analyzer.ready, 'serviceAvailable':True, 'version':'0.6.17', 'protocol':2}
    if action == 'stop': analyzer.unload(); return {'ready':False}
    if action == 'start': analyzer.load(); return {'ready':analyzer.ready, 'protocol':2}
    if action != 'analyze': raise ValueError('Unsupported request')
    payload = message.get('payload')
    if not isinstance(payload, dict): raise ValueError('Invalid payload')
    kind = payload.get('kind')
    if kind not in ('text','image','media','live-audio'): raise ValueError('Unsupported media')
    text = payload.get('text', '')
    context = payload.get('context', '')
    if not isinstance(text,str) or not isinstance(context,str) or len(text)>6000 or len(context)>6000: raise ValueError('Invalid text')
    data = None
    if kind != 'text':
        encoded = payload.get('data')
        if not isinstance(encoded,str): raise ValueError('Invalid media')
        data = base64.b64decode(encoded, validate=True)
        if not data or len(data) > (10*1024*1024 if kind == 'image' else 32*1024*1024): raise ValueError('Invalid media size')
    analyzer.load()  # Idempotent, lazy loading on the first actual analysis.
    with analyzer.lock:
        analyzer.release_idle_models()
        if kind == 'text': result = analyzer.classify(text)
        elif kind == 'image': result = analyzer.image(data, context=context, visual=True)
        else: result = analyzer.media(data, live=kind=='live-audio', context=context, visual=True)
    return {**result, 'ready':True, 'protocol':2}


def authorized(origin, root):
    if not re.fullmatch(r'chrome-extension://[a-p]{32}/?', origin): return False
    manifest = json.loads((root / 'app.politifree.engine.json').read_text(encoding='utf-8-sig'))
    return origin.rstrip('/')+'/' in manifest['allowed_origins']


def resident_bytes():
    """Current resident memory, not a historical high-water mark."""
    try:
        if os.name == 'nt':
            import ctypes
            from ctypes import wintypes
            class Counters(ctypes.Structure):
                _fields_ = [('cb', wintypes.DWORD), ('PageFaultCount', wintypes.DWORD)] + [
                    (name, ctypes.c_size_t) for name in ('PeakWorkingSetSize', 'WorkingSetSize',
                    'QuotaPeakPagedPoolUsage', 'QuotaPagedPoolUsage', 'QuotaPeakNonPagedPoolUsage',
                    'QuotaNonPagedPoolUsage', 'PagefileUsage', 'PeakPagefileUsage')]
            counters = Counters()
            counters.cb = ctypes.sizeof(counters)
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.GetCurrentProcess.restype = wintypes.HANDLE
            get_memory = ctypes.WinDLL('psapi', use_last_error=True).GetProcessMemoryInfo
            get_memory.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
            if get_memory(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
                return counters.WorkingSetSize
        else:
            return int(Path('/proc/self/statm').read_text().split()[1]) * os.sysconf('SC_PAGE_SIZE')
    except (OSError, ValueError, IndexError, AttributeError):
        pass
    return 0  # Unknown memory never triggers a speculative recycle.


class WorkerController:
    """The native host imports no inference libraries and owns one serial worker."""
    def __init__(self):
        self.process = None
        self.ready = False
        self.closed = False
        self.started = 0
        self.jobs = 0
        self.lock = threading.Lock()

    def _start(self):
        with self.lock:
            if self.closed: raise RuntimeError('Disconnected')
            if self.process is None or self.process.poll() is not None:
                if self.process is not None:
                    for stream in (self.process.stdin, self.process.stdout):
                        if stream is not None: stream.close()
                self.ready = False
                self.process = subprocess.Popen(
                    [sys.executable, str(Path(__file__).resolve()), '--worker'],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr,
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                self.started, self.jobs = time.monotonic(), 0
            return self.process

    def unload(self, disconnected=False):
        with self.lock:
            if disconnected: self.closed = True
            process, self.process = self.process, None
            self.ready = False
        if process is not None:
            # Called only between jobs, or when Chrome has disconnected. No live
            # request is cancelled merely to reclaim memory.
            try:
                if process.poll() is None: process.terminate()
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait()
            finally:
                for stream in (process.stdin, process.stdout):
                    if stream is not None: stream.close()

    def request(self, message):
        action = message.get('action')
        if action == 'health':
            if self.process is not None and self.process.poll() is not None: self.ready = False
            return {'ready': self.ready, 'serviceAvailable': True, 'version': '0.6.17', 'protocol': 2}
        if action == 'stop':
            self.unload()
            return {'ready': False}
        if action not in ('start', 'analyze'): raise ValueError('Unsupported request')
        process = self._start()
        try:
            write_message(process.stdin, message, MAX_MESSAGE)
            reply = read_message(process.stdout)
            if reply is None: raise RuntimeError('Worker disconnected')
            self.ready = reply.get('ready') is True
            if not reply.get('ok'): raise RuntimeError('Worker analysis failed')
            rss = reply.pop('_residentBytes', 0)
            reply.pop('ok', None)
            if action == 'analyze': self.jobs += 1
            if (rss >= RECYCLE_RSS_BYTES and self.jobs >= RECYCLE_MIN_JOBS and
                    time.monotonic() - self.started >= RECYCLE_MIN_SECONDS):
                self.unload()  # The completed result remains in reply.
                reply['ready'] = False
            return reply
        except Exception:
            self.unload()
            raise


def worker_main():
    output = sys.stdout.buffer
    sys.stdout = sys.stderr
    # Import numerical DLLs before starting the pipe reader: avoids a reproduced
    # Windows initialization deadlock when the reader already blocks on pipe I/O.
    from server import Analyzer
    analyzer = Analyzer()
    # A dedicated pipe reader observes parent death even during inference. The
    # OS closes stdin on controller exit, so a worker cannot remain orphaned.
    incoming = queue.Queue(maxsize=1)
    def reader():
        try:
            while True:
                message = read_message(sys.stdin.buffer)
                if message is None: break
                incoming.put(message)
                del message
        except Exception:
            pass
        finally:
            os._exit(0)
    threading.Thread(target=reader, daemon=True).start()
    while True:
        message = incoming.get()
        try:
            reply = {'ok': True, **handle(analyzer, message)}
        except Exception:
            reply = {'ok': False, 'ready': analyzer.ready}
        reply['_residentBytes'] = resident_bytes()
        write_message(output, reply)
        del message, reply


def main():
    root = Path(__file__).resolve().parent
    if len(sys.argv)<2 or not authorized(sys.argv[1],root): return 1
    if os.name == 'nt':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    output = sys.stdout.buffer
    sys.stdout = sys.stderr
    controller = WorkerController()
    incoming = queue.PriorityQueue(maxsize=4)
    budget = ByteBudget()
    def reader():
        sequence = 0
        try:
            while True:
                framed = read_message(sys.stdin.buffer, budget)
                if framed is None: break
                message, size = framed
                incoming.put((request_priority(message), sequence, message, size))
                sequence += 1
                del message, framed
        except Exception:
            pass
        finally:
            controller.unload(disconnected=True)
            os._exit(0)
    threading.Thread(target=reader, daemon=True).start()
    last_work = time.monotonic()
    try:
        while True:
            remaining = IDLE_SECONDS - (time.monotonic() - last_work)
            if remaining <= 0:
                controller.unload()
                last_work = time.monotonic()
                remaining = IDLE_SECONDS
            try: _, _, message, size = incoming.get(timeout=max(0, remaining))
            except queue.Empty:
                controller.unload()
                last_work = time.monotonic()
                continue
            budget.release(size)
            request_id = message.get('id')
            if type(request_id) is not int or request_id < 1: return 1
            try: reply = {'id': request_id, 'ok': True, **controller.request(message)}
            except Exception:
                reply = {'id': request_id, 'ok': False, 'ready': controller.ready,
                         'error': 'Local analysis could not complete. Ordinary content remains visible.'}
            write_message(output, reply)
            if message.get('action') != 'health': last_work = time.monotonic()
            del message, reply  # Release large media before waiting for more work.
    finally:
        controller.unload(disconnected=True)


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == '--worker':
        if os.name == 'nt':
            import msvcrt
            msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
            msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
        worker_main()
    else:
        raise SystemExit(main())
